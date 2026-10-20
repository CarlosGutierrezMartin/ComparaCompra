from decimal import Decimal

from connectors.alcampo import leaf_category_urls, parse_category_page
from tests.conftest import fixture_text


def test_solo_hojas_de_alimentacion():
    leaves = leaf_category_urls(fixture_text("alcampo", "sitemap-categories.xml"))
    assert leaves
    assert not any("/juguetes/" in u for u in leaves)
    paths = [u.split("/categories/")[1].rsplit("/", 1)[0] for u in leaves]
    assert not any(q.startswith(p + "/") for p in paths for q in paths)


def test_pagina_de_categoria():
    entries, total = parse_category_page(fixture_text("alcampo", "category_0.html"))
    assert total == len(entries) == 5
    e = {x.product.external_id: x for x in entries}["54144"]
    assert e.product.brand == "PRODUCTO ALCAMPO"
    assert (e.product.quantity, e.product.unit, e.product.units_per_pack) == (Decimal(100), "g", 2)
    assert e.price.price == Decimal("1.64")
    assert e.price.unit_price == Decimal("8.20")
    assert e.product.url.endswith("/54144")
    assert (
        e.product.category_ref == "Frescos > Charcutería > Charcutería en taquitos > Taquitos Bacon"
    )


def test_huevos_precio_por_docena_a_unidad():
    entries, _ = parse_category_page(fixture_text("alcampo", "category_1.html"))
    e = {x.product.external_id: x for x in entries}["804318"]
    assert (e.product.quantity, e.product.unit) == (Decimal(12), "unit")
    assert e.price.unit_price == Decimal("3.05") / 12
