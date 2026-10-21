from decimal import Decimal

import httpx

from connectors.dia import DiaConnector, parse_category_tree, parse_listing_page
from tests.conftest import fixture_response, fixture_text


def test_arbol_de_categorias():
    tree = parse_category_tree(fixture_text("dia", "page_0.html"))
    codes = {code for code, _, _ in tree}
    assert len(tree) > 150
    assert "L2212" in codes
    # Sin categorías de primer nivel ni secciones de temporada.
    assert all(link.count("/") >= 4 for _, link, _ in tree)
    assert not any(link.startswith("/navidad/") for _, link, _ in tree)


def test_pagina_de_listado():
    entries, total = parse_listing_page(fixture_text("dia", "page_1.html"), "Agua > Naranja")
    assert total == 36
    assert len(entries) == 20
    first = {e.product.external_id: e for e in entries}["35484"]
    assert first.product.name == "Refresco de naranja Dia Upss 2 L"
    assert first.product.brand == "Dia Upss"
    assert (first.product.quantity, first.product.unit) == (Decimal(2000), "ml")
    assert first.price.price == Decimal("0.95")
    assert first.price.unit_price == Decimal("0.48")
    assert any(e.price.promo for e in entries)


def test_conector_sigue_la_paginacion(make_client):
    def router(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/agua-y-refrescos/c/L117":
            return fixture_response("dia", "page_0.html")
        if path == "/agua-y-refrescos/naranja-limon-y-lima-limon/c/L2212":
            return fixture_response("dia", "page_1.html")
        if path == "/agua-y-refrescos/naranja-limon-y-lima-limon/pag-2/c/L2212":
            return fixture_response("dia", "page_2.html")
        return httpx.Response(404)

    c = DiaConnector(make_client("dia", router))
    c.subcategories = lambda: [  # type: ignore[method-assign]
        (
            "L2212",
            "/agua-y-refrescos/naranja-limon-y-lima-limon/c/L2212",
            "Naranja, limón y lima-limón",
        )
    ]
    entries = c.listing(c.resolve_zone("28001"))
    assert len(entries) == 36
    assert c.stats.truncated_categories == []
