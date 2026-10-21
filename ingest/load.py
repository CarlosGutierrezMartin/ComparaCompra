"""Carga de catálogo y precios en Postgres (Supabase) con histórico por intervalos.

Reglas (docs/SPEC.md): fila nueva de precio solo si cambia el precio o la promoción;
si no cambia, se actualiza checked_at, que es la fecha que ve el usuario.
Si una captura trae más de un 20 % menos de productos que la anterior correcta, se
marca como alerta y no se desactiva ni se cierra nada: puede ser un fallo de la fuente.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal

import psycopg

from connectors.models import CatalogEntry, Zone

DROP_ALERT_RATIO = Decimal("0.8")


@dataclass
class LoadResult:
    products: int
    price_changes: int
    previous_products: int | None
    status: str
    message: str | None = None
    truncated: list[str] = field(default_factory=list)


def chain_id(conn: psycopg.Connection, slug: str) -> int:
    row = conn.execute("select id from public.chain where slug = %s", (slug,)).fetchone()
    if row is None:
        raise ValueError(f"La cadena {slug} no está en la tabla chain (¿falta el seed?)")
    return int(row[0])


def upsert_zone(conn: psycopg.Connection, chain: int, zone: Zone) -> int:
    row = conn.execute(
        """insert into public.price_zone (chain_id, external_ref, name) values (%s, %s, %s)
           on conflict (chain_id, external_ref) do update set name = excluded.name
           returning id""",
        (chain, zone.external_ref, zone.name),
    ).fetchone()
    assert row is not None
    return int(row[0])


def upsert_postal_code(
    conn: psycopg.Connection, postal_code: str, chain: int, zone_id: int
) -> None:
    conn.execute(
        """insert into public.postal_code_zone (postal_code, chain_id, price_zone_id)
           values (%s, %s, %s)
           on conflict (postal_code, chain_id) do update set price_zone_id = excluded.price_zone_id""",
        (postal_code, chain, zone_id),
    )


def zones_for_chain(conn: psycopg.Connection, chain: int) -> list[tuple[int, Zone]]:
    rows = conn.execute(
        """select distinct z.id, z.external_ref, z.name from public.price_zone z
           join public.postal_code_zone p on p.price_zone_id = z.id
           where z.chain_id = %s order by z.id""",
        (chain,),
    ).fetchall()
    return [(int(r[0]), Zone(external_ref=r[1], name=r[2])) for r in rows]


def start_run(conn: psycopg.Connection, chain: int, zone_id: int | None) -> int:
    row = conn.execute(
        "insert into public.ingest_run (chain_id, price_zone_id, status) values (%s, %s, 'running') returning id",
        (chain, zone_id),
    ).fetchone()
    assert row is not None
    return int(row[0])


def finish_run(
    conn: psycopg.Connection,
    run_id: int,
    *,
    status: str,
    products: int = 0,
    requests: int = 0,
    price_changes: int = 0,
    message: str | None = None,
    truncated: list[str] | None = None,
) -> None:
    conn.execute(
        """update public.ingest_run set finished_at = now(), status = %s, products = %s,
           requests = %s, price_changes = %s, message = %s, truncated_categories = %s
           where id = %s""",
        (status, products, requests, price_changes, message, truncated or [], run_id),
    )


def previous_count(conn: psycopg.Connection, chain: int, zone_id: int) -> int | None:
    row = conn.execute(
        """select products from public.ingest_run
           where chain_id = %s and price_zone_id = %s and status = 'ok'
           order by started_at desc limit 1""",
        (chain, zone_id),
    ).fetchone()
    return int(row[0]) if row else None


def load_listing(
    conn: psycopg.Connection,
    chain: int,
    zone_id: int,
    entries: list[CatalogEntry],
    *,
    deactivate_missing: bool = True,
) -> LoadResult:
    """Carga productos y precios de una zona en una transacción."""
    prev = previous_count(conn, chain, zone_id)
    alert = prev is not None and prev > 0 and Decimal(len(entries)) < DROP_ALERT_RATIO * prev

    with conn.transaction():
        conn.execute(
            """create temp table tmp_listing (
                 external_id text, name text, brand text, quantity numeric, unit public.unit_kind,
                 units_per_pack int, ean text, category_ref text, url text,
                 price numeric, unit_price numeric, promo jsonb, source text
               ) on commit drop"""
        )
        with conn.cursor().copy("copy tmp_listing from stdin") as copy:
            for e in entries:
                p, r = e.product, e.price
                copy.write_row(
                    (
                        p.external_id,
                        p.name,
                        p.brand,
                        p.quantity,
                        p.unit,
                        p.units_per_pack,
                        p.ean,
                        p.category_ref,
                        p.url,
                        r.price,
                        r.unit_price,
                        json.dumps(r.promo, sort_keys=True) if r.promo else None,
                        r.source,
                    )
                )

        conn.execute(
            """insert into public.product_chain
                 (chain_id, external_id, name, brand, quantity, unit, units_per_pack, ean,
                  category_ref, url, active, last_seen_at)
               select %s, external_id, name, brand, quantity, unit, units_per_pack, ean,
                      category_ref, url, true, now()
               from tmp_listing
               on conflict (chain_id, external_id) do update set
                 name = excluded.name, brand = coalesce(excluded.brand, product_chain.brand),
                 quantity = excluded.quantity, unit = excluded.unit,
                 units_per_pack = excluded.units_per_pack,
                 ean = coalesce(excluded.ean, product_chain.ean),
                 category_ref = excluded.category_ref, url = excluded.url,
                 active = true, last_seen_at = now()""",
            (chain,),
        )
        conn.execute(
            """create temp table tmp_price on commit drop as
               select pc.id as product_chain_id, t.price, t.unit_price, t.promo, t.source
               from tmp_listing t
               join public.product_chain pc on pc.chain_id = %s and pc.external_id = t.external_id""",
            (chain,),
        )
        # 1. Precio sin cambios: solo se confirma la fecha.
        conn.execute(
            """update public.price p set checked_at = now()
               from tmp_price t
               where p.product_chain_id = t.product_chain_id and p.price_zone_id = %s
                 and p.valid_to is null and p.price = t.price
                 and p.promo is not distinct from t.promo""",
            (zone_id,),
        )
        # 2. Precio cambiado: se cierra el intervalo vigente.
        changed = conn.execute(
            """update public.price p set valid_to = now()
               from tmp_price t
               where p.product_chain_id = t.product_chain_id and p.price_zone_id = %s
                 and p.valid_to is null
                 and (p.price <> t.price or p.promo is distinct from t.promo)""",
            (zone_id,),
        ).rowcount
        # 3. Nuevo intervalo para los cambiados y para los productos sin precio vigente.
        conn.execute(
            """insert into public.price
                 (product_chain_id, price_zone_id, price, unit_price, promo, source, valid_from, checked_at)
               select t.product_chain_id, %s, t.price, t.unit_price, t.promo, t.source, now(), now()
               from tmp_price t
               where not exists (
                 select 1 from public.price p
                 where p.product_chain_id = t.product_chain_id and p.price_zone_id = %s
                   and p.valid_to is null)""",
            (zone_id, zone_id),
        )
        if deactivate_missing and not alert:
            # Productos que ya no aparecen en esta zona: su precio deja de estar vigente.
            conn.execute(
                """update public.price p set valid_to = now()
                   where p.price_zone_id = %s and p.valid_to is null
                     and not exists (select 1 from tmp_price t where t.product_chain_id = p.product_chain_id)""",
                (zone_id,),
            )

    status = "alert" if alert else "ok"
    message = (
        f"Caída de productos: {len(entries)} frente a {prev} en la captura anterior (> 20 %)"
        if alert
        else None
    )
    return LoadResult(
        products=len(entries),
        price_changes=changed,
        previous_products=prev,
        status=status,
        message=message,
    )


def deactivate_unseen_products(conn: psycopg.Connection, chain: int, since_run_start: str) -> int:
    """Marca como inactivos los productos que no aparecieron en ninguna zona de la captura."""
    return conn.execute(
        """update public.product_chain set active = false
           where chain_id = %s and active and last_seen_at < %s::timestamptz""",
        (chain, since_run_start),
    ).rowcount
