"""Clasificador por reglas: asigna hoja, variante y marcas a un producto de cadena.

Puntúa cada hoja por las palabras clave que aparecen en el nombre (en español el
sustantivo principal va primero: "Atún en aceite de oliva" es atún, no aceite) y por la
ruta de categorías de la cadena. Lo que no resuelve con confianza suficiente pasa al
clasificador con IA (classify_llm.py) y, si tampoco, a la cola de revisión.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .normalize import clean, remove_format
from .taxonomy import BY_SLUG, LEAVES, Leaf

# Palabras clave adicionales o distintas del nombre de la hoja. Cada entrada es una
# lista de frases; basta con que aparezca una.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "platano": ("platano", "banana"),
    "fresa": ("fresa", "freson"),
    "melocoton": ("melocoton",),
    "tomate": ("tomate",),
    "ajo": ("ajo", "ajos", "cabeza de ajo"),
    "ensalada-en-bolsa": (
        "canonigo",
        "rucula",
        "brotes tiernos",
        "mezclum",
        "ensalada tierna",
        "ensalada mezcla",
        "ensalada de la casa",
        "ensalada ensatun",
        "trio de brotes",
    ),
    "ensaladas-preparadas": (
        "ensalada de pasta",
        "ensalada de atun",
        "ensalada mediterranea",
        "ensaladilla",
        "ensalada de quinoa",
        "ensalada de arroz",
    ),
    "patatas-fritas-de-bolsa": (
        "patatas fritas",
        "patatas chips",
        "patatas lisas",
        "patatas onduladas",
        "patatas sabor",
        "aperitivo de patata",
        "pringles",
        "chips",
    ),
    "claras-de-huevo": ("clara de huevo", "claras de huevo", "clara liquida"),
    "sofrito": ("sofrito",),
    "crema-de-verduras": (
        "crema de verdura",
        "crema de calabaza",
        "crema de calabacin",
        "crema de zanahoria",
        "crema de puerro",
        "crema de champinon",
        "crema de marisco",
        "crema de pollo",
        "crema de garbanzo",
        "crema de lenteja",
        "crema de tomate",
        "crema de esparrago",
        "pure de",
    ),
    "tomate-triturado": ("tomate triturado", "tomate tamizado"),
    "lechuga": ("lechuga", "cogollo", "iceberg"),
    "col": ("col", "repollo", "lombarda", "kale", "coles de bruselas"),
    "setas": ("seta", "boletus", "shiitake", "nameko"),
    "champinones": ("champinon",),
    "hierbas-aromaticas-frescas": ("perejil fresco", "cilantro", "albahaca fresca", "hierbabuena"),
    "pechuga-de-pollo": (
        "pechuga de pollo",
        "filete de pechuga",
        "pechuga entera",
        "pechuga fileteada",
        "pechuga",
    ),
    "muslos-y-contramuslos-de-pollo": ("muslo de pollo", "contramuslo"),
    "alitas-de-pollo": ("alita",),
    "pollo-entero": ("pollo entero", "pollo para asar", "pollo limpio"),
    "pollo-troceado": ("pollo troceado", "pollo en cuartos", "cuarto trasero"),
    "pavo": ("pavo",),
    "filetes-de-ternera": ("filete de ternera", "filete de vacuno", "filete de anojo"),
    "carne-de-ternera-para-guisar": (
        "ternera para guisar",
        "carne para guisar",
        "aguja de ternera",
        "morcillo",
    ),
    "lomo-de-cerdo": ("lomo de cerdo", "cinta de lomo", "lomo fresco"),
    "chuletas-de-cerdo": (
        "chuleta de cerdo",
        "chuleta de aguja",
        "chuleta aguja",
        "chuleta de lomo",
    ),
    "costillas-de-cerdo": ("costilla",),
    "secreto-presa-y-pluma": ("secreto", "presa iberica", "pluma iberica"),
    "panceta": ("panceta",),
    "carne-picada": ("carne picada", "picada de", "preparado de carne picada", "picado de"),
    "hamburguesas": ("hamburguesa", "burger"),
    "albondigas": ("albondiga",),
    "salchichas-frescas": (
        "salchicha fresca",
        "salchicha de pollo",
        "salchicha de cerdo",
        "longaniza",
    ),
    "empanados-de-pollo": (
        "nugget",
        "san jacobo",
        "empanado",
        "fingers de pollo",
        "pechuga empanada",
    ),
    "gambas-y-langostinos": ("gamba", "langostino", "camaron"),
    "salmon-ahumado": ("salmon ahumado",),
    "palitos-de-surimi": ("surimi", "palito de mar", "barrita de mar"),
    "bacon": ("bacon", "beicon"),
    "salchichas-cocidas": ("salchicha", "frankfurt"),
    "mortadela-y-chopped": ("mortadela", "chopped"),
    "pechuga-de-pavo-en-lonchas": ("pechuga de pavo", "fiambre de pavo"),
    "queso-fresco": ("queso fresco", "queso de burgos", "burgos"),
    "queso-untable": ("queso untable", "queso crema", "queso de untar", "philadelphia"),
    "queso-en-lonchas": ("queso en lonchas", "lonchas de queso", "queso lonchas", "lonchas"),
    "queso-rallado": ("queso rallado", "rallado", "queso en hilo", "hilos de queso"),
    "parmesano-y-grana-padano": ("parmesano", "grana padano", "parmigiano"),
    "queso-en-porciones": ("queso en porciones", "quesito", "porciones de queso"),
    "queso-emmental-y-gouda": ("emmental", "gouda", "edam", "havarti"),
    "queso-brie-y-camembert": ("brie", "camembert"),
    "queso-feta": ("feta",),
    "requeson-y-ricotta": ("requeson", "ricotta", "mascarpone"),
    "queso-azul": ("queso azul", "roquefort", "cabrales", "gorgonzola"),
    "huevos": ("huevo",),
    "leche": ("leche entera", "leche semidesnatada", "leche desnatada", "leche fresca", "leche"),
    "leche-enriquecida": (
        "leche con calcio",
        "leche enriquecida",
        "leche omega",
        "leche de crecimiento",
    ),
    "bebida-vegetal": (
        "bebida de avena",
        "bebida de soja",
        "bebida de almendra",
        "bebida de arroz",
        "bebida vegetal",
        "bebida de coco",
        "bebida avena",
        "bebida soja",
    ),
    "batido": ("batido",),
    "nata-para-cocinar": ("nata para cocinar", "nata cocina", "nata liquida para cocinar"),
    "nata-para-montar": ("nata para montar", "nata montar", "nata liquida 35"),
    "yogur-natural": ("yogur natural", "yogur entero natural"),
    "yogur-desnatado": ("yogur desnatado", "desnatado natural", "yogur 0%"),
    "yogur-griego": ("griego",),
    "yogur-de-sabores": ("yogur de sabores", "yogur sabor", "yogur de fresa", "yogur con frutas"),
    "yogur-liquido": ("yogur liquido", "yogur para beber"),
    "pan-de-molde": (
        "pan de molde",
        "pan molde",
        "pan bimbo",
        "sandwich",
        "pan de hogaza de molde",
    ),
    "pan-de-barra": ("barra de pan", "baguette", "chapata", "pan rustico", "hogaza"),
    "tortillas-de-trigo": ("tortilla de trigo", "wrap", "fajita"),
    "arroz": ("arroz",),
    "macarrones": ("macarron", "penne", "plumas", "rigatoni"),
    "espaguetis": ("espagueti", "spaghetti"),
    "fideos": ("fideo", "fideua"),
    "tallarines": ("tallarin", "tagliatelle", "linguine", "fettuccine"),
    "helices-y-otras-pastas-cortas": (
        "helice",
        "fusilli",
        "pajarita",
        "farfalle",
        "lacito",
        "estrellas",
        "conchas",
        "tiburon",
    ),
    "placas-de-lasana": ("lasana",),
    "canelones": ("canelon",),
    "pasta-rellena": (
        "tortellini",
        "ravioli",
        "pasta rellena",
        "girasoli",
        "tortelloni",
        "cappelletti",
    ),
    "noodles": ("noodle", "fideos orientales", "ramen", "yakisoba", "udon"),
    "masa-de-hojaldre-y-pizza": ("hojaldre", "masa de pizza", "masa fresca", "base de pizza"),
    "platos-preparados-refrigerados": (
        "listo para comer",
        "calentar y listo",
        "arroz a banda",
        "plato preparado",
    ),
    "anillas-y-rabas": ("anilla", "raba", "calamar a la romana", "rebozad", "fritura de pescado"),
    "garbanzos-secos": ("garbanzo",),
    "garbanzos-cocidos": ("garbanzo cocido", "garbanzos cocidos"),
    "lentejas-secas": ("lenteja",),
    "lentejas-cocidas": ("lenteja cocida", "lentejas cocidas"),
    "alubias-secas": ("alubia", "judia blanca", "judion", "fabe"),
    "alubias-cocidas": (
        "alubia cocida",
        "alubias cocidas",
        "judias cocidas",
        "alubia blanca cocida",
    ),
    "aceite-de-oliva": ("aceite de oliva",),
    "aceite-de-girasol": ("aceite de girasol", "aceite girasol"),
    "otros-aceites": (
        "aceite de coco",
        "aceite de sesamo",
        "aceite de orujo",
        "aceite de semillas",
    ),
    "tomate-frito": ("tomate frito",),
    "tomate-natural-entero": ("tomate entero", "tomate pelado", "tomate natural"),
    "concentrado-de-tomate": ("concentrado de tomate", "tomate concentrado"),
    "atun-en-conserva": ("atun", "atun claro"),
    "bonito-en-conserva": ("bonito del norte", "bonito"),
    "sardinas-en-lata": ("sardina", "sardinilla"),
    "caballa-en-lata": ("caballa", "melva"),
    "sopa-de-sobre": ("sopa",),
    "verdura-congelada": ("menestra", "salteado de verdura", "verdura para", "pisto congelado"),
    "fruta-congelada": ("fruta congelada",),
    "guisantes-frescos": ("guisante",),
    "guisantes-en-conserva": (
        "guisante en conserva",
        "guisantes al natural",
        "guisante al natural",
    ),
    "pastillas-de-caldo": (
        "pastillas de caldo",
        "caldo en pastillas",
        "pastilla",
        "avecrem",
        "cacito",
    ),
    "otras-harinas": (
        "harina de garbanzo",
        "harina de maiz",
        "harina de arroz",
        "harina de avena",
        "maicena",
    ),
    "harina-de-trigo": (
        "harina de trigo",
        "harina de fuerza",
        "harina",
        "harina integral de trigo",
    ),
    "caldo": ("caldo", "fumet"),
    "patatas-congeladas": (
        "patatas prefritas",
        "patatas congeladas",
        "patatas para freir",
        "patatas gajo",
    ),
    "detergente-para-ropa": ("detergente",),
    "lavavajillas-a-mano": ("lavavajillas mano", "lavavajillas a mano", "lavavajillas concentrado"),
    "lavavajillas-a-maquina": (
        "lavavajillas maquina",
        "pastillas lavavajillas",
        "lavavajillas en pastillas",
    ),
    "papel-de-cocina": ("papel de cocina", "rollo de cocina", "rollo cocina", "papel cocina"),
    "panuelos-de-papel": ("panuelo",),
    "toallitas-humedas": ("toallita",),
    "merluza": ("merluza",),
    "bacalao": ("bacalao",),
    "salmon": ("salmon",),
}

# Palabras de la ruta de categorías de la cadena que apuntan a una sección.
SECTION_HINTS: dict[str, tuple[str, ...]] = {
    "Fruta": ("fruta",),
    "Verdura": ("verdura", "hortaliza", "lechuga", "ensalada", "setas"),
    "Carne": ("carne", "pollo", "cerdo", "vacuno", "ternera", "aves", "hamburguesa", "picada"),
    "Pescado y marisco": ("pescado", "marisco"),
    "Charcutería": ("charcuteria", "embutido", "fiambre", "jamon"),
    "Quesos": ("queso",),
    "Huevos y lácteos": ("huevo", "leche", "lacteo", "mantequilla", "nata", "bebidas vegetales"),
    "Yogures y postres": ("yogur", "postre"),
    "Panadería": ("pan", "panaderia", "bolleria", "harina"),
    "Arroz, pasta y legumbres": (
        "arroz",
        "pasta",
        "legumbre",
        "fideo",
        "garbanzo",
        "lenteja",
        "alubia",
    ),
    "Aceite, salsas y especias": ("aceite", "salsa", "especia", "vinagre", "sal ", "tomate frito"),
    "Conservas, caldos y cremas": (
        "conserva",
        "caldo",
        "sopa",
        "crema",
        "atun",
        "bonito",
        "sardina",
    ),
    "Congelados": ("congelad",),
    "Platos preparados": ("plato preparado", "platos preparados", "comida preparada"),
    "Desayuno y dulces": (
        "cafe",
        "cacao",
        "infusion",
        "cereales",
        "galleta",
        "azucar",
        "chocolate",
    ),
    "Aperitivos": ("aperitivo", "snack", "frutos secos", "patatas fritas"),
    "Bebidas": ("agua", "refresco", "zumo", "cerveza", "vino", "bebida"),
    "Limpieza y hogar": ("limpieza", "hogar", "detergente", "papel", "celulosa"),
    "Higiene y cuidado personal": ("higiene", "cuidado", "perfumeria"),
    "Bebé": ("bebe", "infantil"),
    "Mascotas": ("mascota", "perro", "gato"),
}

FLAG_PATTERNS: dict[str, re.Pattern[str]] = {
    "sin_lactosa": re.compile(r"\bsin lactosa\b|\b0% lactosa\b|\bbaja en lactosa\b"),
    "sin_gluten": re.compile(r"\bsin gluten\b"),
    "ecologico": re.compile(r"\becologic[oa]s?\b|\bbio\b|\beco\b"),
    "congelado": re.compile(r"\bcongelad[oa]s?\b|\bultracongelad"),
    "sin_azucar": re.compile(r"\bsin azucar(es)?( anadidos?)?\b|\bzero\b|\b0% azucar"),
    "integral": re.compile(r"\bintegral(es)?\b"),
}

ACCEPT_CONFIDENCE = {"rule": 0.8, "model": 0.7, "human": 0.0}

# Lo que va tras estas palabras modifica al núcleo: "Tomate frito con aceite de oliva".
_MODIFIERS = {"con", "en", "al", "sabor", "estilo", "relleno", "rellena", "receta"}


@dataclass
class Classification:
    leaf: str | None
    variant: str | None = None
    flags: list[str] = field(default_factory=list)
    confidence: float = 0.0
    source: str = "rule"

    @property
    def accepted(self) -> bool:
        return self.leaf is not None and self.confidence >= ACCEPT_CONFIDENCE[self.source]


def _singular(word: str) -> str:
    # "melones" -> "melon", pero "noodles" -> "noodle" y "verdes" -> "verde".
    if len(word) > 4 and word.endswith("es") and word[-3] in "lnrd" and word[-4] in "aeiou":
        return word[:-2]
    if len(word) > 3 and word.endswith("s"):
        return word[:-1]
    return word


def _norm_words(text: str) -> list[str]:
    return [_singular(w) for w in re.split(r"[^a-z0-9%]+", clean(text)) if w]


def _find(phrase: list[str], words: list[str]) -> int | None:
    n = len(phrase)
    for i in range(len(words) - n + 1):
        if words[i : i + n] == phrase:
            return i
    return None


def _leaf_phrases(leaf: Leaf) -> list[list[str]]:
    raw = KEYWORDS.get(leaf.slug) or (leaf.name, *leaf.aliases)
    return [_norm_words(p) for p in raw if p]


_PHRASES = {leaf.slug: _leaf_phrases(leaf) for leaf in LEAVES}


def _section_score(section: str, category_path: str, slug: str | None = None) -> float:
    path = " " + clean(category_path) + " "
    if any(h in path for h in SECTION_HINTS.get(section, ())):
        return 1.0
    if slug is not None:
        path_words = _norm_words(category_path)
        # Solo frases de varias palabras: "Aperitivos > Patatas fritas" no apunta a la patata.
        if any(len(p) > 1 and _find(p, path_words) is not None for p in _PHRASES[slug]):
            return 1.0
    return 0.0


def _other_section(section: str, category_path: str) -> bool:
    """La ruta de la cadena apunta claramente a otra sección."""
    path = " " + clean(category_path) + " "
    return any(
        any(h in path for h in hints) for sec, hints in SECTION_HINTS.items() if sec != section
    )


def detect_flags(name: str) -> list[str]:
    t = clean(name)
    return [flag for flag, rx in FLAG_PATTERNS.items() if rx.search(t)]


def detect_variant(leaf: Leaf, name: str, category_path: str = "") -> str | None:
    if "mixta" in leaf.variants:
        meats = [
            v
            for v in leaf.variants
            if v != "mixta" and _find(_norm_words(v), _norm_words(name)) is not None
        ]
        if len(meats) > 1:
            return "mixta"
    words = _norm_words(f"{name} {category_path}")
    best: tuple[int, str] | None = None
    for variant in leaf.variants:
        pos = _find(_norm_words(variant), words)
        if pos is not None and (best is None or pos < best[0]):
            best = (pos, variant)
    return best[1] if best else None


def _head_length(words: list[str]) -> int:
    for i, w in enumerate(words):
        if i > 0 and w in _MODIFIERS:
            return i
    return len(words)


def classify(name: str, category_path: str = "", brand: str | None = None) -> Classification:
    words = _norm_words(remove_format(name))
    if brand:
        brand_words = _norm_words(brand)
        if brand_words and words[: len(brand_words)] == brand_words:
            words = words[len(brand_words) :]
    head = _head_length(words)
    scored: list[tuple[float, str]] = []
    matched: dict[str, list[str]] = {}
    for slug, phrases in _PHRASES.items():
        best = 0.0
        for phrase in phrases:
            pos = _find(phrase, words)
            if pos is None:
                # "Nata ligera para cocinar": todas las palabras en el núcleo, no seguidas.
                if len(phrase) > 1 and all(w in words[:head] for w in phrase):
                    best = max(best, 2.5 * len(phrase) + 2.0)
                continue
            # Más palabras coincidentes, dentro del núcleo y cerca del principio.
            score = 3.0 * len(phrase) + max(0.0, 3.0 - 1.0 * pos)
            if pos + len(phrase) <= head:
                score += 4.0
            if score > best:
                best = score
                matched[slug] = phrase
        if best:
            leaf = BY_SLUG[slug]
            best += 2.0 * _section_score(leaf.section, category_path, slug)
            scored.append((best, slug))
    if not scored:
        return Classification(leaf=None, confidence=0.0)
    scored.sort(reverse=True)
    top_score, top = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    leaf = BY_SLUG[top]
    margin = (top_score - second) / top_score
    if len(scored) > 1:
        top_phrase, second_phrase = matched.get(top, []), matched.get(scored[1][1], [])
        if (
            second_phrase
            and len(top_phrase) > len(second_phrase)
            and set(second_phrase) <= set(top_phrase)
        ):
            # "garbanzo cocido" contiene a "garbanzo": la frase más específica no deja dudas.
            margin = 1.0
    section_ok = _section_score(leaf.section, category_path, top) > 0 or not category_path
    confidence = min(1.0, 0.55 + margin * 0.6 + (0.15 if section_ok else -0.2))
    if not section_ok and _other_section(leaf.section, category_path):
        # "Patatas sabor nachos" en Aperitivos no es la patata de la frutería.
        confidence = min(confidence, 0.6)
    # Las marcas salen del nombre; la ruta de categorías solo dice si es congelado.
    flags = detect_flags(name)
    if "congelado" not in flags and FLAG_PATTERNS["congelado"].search(clean(category_path)):
        flags.append("congelado")
    if leaf.slug == "caldo" and re.search(r"\bpastillas?\b|\bcacitos?\b", clean(name)):
        leaf = BY_SLUG["pastillas-de-caldo"]
    variant = detect_variant(leaf, name, category_path)
    if "congelado" in flags and leaf.section in ("Fruta", "Verdura"):
        # La fruta y la verdura congeladas son otro producto que la fresca.
        frozen = BY_SLUG["fruta-congelada" if leaf.section == "Fruta" else "verdura-congelada"]
        variant = detect_variant(frozen, name) or (
            leaf.name.lower() if leaf.name.lower() in frozen.variants else None
        )
        leaf = frozen
        flags.remove("congelado")
    return Classification(
        leaf=leaf.slug,
        variant=variant,
        flags=flags,
        confidence=round(confidence, 3),
    )
