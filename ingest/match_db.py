"""Ejecuta el emparejamiento sobre los productos de la base de datos (cli.py match).

Las decisiones humanas (source = 'human') nunca se sobrescriben: un producto con un
enlace humano en un nivel conserva ese enlace y el emparejador no lo toca.
"""

from __future__ import annotations

import json
from collections import Counter
from decimal import Decimal

import psycopg

from matching.embeddings import HashingEmbedder, product_text
from matching.llm import StructuredLLM
from matching.matcher import Item, MatchResult, match


def load_items(conn: psycopg.Connection) -> tuple[list[Item], dict[tuple[str, str], int]]:
    rows = conn.execute(
        """select pc.id, c.slug, pc.external_id, pc.name, pc.brand, pc.quantity, pc.unit,
                  pc.units_per_pack, pc.category_ref
           from public.product_chain pc join public.chain c on c.id = pc.chain_id
           where pc.active"""
    ).fetchall()
    items, ids = [], {}
    for pid, chain, ext, name, brand, qty, unit, units, cat in rows:
        it = Item(
            chain, ext, name, brand, Decimal(qty) if qty is not None else None, unit, units, cat
        )
        items.append(it)
        ids[it.key] = pid
    return items, ids


def _human_levels(conn: psycopg.Connection) -> set[tuple[int, str]]:
    rows = conn.execute(
        """select e.product_chain_id, pc.level from public.equivalence e
           join public.product_canonical pc on pc.id = e.product_canonical_id
           where e.source = 'human'"""
    ).fetchall()
    return {(r[0], r[1]) for r in rows}


def save(
    conn: psycopg.Connection, result: MatchResult, ids: dict[tuple[str, str], int]
) -> Counter[str]:
    stats: Counter[str] = Counter()
    human = _human_levels(conn)
    with conn.transaction():
        canonical_ids: dict[str, int] = {}
        for key, can in result.canonicals.items():
            row = conn.execute(
                """insert into public.product_canonical (category_id, name, attributes, level, key)
                   select c.id, %s, %s::jsonb, %s::public.equivalence_level, %s
                   from public.category c where c.slug = %s
                   on conflict (key) do update set name = excluded.name, attributes = excluded.attributes
                   returning id""",
                (
                    can.name,
                    json.dumps(can.attributes, ensure_ascii=False),
                    can.level,
                    key,
                    can.leaf,
                ),
            ).fetchone()
            if row is None:
                raise ValueError(
                    f"La hoja {can.leaf} no está en la tabla category (¿falta el seed?)"
                )
            canonical_ids[key] = int(row[0])

        touched = sorted(
            {ids[link.item] for link in result.links} | {ids[r.item] for r in result.reviews}
        )
        conn.execute(
            "delete from public.equivalence where source <> 'human' and product_chain_id = any(%s)",
            (touched,),
        )
        for link in result.links:
            pid = ids[link.item]
            if (pid, link.level) in human:
                continue
            conn.execute(
                """insert into public.equivalence
                     (product_chain_id, product_canonical_id, level, confidence, source)
                   values (%s, %s, %s, %s, %s)
                   on conflict (product_chain_id, product_canonical_id) do update set
                     level = excluded.level, confidence = excluded.confidence,
                     source = excluded.source, updated_at = now()""",
                (
                    pid,
                    canonical_ids[link.canonical],
                    link.level,
                    round(link.confidence, 3),
                    link.source,
                ),
            )
            stats[f"enlace_{link.level}"] += 1

        for review in result.reviews:
            conn.execute(
                """insert into public.match_review
                     (product_chain_id, other_product_chain_id, proposed_canonical_id, proposed_level,
                      confidence, reason)
                   values (%s, %s, %s, %s, %s, %s)
                   on conflict do nothing""",
                (
                    ids[review.item],
                    ids.get(review.other_item) if review.other_item else None,
                    canonical_ids.get(review.proposed_canonical or ""),
                    review.proposed_level,
                    review.confidence,
                    review.reason,
                ),
            )
            stats[f"revision_{review.reason}"] += 1
    return stats


def save_embeddings(
    conn: psycopg.Connection, items: list[Item], ids: dict[tuple[str, str], int]
) -> None:
    embedder = HashingEmbedder()
    texts = [product_text(it.name, it.brand) for it in items]
    vectors = embedder.embed(texts)
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """insert into public.product_chain_embedding (product_chain_id, text, embedding)
               values (%s, %s, %s::extensions.vector)
               on conflict (product_chain_id) do update set text = excluded.text, embedding = excluded.embedding""",
            [
                (ids[it.key], text, "[" + ",".join(f"{v:.6f}" for v in vec) + "]")
                for it, text, vec in zip(items, texts, vectors, strict=True)
            ],
        )


def run(conn: psycopg.Connection, llm: StructuredLLM | None = None) -> Counter[str]:
    items, ids = load_items(conn)
    result = match(items, llm=llm)
    stats = save(conn, result, ids)
    save_embeddings(conn, items, ids)
    stats["productos"] = len(items)
    return stats
