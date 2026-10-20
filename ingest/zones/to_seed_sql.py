"""Genera supabase/seeds/zonas_<ciudad>.sql a partir de los JSON de zones/.

uv run python zones/to_seed_sql.py madrid
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[1]


def sql_literal(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def main(city: str) -> None:
    lines = [
        f"-- Generado por ingest/zones/to_seed_sql.py a partir de ingest/zones/*_{city}.json.",
        "-- No editar a mano.",
    ]
    for path in sorted(HERE.glob(f"*_{city}.json")):
        data = json.loads(path.read_text())
        chain = data["chain"]
        lines.append(f"\n-- {chain}: resuelto el {data['resolved_at']}")
        zones = {z["external_ref"]: z["name"] for z in data["postal_codes"].values()}
        for ref, name in sorted(zones.items()):
            lines.append(
                "insert into public.price_zone (chain_id, external_ref, name) "
                f"select id, {sql_literal(ref)}, {sql_literal(name)} from public.chain "
                f"where slug = {sql_literal(chain)} on conflict (chain_id, external_ref) do nothing;"
            )
        values = ",\n  ".join(
            f"({sql_literal(pc)}, {sql_literal(z['external_ref'])})"
            for pc, z in sorted(data["postal_codes"].items())
        )
        lines.append(
            "insert into public.postal_code_zone (postal_code, chain_id, price_zone_id)\n"
            "select v.pc, c.id, z.id from (values\n  "
            + values
            + f"\n) as v(pc, ref)\njoin public.chain c on c.slug = {sql_literal(chain)}\n"
            "join public.price_zone z on z.chain_id = c.id and z.external_ref = v.ref\n"
            "on conflict (postal_code, chain_id) do update set price_zone_id = excluded.price_zone_id;"
        )
    out = ROOT / "supabase" / "seeds" / f"zonas_{city}.sql"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n")
    print(out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "madrid")
