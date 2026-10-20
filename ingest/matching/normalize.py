"""Normalización determinista de nombres de producto."""

from __future__ import annotations

import re
import unicodedata

from .formats import _MULTI, _MULTI_REV, _PACK, _SINGLE, ParsedFormat

# Marcas propias de las cadenas (marca blanca). Sirven para distinguir "idéntico" de
# "equivalente": dos marcas blancas distintas nunca son el mismo producto.
OWN_BRANDS = {
    "mercadona": ("hacendado", "deliplus", "bosque verde", "compy", "solcare", "casa juncal"),
    "dia": (
        "dia",
        "dia upss",
        "al punto",
        "la granja dia",
        "dia lacteo",
        "bonte",
        "babysmile",
        "as",
    ),
    "alcampo": ("producto alcampo", "auchan", "alcampo", "cosmia", "qilive", "actuel", "rik&rok"),
    "carrefour": ("carrefour", "carrefour classic", "carrefour bio", "deluxe", "simpl"),
}
ALL_OWN_BRANDS = {b for brands in OWN_BRANDS.values() for b in brands}

_STOPWORDS = {
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "con",
    "en",
    "y",
    "al",
    "a",
    "para",
    "sin",
    "por",
    "pack",
    "paquete",
    "bandeja",
    "bolsa",
    "botella",
    "brick",
    "lata",
    "tarro",
    "garrafa",
    "envase",
    "malla",
    "pieza",
    "uds",
    "ud",
    "unidades",
    "unidad",
    "x",
    "aprox",
    "producto",
}


def strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def clean(text: str) -> str:
    """Minúsculas, sin tildes ni signos, espacios simples."""
    text = strip_accents(text.lower()).replace(" ", " ")
    text = re.sub(r"[^a-z0-9%,.]+", " ", text)
    return " ".join(text.split())


def remove_format(text: str) -> str:
    """Quita del nombre los formatos de envase ("2 x 100 g", "1,5 l", "pack 6")."""
    t = clean(text)
    for rx in (_MULTI, _MULTI_REV, _SINGLE, _PACK):
        t = rx.sub(" ", t)
    return " ".join(t.split())


def normalize_brand(brand: str | None) -> str | None:
    if not brand:
        return None
    b = clean(brand)
    b = re.sub(r"\b(s\.?a\.?|s\.?l\.?)\b", "", b).strip()
    return b or None


# Palabras que delatan una submarca blanca ("Dia Láctea", "El Molino de Dia").
_OWN_BRAND_TOKENS = {"dia", "hacendado", "alcampo", "auchan", "carrefour", "deliplus"}


def is_own_brand(brand: str | None) -> bool:
    b = normalize_brand(brand)
    if b is None:
        return False
    return b in ALL_OWN_BRANDS or bool(_OWN_BRAND_TOKENS & set(b.split()))


def tokens(name: str, brand: str | None = None) -> list[str]:
    """Palabras significativas del nombre, sin formato, marca ni palabras vacías."""
    t = remove_format(name)
    nb = normalize_brand(brand)
    if nb:
        t = re.sub(rf"\b{re.escape(nb)}\b", " ", t)
    return [w for w in re.split(r"[ ,.]+", t) if w and w not in _STOPWORDS and not w.isdigit()]


def canonical_text(name: str, brand: str | None = None) -> str:
    return " ".join(tokens(name, brand))


def same_format(a: ParsedFormat | None, b: ParsedFormat | None, tolerance: float = 0.02) -> bool:
    """Mismo contenido total y misma unidad (con un 2 % de margen por redondeos)."""
    if a is None or b is None or a.unit != b.unit:
        return False
    ta, tb = float(a.total), float(b.total)
    if ta <= 0 or tb <= 0:
        return False
    return abs(ta - tb) / max(ta, tb) <= tolerance and a.units_per_pack == b.units_per_pack
