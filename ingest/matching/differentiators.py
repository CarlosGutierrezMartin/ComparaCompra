"""Rasgos que cambian el producto aunque compartan hoja y variante.

"Leche semidesnatada de cabra" no es equivalente a "Leche semidesnatada" (de vaca), ni
"Arroz basmati cocido" a "Arroz basmati". Si dos productos difieren en uno de estos
rasgos, no se consideran equivalentes (sí del mismo genérico).
"""

from __future__ import annotations

import re

from .normalize import clean

# rasgo -> expresión regular sobre el nombre normalizado (sin tildes, minúsculas)
DIFFERENTIATORS: dict[str, str] = {
    # origen o tipo de leche
    "cabra": r"\bcabra\b",
    "oveja": r"\boveja\b",
    "enriquecida": r"\bcalcio\b|\bomega\s*3\b|\bproteinas?\b|\bvitamina|\bcrecimiento\b|\bbebida lactea\b",
    "en_polvo": r"\ben polvo\b",
    "light": r"\blight\b|\bligera?\b|\b0\s*%\s*m\.?\s*g\b|\bdesnatad[oa] 0%",
    "azucarado": r"\bazucarad[oa]\b|\bcon azucar\b|\bazucar de cana\b",
    # preparación
    "cocinado": r"\bcocid[oa]\b(?! en su jugo)|\bprecocid[oa]\b|\bvasos?\b|\bvasitos?\b|\btarrinas?\b|\bmicroondas\b|\bcalentar\b|\basad[oa]s?\b",
    "pastillas": r"\bpastillas?\b|\bcacitos?\b|\bavecrem\b",
    "rallado_mozzarella": r"\bmozzarella\b",
    "rallado_emmental": r"\bemmental\b",
    "rallado_pecorino": r"\bpecorino\b|\bparmesano\b|\bgrana padano\b",
    "varios_quesos": r"\b\d quesos\b|\bmezcla de quesos\b",
    "cottage": r"\bcottage\b",
    "batido": r"\bbatid[oa]\b",
    "burgos": r"\bburgos\b",
    "trufa": r"\btrufa\b",
    "migas": r"\bmigas\b",
    "ventresca": r"\bventresca\b",
    "con_aceitunas": r"\bcon aceitunas\b",
    "escabeche": r"\bescabeche\b",
    "con_tomate": r"\bcon tomate\b|\ben tomate\b|\bsalsa de tomate\b",
    "natural": r"\bal natural\b",
    "picante": r"\bpicantes?\b",
    "empanado": r"\bempanad[oa]s?\b|\brebozad[oa]s?\b",
    "adobado": r"\badobad[oa]s?\b|\bmarinad[oa]s?\b|\bal ajillo\b",
    "spray": r"\bspray\b",
    "semillas": r"\bsemillas\b|\bcereales\b|\bpipas\b",
    "centeno": r"\bcenteno\b",
    "brotes": r"\bbrotes?\b|\bbaby\b",
    "sin_sal": r"\bsin sal\b|\bbajo en sal\b|\breducid[oa]s? en sal\b",
    "plato": r"\bcon (gambas|pollo|verduras|marisco|setas|quinoa|chia)\b|\btres delicias\b|\ba banda\b",
    "mini": r"\bmini\b",
}
# Rasgos que solo tienen sentido en algunas secciones: en verdura, "frasco" o "lata"
# separan la conserva del producto fresco; en las conservas de pescado no dicen nada.
SECTION_DIFFERENTIATORS: dict[str, dict[str, str]] = {
    "Verdura": {"conserva": r"\bfrasco\b|\blata\b|\ben conserva\b|\bal natural\b|\btarro\b"},
    "Fruta": {"conserva": r"\bfrasco\b|\blata\b|\ben almibar\b|\btarro\b"},
}
_COMPILED = {k: re.compile(v) for k, v in DIFFERENTIATORS.items()}
_SECTION_COMPILED = {
    sec: {k: re.compile(v) for k, v in traits.items()}
    for sec, traits in SECTION_DIFFERENTIATORS.items()
}


def differentiators(name: str, section: str | None = None) -> tuple[str, ...]:
    text = clean(name)
    found = {k for k, rx in _COMPILED.items() if rx.search(text)}
    found |= {k for k, rx in _SECTION_COMPILED.get(section or "", {}).items() if rx.search(text)}
    return tuple(sorted(found))
