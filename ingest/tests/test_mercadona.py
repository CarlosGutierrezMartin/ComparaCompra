import json
from decimal import Decimal

import httpx

from connectors.mercadona import MercadonaConnector
from tests.conftest import fixture_response, fixture_text

AVAILABLE = {"156", "77", "29"}


def router(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("/postal-codes/actions/change-pc/"):
        assert request.method == "PUT"
        return fixture_response("mercadona", "change_pc_28001.json")
    if path == "/api/categories/":
        assert request.url.params["wh"] == "mad3"
        # Solo las subcategorías grabadas, para no depender de las demás.
        tree = json.loads(fixture_text("mercadona", "categories.json"))
        for top in tree["results"]:
            top["categories"] = [c for c in top["categories"] if str(c["id"]) in AVAILABLE]
        return httpx.Response(200, json=tree)
    cat = path.rstrip("/").rsplit("/", 1)[-1]
    if cat in AVAILABLE:
        return fixture_response("mercadona", f"category_{cat}.json")
    return httpx.Response(404)


def connector(make_client):
    return MercadonaConnector(make_client("mercadona", router))


def test_codigo_postal_a_almacen(make_client):
    zone = connector(make_client).resolve_zone("28001")
    assert zone.external_ref == "mad3"


def test_catalogo_y_precios_de_un_almacen(make_client):
    c = connector(make_client)
    zone = c.resolve_zone("28001")
    entries = {e.product.external_id: e for e in c.listing(zone)}
    assert len(entries) > 50
    # Todos con precio, enlace a la ficha y sin descripciones de la cadena.
    for e in entries.values():
        assert e.price.price >= 0
        assert e.product.url.startswith("https://tienda.mercadona.es/product/")
        assert e.price.source == "mercadona_api"


def test_pack_de_agua(make_client):
    c = connector(make_client)
    e = {x.product.external_id: x for x in c.listing(c.resolve_zone("28001"))}["15758"]
    assert (e.product.quantity, e.product.unit, e.product.units_per_pack) == (
        Decimal(1500),
        "ml",
        6,
    )
    assert e.price.price == Decimal("2.34")
    assert e.price.unit_price == Decimal("0.260")


def test_huevos_por_docena_pasan_a_precio_por_unidad(make_client):
    c = connector(make_client)
    e = {x.product.external_id: x for x in c.listing(c.resolve_zone("28001"))}["30167"]
    assert (e.product.quantity, e.product.unit) == (Decimal(24), "unit")
    assert e.price.unit_price == Decimal("2.625") / 12


def test_manojo_cuenta_unidades(make_client):
    c = connector(make_client)
    e = {x.product.external_id: x for x in c.listing(c.resolve_zone("28001"))}["69139"]
    assert (e.product.quantity, e.product.unit) == (Decimal(3), "unit")


def test_bajada_de_precio_como_promocion(make_client):
    c = connector(make_client)
    e = {x.product.external_id: x for x in c.listing(c.resolve_zone("28001"))}["27099"]
    assert e.price.promo == {"type": "price_drop", "previous_price": "3.84"}
