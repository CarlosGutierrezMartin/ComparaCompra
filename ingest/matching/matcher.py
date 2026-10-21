"""Emparejamiento de productos de cadena con productos canónicos (docs/SPEC.md, H2).

Cada producto de cadena se enlaza hasta con tres productos canónicos, uno por nivel:
- genérico: la hoja de la taxonomía ("Pechuga de pollo");
- equivalente: hoja + variante + marcas ("Leche semidesnatada sin lactosa");
- idéntico: lo anterior + marca + formato ("Coca-Cola Zero, 2 l"). Solo marcas de
  fabricante: dos marcas blancas de cadenas distintas nunca son el mismo producto.

Una línea de la lista apunta a un canónico y un nivel; el motor de cesta busca en
cada cadena los productos enlazados con ese canónico.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from decimal import Decimal

from .classify_llm import ProductIn, classify_batch
from .classify_rules import Classification, classify
from .differentiators import differentiators
from .embeddings import Embedder, HashingEmbedder, cosine, product_text
from .formats import ParsedFormat
from .llm import StructuredLLM
from .normalize import clean, is_own_brand, normalize_brand, remove_format
from .taxonomy import BY_SLUG
from .verify import verify_pair

IDENTICAL_SIMILARITY = 0.85  # por encima, idéntico por regla
DOUBTFUL_SIMILARITY = 0.6  # entre ambos, se verifica con IA o va a revisión
VERIFY_CONFIDENCE = 0.8
# El enlace equivalente pide más seguridad que el genérico: equivocarse ahí cambia el
# producto que el usuario compra.
EQUIVALENT_CONFIDENCE = {"rule": 0.9, "model": 0.8, "human": 0.0}


@dataclass(frozen=True)
class Item:
    chain: str
    external_id: str
    name: str
    brand: str | None = None
    quantity: Decimal | None = None
    unit: str | None = None
    units_per_pack: int = 1
    category_ref: str | None = None

    @property
    def key(self) -> tuple[str, str]:
        return (self.chain, self.external_id)

    @property
    def fmt(self) -> ParsedFormat | None:
        if self.quantity is None or self.unit is None:
            return None
        return ParsedFormat(self.quantity, self.unit, self.units_per_pack)  # type: ignore[arg-type]


@dataclass
class Canonical:
    key: str
    level: str  # generic | equivalent | identical
    leaf: str
    name: str
    attributes: dict[str, object]


@dataclass
class Link:
    item: tuple[str, str]
    canonical: str
    level: str
    confidence: float
    source: str  # rule | model | human


@dataclass
class Review:
    item: tuple[str, str]
    reason: str
    proposed_canonical: str | None = None
    proposed_level: str | None = None
    confidence: float | None = None
    other_item: tuple[str, str] | None = None


@dataclass
class MatchResult:
    classifications: dict[tuple[str, str], Classification] = field(default_factory=dict)
    brands: dict[tuple[str, str], str | None] = field(default_factory=dict)
    canonicals: dict[str, Canonical] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)
    reviews: list[Review] = field(default_factory=list)

    def canonical_of(self, item: tuple[str, str], level: str) -> str | None:
        for link in self.links:
            if link.item == item and link.level == level:
                return link.canonical
        return None


def own_traits(name: str, leaf: str) -> tuple[str, ...]:
    """Rasgos diferenciadores del producto, sin los que ya forman parte de la hoja
    ("Garbanzos cocidos" no se separa de sí misma por el rasgo "cocinado")."""
    section = BY_SLUG[leaf].section
    inherent = set(differentiators(BY_SLUG[leaf].name, section))
    return tuple(t for t in differentiators(name, section) if t not in inherent)


def generic_key(leaf: str) -> str:
    return f"g:{leaf}"


def equivalent_key(
    leaf: str, variant: str | None, flags: Iterable[str], traits: Iterable[str] = ()
) -> str:
    return f"e:{leaf}|{variant or ''}|{','.join(sorted(flags))}|{','.join(sorted(traits))}"


def equivalent_name(
    leaf: str, variant: str | None, flags: Iterable[str], traits: Iterable[str] = ()
) -> str:
    parts = [BY_SLUG[leaf].name]
    if variant:
        parts.append(variant)
    parts += [f.replace("_", " ") for f in sorted({*flags, *traits})]
    return " ".join(parts)


def brand_lexicon(items: Iterable[Item]) -> set[str]:
    """Marcas de fabricante conocidas: las que publican Dia y Alcampo en su campo marca."""
    lex = set()
    for it in items:
        b = normalize_brand(it.brand)
        if b and len(b) >= 3 and not is_own_brand(b):
            lex.add(b)
    return lex


def infer_brand(item: Item, lexicon: set[str]) -> str | None:
    """Marca del producto; si la cadena no la da (Mercadona), se busca en el nombre."""
    if item.brand:
        return _shortest_alias(normalize_brand(item.brand), lexicon)
    name = f" {clean(item.name)} "
    found = [b for b in lexicon if f" {b} " in name]
    return _shortest_alias(max(found, key=len), lexicon) if found else None


def _shortest_alias(brand: str | None, lexicon: set[str]) -> str | None:
    """ "central lechera asturiana" y "asturiana" son la misma marca: se usa la más corta
    del léxico cuyas palabras estén todas en la marca (mínimo 6 letras, para no confundir)."""
    if brand is None:
        return None
    words = set(brand.split())
    aliases = [b for b in lexicon if len(b) >= 6 and set(b.split()) <= words]
    return min(aliases, key=len) if aliases else brand


def match(
    items: list[Item],
    *,
    llm: StructuredLLM | None = None,
    embedder: Embedder | None = None,
    classifier: Callable[[str, str, str | None], Classification] = classify,
) -> MatchResult:
    result = MatchResult()
    embedder = embedder or HashingEmbedder()
    lexicon = brand_lexicon(items)

    # 1. Clasificación: reglas y, para lo dudoso, IA por lotes.
    pending: list[Item] = []
    for it in items:
        c = classifier(it.name, it.category_ref or "", it.brand)
        result.classifications[it.key] = c
        if not c.accepted:
            pending.append(it)
    if llm is not None and pending:
        model = classify_batch(
            llm,
            [
                ProductIn(
                    id=f"{it.chain}:{it.external_id}",
                    nombre=it.name,
                    marca=it.brand,
                    categoria_cadena=it.category_ref,
                )
                for it in pending
            ],
        )
        for it in pending:
            c = model.get(f"{it.chain}:{it.external_id}")
            if c is not None and c.accepted:
                result.classifications[it.key] = c

    # 2. Enlaces genérico y equivalente.
    for it in items:
        c = result.classifications[it.key]
        result.brands[it.key] = infer_brand(it, lexicon)
        if not c.accepted or c.leaf is None:
            result.reviews.append(
                Review(
                    item=it.key,
                    reason="clasificacion_dudosa",
                    proposed_canonical=generic_key(c.leaf) if c.leaf else None,
                    proposed_level="generic" if c.leaf else None,
                    confidence=c.confidence,
                )
            )
            continue
        gk = generic_key(c.leaf)
        result.canonicals.setdefault(gk, Canonical(gk, "generic", c.leaf, BY_SLUG[c.leaf].name, {}))
        result.links.append(Link(it.key, gk, "generic", c.confidence, c.source))
        if c.confidence < EQUIVALENT_CONFIDENCE[c.source]:
            continue
        traits = own_traits(it.name, c.leaf)
        ek = equivalent_key(c.leaf, c.variant, c.flags, traits)
        result.canonicals.setdefault(
            ek,
            Canonical(
                ek,
                "equivalent",
                c.leaf,
                equivalent_name(c.leaf, c.variant, c.flags, traits),
                {"variant": c.variant, "flags": sorted(c.flags), "traits": list(traits)},
            ),
        )
        result.links.append(Link(it.key, ek, "equivalent", c.confidence, c.source))

    # 3. Idénticos: misma hoja, variante, marcas, marca de fabricante y formato.
    groups: dict[tuple, list[Item]] = defaultdict(list)
    for it in items:
        c = result.classifications[it.key]
        brand = result.brands[it.key]
        fmt = it.fmt
        if not c.accepted or c.leaf is None or not brand or is_own_brand(brand) or fmt is None:
            continue
        total = fmt.total.quantize(Decimal("1")) if fmt.unit != "unit" else fmt.total
        gkey = (
            c.leaf,
            c.variant,
            tuple(sorted(c.flags)),
            brand,
            fmt.unit,
            total,
            fmt.units_per_pack,
            own_traits(it.name, c.leaf),
        )
        groups[gkey].append(it)

    for gkey, members in groups.items():
        _identical_clusters(result, gkey, members, embedder, llm)
    return result


def _identical_clusters(
    result: MatchResult,
    gkey: tuple,
    members: list[Item],
    embedder: Embedder,
    llm: StructuredLLM | None,
) -> None:
    leaf, variant, flags, brand, unit, total, units, _traits = gkey
    # Se compara el nombre sin la marca, tal como la escribe la cadena y normalizada.
    texts = [product_text(product_text(m.name, m.brand), result.brands[m.key]) for m in members]
    vectors = embedder.embed(texts)
    parent = list(range(len(members)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    confidence: dict[int, float] = {i: 1.0 for i in range(len(members))}
    source: dict[int, str] = {i: "rule" for i in range(len(members))}
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            if members[i].chain == members[j].chain:
                continue  # dentro de una cadena, cada referencia es un producto
            sim = cosine(vectors[i], vectors[j])
            if sim >= IDENTICAL_SIMILARITY:
                parent[find(j)] = find(i)
                confidence[j] = min(confidence[j], round(sim, 3))
            elif sim >= DOUBTFUL_SIMILARITY:
                verdict = verify_pair(llm, members[i].name, members[j].name) if llm else None
                if (
                    verdict
                    and verdict.nivel == "identico"
                    and verdict.confianza >= VERIFY_CONFIDENCE
                ):
                    parent[find(j)] = find(i)
                    confidence[j] = min(confidence[j], verdict.confianza)
                    source[j] = "model"
                elif verdict is None:
                    result.reviews.append(
                        Review(
                            item=members[j].key,
                            other_item=members[i].key,
                            reason="identico_dudoso",
                            proposed_level="identical",
                            confidence=round(sim, 3),
                        )
                    )

    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(len(members)):
        clusters[find(i)].append(i)
    for root, idxs in clusters.items():
        rep = members[root]
        ik = f"i:{leaf}|{variant or ''}|{','.join(flags)}|{brand}|{total}{unit}x{units}|{rep.chain}:{rep.external_id}"
        display = re.sub(r"\s+", " ", remove_format(rep.name)).strip().capitalize()
        result.canonicals[ik] = Canonical(
            ik,
            "identical",
            leaf,
            display,
            {
                "brand": brand,
                "variant": variant,
                "flags": list(flags),
                "format": {"total": str(total), "unit": unit, "units_per_pack": units},
            },
        )
        for i in idxs:
            result.links.append(Link(members[i].key, ik, "identical", confidence[i], source[i]))
