"""Parser de formatos de envase ("pack 6 x 1,5 L", "2 x 100 g", "12 uds").

Todo se normaliza a gramos, mililitros o unidades, igual que packages/core.
Si un formato no se reconoce se devuelve None: nunca se inventa un formato.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Literal

BaseUnit = Literal["g", "ml", "unit"]

_UNITS: dict[str, tuple[BaseUnit, Decimal]] = {
    "mg": ("g", Decimal("0.001")),
    "g": ("g", Decimal(1)),
    "gr": ("g", Decimal(1)),
    "grs": ("g", Decimal(1)),
    "gramo": ("g", Decimal(1)),
    "gramos": ("g", Decimal(1)),
    "kilogramo": ("g", Decimal(1000)),
    "kilogramos": ("g", Decimal(1000)),
    "kg": ("g", Decimal(1000)),
    "kgs": ("g", Decimal(1000)),
    "kilo": ("g", Decimal(1000)),
    "kilos": ("g", Decimal(1000)),
    "ml": ("ml", Decimal(1)),
    "cl": ("ml", Decimal(10)),
    "dl": ("ml", Decimal(100)),
    "l": ("ml", Decimal(1000)),
    "lt": ("ml", Decimal(1000)),
    "lts": ("ml", Decimal(1000)),
    "litro": ("ml", Decimal(1000)),
    "litros": ("ml", Decimal(1000)),
}
# Palabras de recuento. "6 unidades ... 540 g" da el peso total; "6 botellas 1,5 l"
# da el contenido de cada envase.
_TOTAL_COUNT_WORDS = ("uds", "ud", "unidades", "unidad", "piezas", "pastillas")
_COUNT_WORDS = (
    "frascos",
    "tarros",
    "pastillas",
    "uds",
    "ud",
    "u",
    "unidades",
    "unidad",
    "piezas",
    "pieza",
    "rollos",
    "rollo",
    "latas",
    "lata",
    "botellas",
    "botellines",
    "bricks",
    "sobres",
    "capsulas",
    "bolsitas",
    "lavados",
    "dosis",
)

_NUM = r"(\d+(?:[.,]\d+)?)"
_UNIT_RE = "|".join(sorted((re.escape(u) for u in _UNITS), key=len, reverse=True))
_COUNT_RE = "|".join(sorted(_COUNT_WORDS, key=len, reverse=True))

# N x Q U  ("6 x 1,5 L", "pack 6 x 33cl", "2x100g")
_MULTI = re.compile(rf"(\d+)\s*(?:{_COUNT_RE})?\.?\s*[x×]\s*{_NUM}\s*({_UNIT_RE})\b")
# Q U x N  ("1,5 L x 6")
_MULTI_REV = re.compile(rf"{_NUM}\s*({_UNIT_RE})\s*[x×]\s*(\d+)\b")
# Q U  ("1,25 L", "500g")
_SINGLE = re.compile(rf"{_NUM}\s*({_UNIT_RE})\b")
# pack de N / N uds
_PACK = re.compile(rf"\bpack\s*(?:de\s*)?(\d+)\b|\b(\d+)\s*(?:{_COUNT_RE})\b")
_TOTAL_PACK = re.compile(rf"\b(\d+)\s*(?:{'|'.join(_TOTAL_COUNT_WORDS)})\b")
_FRACTION = re.compile(rf"\b(\d+)/(\d+)\s*({_UNIT_RE})\b")
_FREE = re.compile(r"\+\s*\d+(?:[.,]\d+)?\s*[a-z]*\.?\s*(?:gratis|de regalo)")
_SINGLE_UNIT = re.compile(r"\b(?:unidad|pieza)\b")
_DOZEN = re.compile(r"\b(\d+(?:[.,]5)?)?\s*docenas?\b|\bmedia\s+docena\b")


@dataclass(frozen=True)
class ParsedFormat:
    quantity: Decimal  # contenido de una unidad, en unidad base
    unit: BaseUnit
    units_per_pack: int = 1

    @property
    def total(self) -> Decimal:
        return self.quantity * self.units_per_pack


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.replace("\u00a0", " ")


def _dec(value: str) -> Decimal | None:
    try:
        return Decimal(value.replace(",", "."))
    except InvalidOperation:
        return None


def plain(value: Decimal) -> Decimal:
    """Quita ceros sobrantes sin notación exponencial (6000, no 6E+3)."""
    value = value.normalize()
    return value.quantize(Decimal(1)) if value.as_tuple().exponent > 0 else value


def _to_base(amount: Decimal, unit: str) -> tuple[Decimal, BaseUnit]:
    base, factor = _UNITS[unit]
    return plain(amount * factor), base


def parse_format(text: str | None, *, pack_total: bool = False) -> ParsedFormat | None:
    """Interpreta el formato de envase de un nombre o de un campo de tamaño.

    pack_total: en "6 unidades 540 g", si 540 g es el total del paquete (True) o el
    contenido de cada unidad (False). Cada cadena usa una convención y ni siquiera la
    respetan siempre; por eso, si hay precio por unidad publicado, usar parse_format_checked.
    """
    if not text:
        return None
    t = _clean(text)
    # "265 g + 35 g gratis": la oferta no cambia el formato de referencia.
    t = _FREE.sub(" ", t)
    # "1/2 kg" -> "0.5 kg"
    t = _FRACTION.sub(lambda m: f"{int(m.group(1)) / int(m.group(2))} {m.group(3)}", t)

    m = _MULTI.search(t)
    if m:
        n, amount, unit = int(m.group(1)), _dec(m.group(2)), m.group(3)
        if amount is not None and n > 0:
            q, base = _to_base(amount, unit)
            return ParsedFormat(q, base, n)

    m = _MULTI_REV.search(t)
    if m:
        amount, unit, n = _dec(m.group(1)), m.group(2), int(m.group(3))
        if amount is not None and n > 0:
            q, base = _to_base(amount, unit)
            return ParsedFormat(q, base, n)

    singles = list(_SINGLE.finditer(t))
    pack = _PACK.search(t)
    pack_n = int(pack.group(1) or pack.group(2)) if pack else None
    if singles:
        last = singles[-1]
        amount = _dec(last.group(1))
        if amount is not None and amount > 0:
            q, base = _to_base(amount, last.group(2))
            # "pack 6 botellas 1,5 L": el pack multiplica la cantidad
            if pack_n and pack_n > 1 and pack and pack.start() != last.start():
                total_pack = _TOTAL_PACK.search(t)
                if pack_total and total_pack and int(total_pack.group(1)) == pack_n:
                    # "6 unidades 540 g": 540 g es el total del paquete.
                    return ParsedFormat(plain(q / pack_n), base, pack_n)
                return ParsedFormat(q, base, pack_n)
            return ParsedFormat(q, base, 1)

    dozen = _DOZEN.search(t)
    if dozen:
        if dozen.group(0).startswith("media"):
            return ParsedFormat(Decimal(6), "unit", 1)
        n = _dec(dozen.group(1)) if dozen.group(1) else Decimal(1)
        if n is not None:
            return ParsedFormat(plain(n * 12), "unit", 1)

    if pack_n and pack_n > 0:
        return ParsedFormat(Decimal(pack_n), "unit", 1)
    if _SINGLE_UNIT.search(t):
        return ParsedFormat(Decimal(1), "unit", 1)
    return None


def unit_price_per_reference(price: Decimal, fmt: ParsedFormat) -> Decimal | None:
    """Precio por kg, litro o unidad (RD 3423/2000)."""
    total = fmt.total
    if total <= 0:
        return None
    per_base = price / total
    return per_base if fmt.unit == "unit" else per_base * 1000


def _close(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) <= max(Decimal("0.02"), b * Decimal("0.02"))


def parse_format_checked(
    text: str | None, price: Decimal, published_unit_price: Decimal | None
) -> ParsedFormat | None:
    """Elige la interpretación del formato que cuadra con el precio por unidad publicado."""
    options = [parse_format(text), parse_format(text, pack_total=True)]
    if published_unit_price is not None:
        for fmt in options:
            if fmt is None:
                continue
            computed = unit_price_per_reference(price, fmt)
            if computed is not None and _close(computed, published_unit_price):
                return fmt
    return options[0]
