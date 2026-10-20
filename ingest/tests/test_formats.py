import json
from decimal import Decimal
from pathlib import Path

import pytest

from matching.formats import (
    ParsedFormat,
    parse_format,
    parse_format_checked,
    unit_price_per_reference,
)

CASES = json.loads((Path(__file__).parent / "data/formatos_200.json").read_text())["cases"]


def test_hay_200_casos_reales():
    assert len(CASES) == 200


@pytest.mark.parametrize("case", CASES, ids=[c["name"][:60] for c in CASES])
def test_formato_real_cuadra_con_el_precio_por_unidad_publicado(case):
    price = Decimal(case["price"])
    published = Decimal(case["published_unit_price"])
    fmt = parse_format_checked(case["name"], price, published)
    exp = case["expected"]
    assert fmt == ParsedFormat(Decimal(exp["quantity"]), exp["unit"], exp["units_per_pack"])
    computed = unit_price_per_reference(price, fmt)
    assert computed is not None
    assert abs(computed - published) <= max(Decimal("0.02"), published * Decimal("0.02"))


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Pack 6 x 1,5 L", ParsedFormat(Decimal(1500), "ml", 6)),
        ("Agua mineral 6 botellas x 1,5 l", ParsedFormat(Decimal(1500), "ml", 6)),
        ("2x100g", ParsedFormat(Decimal(100), "g", 2)),
        ("Refresco 1,5 L x 6", ParsedFormat(Decimal(1500), "ml", 6)),
        ("Lata 33 cl", ParsedFormat(Decimal(330), "ml", 1)),
        ("Champiñón laminado en lata 1/2 kg", ParsedFormat(Decimal(500), "g", 1)),
        ("Salsa Barbacoa 265 gr. + 35 gr. gratis", ParsedFormat(Decimal(265), "g", 1)),
        ("Huevos frescos clase L 12 uds", ParsedFormat(Decimal(12), "unit", 1)),
        ("Huevos camperos media docena", ParsedFormat(Decimal(6), "unit", 1)),
        ("Huevos 2 docenas", ParsedFormat(Decimal(24), "unit", 1)),
        ("Puerro unidad", ParsedFormat(Decimal(1), "unit", 1)),
        ("Arroz redondo paquete de 1 kilogramo", ParsedFormat(Decimal(1000), "g", 1)),
        ("Patatas malla 3 kg", ParsedFormat(Decimal(3000), "g", 1)),
    ],
)
def test_formatos_tipicos(text, expected):
    assert parse_format(text) == expected


def test_unidades_con_peso_total_o_por_unidad():
    # Dia: "6 unidades ... 540 g" es el total; Alcampo: "3 uds. 120 g" es cada envase.
    assert parse_format("Burger 6 unidades 540 g", pack_total=True) == ParsedFormat(
        Decimal(90), "g", 6
    )
    assert parse_format("Guisantes 3 uds. 120 g") == ParsedFormat(Decimal(120), "g", 3)


def test_no_inventa_formatos():
    assert parse_format("Lechuga iceberg") is None
    assert parse_format("") is None
    assert parse_format(None) is None
