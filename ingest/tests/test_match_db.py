from decimal import Decimal

import load
import match_db
from connectors.models import CatalogEntry, ChainProduct, PriceRecord, Zone
from tests.conftest import needs_db

pytestmark = needs_db


def _entry(pid, name, brand, q, unit, units=1, path="Leche"):
    return CatalogEntry(
        product=ChainProduct(
            external_id=pid,
            name=name,
            brand=brand,
            quantity=Decimal(q),
            unit=unit,
            units_per_pack=units,
            category_ref=path,
            url=f"https://example.com/{pid}",
        ),
        price=PriceRecord(external_id=pid, price=Decimal("1.00"), source="test"),
    )


def _load(conn, chain_slug, entries):
    chain = load.chain_id(conn, chain_slug)
    zone = load.upsert_zone(conn, chain, Zone(external_ref="web"))
    load.load_listing(conn, chain, zone, entries)


def _canonical(conn, external_id, level):
    row = conn.execute(
        """select e.product_canonical_id from public.equivalence e
           join public.product_chain p on p.id = e.product_chain_id
           where p.external_id = %s and e.level = %s""",
        (external_id, level),
    ).fetchone()
    return row[0] if row else None


def test_empareja_y_guarda_en_la_base(conn):
    _load(conn, "dia", [_entry("d1", "Leche semidesnatada Asturiana 1 L", "Asturiana", 1000, "ml")])
    _load(
        conn,
        "alcampo",
        [
            _entry(
                "a1",
                "CENTRAL LECHERA ASTURIANA Leche semidesnatada 1 l",
                "Central Lechera Asturiana",
                1000,
                "ml",
            ),
            _entry("a2", "AUCHAN Leche entera 1 l", "Producto Alcampo", 1000, "ml"),
        ],
    )
    stats = match_db.run(conn)
    assert stats["productos"] == 3
    assert _canonical(conn, "d1", "identical") == _canonical(conn, "a1", "identical")
    assert _canonical(conn, "d1", "equivalent") != _canonical(conn, "a2", "equivalent")
    assert _canonical(conn, "d1", "generic") == _canonical(conn, "a2", "generic")
    count = conn.execute("select count(*) from public.product_chain_embedding").fetchone()[0]
    assert count == 3


def test_no_pisa_las_decisiones_humanas(conn):
    _load(conn, "dia", [_entry("d1", "Leche semidesnatada Asturiana 1 L", "Asturiana", 1000, "ml")])
    match_db.run(conn)
    other = conn.execute(
        "select id from public.product_canonical where key = 'e:leche|entera||'"
    ).fetchone()
    if other is None:
        other = conn.execute(
            """insert into public.product_canonical (category_id, name, level, key)
               select id, 'Leche entera', 'equivalent', 'e:leche|entera||' from public.category
               where slug = 'leche' returning id"""
        ).fetchone()
    pid = conn.execute("select id from public.product_chain where external_id = 'd1'").fetchone()[0]
    conn.execute(
        "delete from public.equivalence where product_chain_id = %s and level = 'equivalent'",
        (pid,),
    )
    conn.execute(
        """insert into public.equivalence (product_chain_id, product_canonical_id, level, confidence, source)
           values (%s, %s, 'equivalent', 1, 'human')""",
        (pid, other[0]),
    )
    match_db.run(conn)
    assert _canonical(conn, "d1", "equivalent") == other[0]


def test_usuario_avisa_de_falsa_equivalencia(conn):
    _load(conn, "dia", [_entry("d1", "Leche semidesnatada Asturiana 1 L", "Asturiana", 1000, "ml")])
    match_db.run(conn)
    pid = conn.execute("select id from public.product_chain where external_id = 'd1'").fetchone()[0]
    can = _canonical(conn, "d1", "equivalent")
    conn.execute("insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000aa')")
    with conn.transaction():
        conn.execute("set local role authenticated")
        conn.execute(
            """set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa"}'"""
        )
        conn.execute("select public.report_not_equivalent(%s, %s, 'No es la misma')", (pid, can))
    row = conn.execute(
        "select reason, status from public.match_review where product_chain_id = %s", (pid,)
    ).fetchone()
    assert row == ("usuario", "pending")
