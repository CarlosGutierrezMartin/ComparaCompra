"""Catálogo estático para la demo sin servidor (GitHub Pages).

Exporta de la base de datos lo que la web consulta con SQL en `apps/web/src/server`:
productos activos con su precio vigente por zona, sus enlaces de equivalencia con los
atributos del canónico, la zona de cada código postal por cadena y el peso por pieza de
fruta y verdura. La web lo filtra en el móvil con las mismas reglas
(`apps/web/src/lib/demo-catalog.ts`).
"""

from __future__ import annotations

from datetime import UTC
from decimal import Decimal
from typing import Any

import psycopg

LEVEL = {"generic": "g", "equivalent": "e", "identical": "i"}


def _num(x: Decimal | None) -> float | None:
    return None if x is None else float(x)


def export(conn: psycopg.Connection) -> dict[str, Any]:
    products: dict[int, dict[str, Any]] = {}
    for row in conn.execute(
        """
        select p.id, ch.slug, p.name, p.brand, p.quantity, p.unit, p.units_per_pack, p.url
        from public.product_chain p join public.chain ch on ch.id = p.chain_id
        where p.active and exists (
          select 1 from public.price pr where pr.product_chain_id = p.id and pr.valid_to is null)
        order by p.id
        """
    ):
        pid, chain, name, brand, quantity, unit, units, url = row
        products[pid] = {
            "id": pid,
            "chain": chain,
            "name": name,
            "brand": brand,
            "quantity": _num(quantity),
            "unit": unit,
            "unitsPerPack": units,
            "url": url,
            "links": [],
            "prices": {},
        }

    # Enlaces: [nivel, canónico, hoja, variante, marcas, rasgos]
    for row in conn.execute(
        """
        select e.product_chain_id, e.level, cn.id, cat.slug,
               cn.attributes->>'variant',
               coalesce(cn.attributes->'flags', '[]'::jsonb),
               coalesce(cn.attributes->'traits', '[]'::jsonb)
        from public.equivalence e
        join public.product_canonical cn on cn.id = e.product_canonical_id
        join public.category cat on cat.id = cn.category_id
        where e.level = cn.level
        order by e.product_chain_id, cn.id
        """
    ):
        pid, level, cid, leaf, variant, flags, traits = row
        if pid in products:
            products[pid]["links"].append(
                [LEVEL[level], cid, leaf, variant, sorted(flags), sorted(traits)]
            )

    for row in conn.execute(
        """
        select pr.product_chain_id, pr.price_zone_id, pr.price, pr.unit_price,
               pr.promo->>'text', pr.checked_at, pr.source
        from public.price pr where pr.valid_to is null
        """
    ):
        pid, zone, price, unit_price, promo, checked_at, source = row
        if pid in products:
            products[pid]["prices"][str(zone)] = [
                float(price),
                _num(unit_price),
                promo,
                checked_at.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                source,
            ]

    zones: dict[str, dict[str, int]] = {}
    for postal_code, chain, zone in conn.execute(
        """
        select pcz.postal_code, ch.slug, pcz.price_zone_id
        from public.postal_code_zone pcz join public.chain ch on ch.id = pcz.chain_id
        order by 1, 2
        """
    ):
        zones.setdefault(postal_code, {})[chain] = zone

    # Misma regla que unitWeightsForLeaves en apps/web/src/server/catalog.ts.
    unit_weights = {
        leaf: float(grams)
        for leaf, grams in conn.execute(
            r"""
            select cat.slug, percentile_cont(0.5) within group (order by p.quantity)
            from public.product_canonical cn
            join public.category cat on cat.id = cn.category_id
            join public.equivalence e on e.product_canonical_id = cn.id and e.level = 'generic'
            join public.product_chain p on p.id = e.product_chain_id and p.active
            join public.chain ch on ch.id = p.chain_id
            where cn.level = 'generic' and cat.aisle in ('Fruta', 'Verdura')
              and p.unit = 'g' and p.units_per_pack = 1 and p.quantity > 0 and p.quantity < 600
              and (
                p.name ~* '\m(unidad|pieza)\M'
                or (ch.slug = 'mercadona' and p.name !~ '\d' and p.name !~* 's$'
                    and array_length(regexp_split_to_array(p.name, '\s+'), 1) <= 3)
              )
            group by cat.slug
            """
        )
    }

    checked = [p[3] for prod in products.values() for p in prod["prices"].values()]
    return {
        "version": 1,
        "pricesUpTo": max(checked) if checked else None,
        "products": [p for p in products.values() if p["prices"] and p["links"]],
        "zones": zones,
        "unitWeights": unit_weights,
    }
