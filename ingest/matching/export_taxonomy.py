"""Genera, a partir de matching/taxonomy.py:

- supabase/seeds/10_taxonomia.sql: categorías, canónicos genéricos e ingredientes.
- packages/core/src/data/taxonomy.json: la misma taxonomía para la web.

    uv run python -m matching.export_taxonomy
"""

from __future__ import annotations

import json
from pathlib import Path

from .classify_rules import KEYWORDS
from .taxonomy import LEAVES, SECTIONS, diets_excluded, slugify

ROOT = Path(__file__).resolve().parents[2]


def q(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def arr(values: tuple[str, ...] | list[str]) -> str:
    return "'{" + ",".join(v.replace('"', "") for v in values) + "}'"


def sql() -> str:
    out = [
        "-- Generado por ingest/matching/export_taxonomy.py. No editar a mano.",
        "-- Taxonomía canónica: secciones (pasillos), subsecciones y hojas.",
    ]
    for section, _a, _n, subs in SECTIONS:
        sec_slug = f"s-{slugify(section)}"
        out.append(
            "insert into public.category (parent_id, name, slug, aisle) values "
            f"(null, {q(section)}, {q(sec_slug)}, {q(section)}) on conflict (slug) do nothing;"
        )
        for sub in subs:
            sub_slug = f"ss-{slugify(section)}-{slugify(sub)}"
            out.append(
                "insert into public.category (parent_id, name, slug, aisle) "
                f"select id, {q(sub)}, {q(sub_slug)}, {q(section)} from public.category "
                f"where slug = {q(sec_slug)} on conflict (slug) do nothing;"
            )
    out.append("\n-- Hojas, su canónico genérico y su ingrediente.")
    for leaf in LEAVES:
        sub_slug = f"ss-{slugify(leaf.section)}-{slugify(leaf.subsection)}"
        attrs = json.dumps(
            {"variants": list(leaf.variants), "aliases": list(leaf.aliases)}, ensure_ascii=False
        )
        out.append(
            "insert into public.category (parent_id, name, slug, aisle) "
            f"select id, {q(leaf.name)}, {q(leaf.slug)}, {q(leaf.section)} from public.category "
            f"where slug = {q(sub_slug)} on conflict (slug) do nothing;"
        )
        out.append(
            "insert into public.product_canonical (category_id, name, attributes, level, key) "
            f"select id, {q(leaf.name)}, {q(attrs)}::jsonb, 'generic', {q('g:' + leaf.slug)} "
            f"from public.category where slug = {q(leaf.slug)} on conflict (key) do nothing;"
        )
        out.append(
            "insert into public.ingredient (name, product_canonical_id, default_unit, allergens, not_suitable_for) "
            f"select {q(leaf.name)}, id, {q(leaf.unit)}, {arr(leaf.allergens)}, {arr(diets_excluded(leaf))} "
            f"from public.product_canonical where key = {q('g:' + leaf.slug)} "
            "on conflict (name) do update set allergens = excluded.allergens, "
            "not_suitable_for = excluded.not_suitable_for;"
        )
    return "\n".join(out) + "\n"


def as_json() -> dict:
    return {
        "sections": [
            {"name": section, "subsections": list(subs)} for section, _a, _n, subs in SECTIONS
        ],
        "leaves": [
            {
                "slug": leaf.slug,
                "name": leaf.name,
                "section": leaf.section,
                "subsection": leaf.subsection,
                "unit": leaf.unit,
                "variants": list(leaf.variants),
                "aliases": list(leaf.aliases),
                # Mismas palabras clave que el clasificador de productos (classify_rules.py).
                "keywords": list(KEYWORDS.get(leaf.slug) or (leaf.name.lower(), *leaf.aliases)),
                "allergens": list(leaf.allergens),
                "notFor": list(diets_excluded(leaf)),
            }
            for leaf in LEAVES
        ],
    }


def main() -> None:
    seed = ROOT / "supabase/seeds/10_taxonomia.sql"
    seed.write_text(sql())
    data = ROOT / "packages/core/src/data/taxonomy.json"
    data.parent.mkdir(parents=True, exist_ok=True)
    data.write_text(json.dumps(as_json(), ensure_ascii=False, indent=1) + "\n")
    print(seed, data)


if __name__ == "__main__":
    main()
