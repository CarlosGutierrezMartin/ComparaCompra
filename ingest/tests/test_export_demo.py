import load
import match_db
from connectors.models import Zone
from export_demo import export
from tests.conftest import needs_db
from tests.test_match_db import _entry

pytestmark = needs_db


def test_exporta_productos_enlaces_precios_y_zonas(conn):
    chain = load.chain_id(conn, "dia")
    zone = load.upsert_zone(conn, chain, Zone(external_ref="web"))
    load.load_listing(
        conn,
        chain,
        zone,
        [
            _entry("d1", "Leche semidesnatada Asturiana 1 L", "Asturiana", 1000, "ml"),
            _entry("d2", "Producto raro sin hoja", None, 1, "unit", path="Varios"),
        ],
    )
    match_db.run(conn)

    data = export(conn)

    # Los seeds asignan los códigos postales de Madrid a la zona online de Dia.
    assert data["zones"]["28001"]["dia"] == zone
    names = [p["name"] for p in data["products"]]
    # Sin enlaces no puede salir en ninguna comparación: no se exporta.
    assert names == ["Leche semidesnatada Asturiana 1 L"]
    leche = data["products"][0]
    assert leche["chain"] == "dia" and leche["quantity"] == 1000.0 and leche["unit"] == "ml"
    levels = {link[0]: link for link in leche["links"]}
    assert levels["g"][2] == "leche"
    assert levels["e"][3] == "semidesnatada" and levels["e"][4] == [] and levels["e"][5] == []
    price, _unit_price, promo, checked_at, source = leche["prices"][str(zone)]
    assert price == 1.0 and promo is None and source == "test" and checked_at.endswith("Z")
    assert data["pricesUpTo"] == checked_at
