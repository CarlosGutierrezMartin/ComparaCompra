"""Tests de carga contra un Postgres real con las migraciones del proyecto.

Necesitan TEST_ADMIN_DATABASE_URL (superusuario); sin ella se omiten. En local:
    TEST_ADMIN_DATABASE_URL="postgresql://postgres@/postgres?host=/tmp&port=54329"
"""

from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

import load
from connectors.models import CatalogEntry, ChainProduct, PriceRecord, Zone

ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL = os.environ.get("TEST_ADMIN_DATABASE_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="sin TEST_ADMIN_DATABASE_URL")


@pytest.fixture
def conn():
    assert ADMIN_URL
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute("drop database if exists comparacompra_pytest")
        admin.execute("create database comparacompra_pytest")
    url = psycopg.conninfo.make_conninfo(ADMIN_URL, dbname="comparacompra_pytest")
    with psycopg.connect(url, autocommit=True) as c:
        c.execute((ROOT / "scripts/supabase_stub.sql").read_text())
        for f in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            c.execute(f.read_text())
        for f in sorted((ROOT / "supabase/seeds").glob("*.sql")):
            c.execute(f.read_text())
        yield c


def entry(pid: str, price: str, promo: dict | None = None) -> CatalogEntry:
    return CatalogEntry(
        product=ChainProduct(
            external_id=pid,
            name=f"Producto {pid} 1 L",
            quantity=Decimal(1000),
            unit="ml",
            url=f"https://example.com/{pid}",
        ),
        price=PriceRecord(
            external_id=pid,
            price=Decimal(price),
            unit_price=Decimal(price),
            promo=promo,
            source="test",
        ),
    )


def setup_zone(conn):
    chain = load.chain_id(conn, "dia")
    zone_id = load.upsert_zone(conn, chain, Zone(external_ref="web", name="Web"))
    load.upsert_postal_code(conn, "28001", chain, zone_id)
    return chain, zone_id


def prices(conn, pid):
    return conn.execute(
        """select p.price, p.valid_to is null from public.price p
           join public.product_chain pc on pc.id = p.product_chain_id
           where pc.external_id = %s order by p.valid_from, p.id""",
        (pid,),
    ).fetchall()


def test_precio_sin_cambios_no_crea_fila(conn):
    chain, zone = setup_zone(conn)
    load.load_listing(conn, chain, zone, [entry("1", "1.00")])
    load.load_listing(conn, chain, zone, [entry("1", "1.00")])
    assert prices(conn, "1") == [(Decimal("1.00"), True)]


def test_cambio_de_precio_cierra_el_intervalo(conn):
    chain, zone = setup_zone(conn)
    load.load_listing(conn, chain, zone, [entry("1", "1.00")])
    result = load.load_listing(conn, chain, zone, [entry("1", "1.20")])
    assert result.price_changes == 1
    assert prices(conn, "1") == [(Decimal("1.00"), False), (Decimal("1.20"), True)]


def test_cambio_de_promocion_crea_fila(conn):
    chain, zone = setup_zone(conn)
    load.load_listing(conn, chain, zone, [entry("1", "1.00")])
    load.load_listing(conn, chain, zone, [entry("1", "1.00", {"type": "text", "text": "3x2"})])
    assert len(prices(conn, "1")) == 2


def test_producto_retirado_deja_de_tener_precio_vigente(conn):
    chain, zone = setup_zone(conn)
    run = load.start_run(conn, chain, zone)
    r = load.load_listing(conn, chain, zone, [entry(str(i), "1.00") for i in range(10)])
    load.finish_run(conn, run, status=r.status, products=r.products)
    r = load.load_listing(conn, chain, zone, [entry(str(i), "1.00") for i in range(9)])
    assert r.status == "ok"
    assert prices(conn, "9") == [(Decimal("1.00"), False)]


def test_caida_de_mas_del_20_por_ciento_es_alerta_y_no_cierra_nada(conn):
    chain, zone = setup_zone(conn)
    run = load.start_run(conn, chain, zone)
    r = load.load_listing(conn, chain, zone, [entry(str(i), "1.00") for i in range(10)])
    load.finish_run(conn, run, status=r.status, products=r.products)
    r = load.load_listing(conn, chain, zone, [entry(str(i), "1.00") for i in range(7)])
    assert r.status == "alert"
    assert "20 %" in (r.message or "")
    assert prices(conn, "9") == [(Decimal("1.00"), True)]
