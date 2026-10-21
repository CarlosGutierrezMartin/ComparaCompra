"""Línea de órdenes de la ingesta.

    uv run python cli.py zones --chain mercadona --city madrid
    uv run python cli.py run --chain dia [--dry-run]
    uv run python cli.py record-fixtures

`run` termina con código 1 si alguna captura acaba en alerta, bloqueo o error, para que
el cron de GitHub Actions falle y avise por correo.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import psycopg

import load
from connectors import CONNECTORS
from connectors.base import Connector
from connectors.http import BlockedError, PoliteClient
from connectors.models import Zone
from settings import Settings, load_settings
from zones import CITIES


def make_connector(slug: str, settings: Settings, *, cache: bool = True) -> Connector:
    client = PoliteClient(
        chain=slug,
        user_agent=settings.user_agent,
        requests_per_minute=settings.requests_per_minute[slug],
        cache_dir=Path(settings.cache_dir) if cache else None,
    )
    return CONNECTORS[slug](client)


def _connect(settings: Settings) -> psycopg.Connection:
    if not settings.database_url:
        sys.exit("Falta SUPABASE_DB_URL (ver .env.example)")
    return psycopg.connect(settings.database_url, autocommit=True)


def cmd_zones(args: argparse.Namespace, settings: Settings) -> int:
    """Asigna cada código postal de la ciudad a su zona de precios.

    Con --out guarda la asignación en un JSON (sin base de datos); con --from-file la
    carga en la base de datos sin hacer peticiones.
    """
    postal_codes = CITIES[args.city]
    if args.from_file:
        data = json.loads(Path(args.from_file).read_text())
        assignments = [(pc, Zone(**z)) for pc, z in data["postal_codes"].items()]
    else:
        connector = make_connector(args.chain, settings, cache=False)
        assignments = []
        for pc in postal_codes:
            zone = connector.resolve_zone(pc)
            assignments.append((pc, zone))
            print(f"{args.chain} {pc} -> {zone.external_ref}", flush=True)
        connector.client.close()
    if args.out:
        payload = {
            "chain": args.chain,
            "city": args.city,
            "resolved_at": datetime.now(UTC).date().isoformat(),
            "postal_codes": {pc: z.model_dump() for pc, z in assignments},
        }
        Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
        return 0
    with _connect(settings) as conn:
        chain = load.chain_id(conn, args.chain)
        for pc, zone in assignments:
            zone_id = load.upsert_zone(conn, chain, zone)
            load.upsert_postal_code(conn, pc, chain, zone_id)
    return 0


def cmd_run(args: argparse.Namespace, settings: Settings) -> int:
    chains = list(CONNECTORS) if args.chain == "all" else [args.chain]
    failed = False
    summary: list[str] = []
    for slug in chains:
        connector = make_connector(slug, settings)
        if args.dry_run:
            zone = connector.resolve_zone(CITIES[args.city][0])
            try:
                entries = connector.listing(zone)
            except BlockedError as exc:
                print(f"{slug}: BLOQUEADA ({exc})")
                failed = True
                continue
            print(
                json.dumps(
                    {
                        "chain": slug,
                        "zone": zone.external_ref,
                        "products": len(entries),
                        "requests": connector.client.requests_made,
                        "truncated": connector.stats.truncated_categories,
                    },
                    ensure_ascii=False,
                )
            )
            continue
        with _connect(settings) as conn:
            chain = load.chain_id(conn, slug)
            zones = load.zones_for_chain(conn, chain)
            if not zones:
                print(f"{slug}: sin zonas; ejecuta antes `cli.py zones --chain {slug}`")
                failed = True
                continue
            run_start = datetime.now(UTC).isoformat()
            all_ok = True
            for zone_id, zone in zones:
                run_id = load.start_run(conn, chain, zone_id)
                try:
                    entries = connector.listing(zone)
                    result = load.load_listing(conn, chain, zone_id, entries)
                    load.finish_run(
                        conn,
                        run_id,
                        status=result.status,
                        products=result.products,
                        requests=connector.client.requests_made,
                        price_changes=result.price_changes,
                        message=result.message,
                        truncated=connector.stats.truncated_categories,
                    )
                    summary.append(
                        f"{slug}/{zone.external_ref}: {result.status}, "
                        f"{result.products} productos, {result.price_changes} cambios"
                    )
                    if result.status != "ok":
                        all_ok = False
                except BlockedError as exc:
                    load.finish_run(
                        conn,
                        run_id,
                        status="blocked",
                        message=str(exc),
                        requests=connector.client.requests_made,
                    )
                    summary.append(f"{slug}/{zone.external_ref}: bloqueada")
                    all_ok = False
                    break
                except Exception as exc:  # el error queda registrado y no para otras cadenas
                    load.finish_run(
                        conn,
                        run_id,
                        status="error",
                        message=repr(exc)[:2000],
                        requests=connector.client.requests_made,
                    )
                    summary.append(f"{slug}/{zone.external_ref}: error {exc!r}")
                    all_ok = False
            if all_ok:
                load.deactivate_unseen_products(conn, chain, run_start)
            failed = failed or not all_ok
        connector.client.close()
    print("\n".join(summary))
    return 1 if failed else 0


def cmd_record_fixtures(args: argparse.Namespace, settings: Settings) -> int:
    from tests.fixtures.record import record_all

    record_all(settings)
    return 0


def cmd_record_sample(args: argparse.Namespace, settings: Settings) -> int:
    from tests.fixtures.sample import record_sample

    record_sample(settings)
    return 0


def cmd_match(args: argparse.Namespace, settings: Settings) -> int:
    import match_db
    from matching.llm import ClaudeLLM, available

    llm = None
    if args.llm:
        if not available():
            sys.exit("Falta ANTHROPIC_API_KEY para usar la IA")
        llm = ClaudeLLM()
    with _connect(settings) as conn:
        stats = match_db.run(conn, llm)
    print(json.dumps(dict(stats), ensure_ascii=False, indent=1))
    return 0


def cmd_load_sample(args: argparse.Namespace, settings: Settings) -> int:
    """Carga la muestra real grabada (tests/fixtures/sample) como datos de desarrollo."""
    from connectors.models import CatalogEntry

    sample_dir = Path(__file__).parent / "tests/fixtures/sample"
    with _connect(settings) as conn:
        for path in sorted(sample_dir.glob("*.json")):
            data = json.loads(path.read_text())
            chain = load.chain_id(conn, data["chain"])
            zone_id = load.upsert_zone(conn, chain, Zone(external_ref=data["zone"]))
            entries = [CatalogEntry.model_validate(e) for e in data["entries"]]
            entries = [
                e.model_copy(
                    update={
                        "price": e.price.model_copy(
                            update={"source": f"{e.price.source} (muestra)"}
                        )
                    }
                )
                for e in entries
            ]
            load.load_listing(conn, chain, zone_id, entries, deactivate_missing=False)
            conn.execute(
                "update public.price set checked_at = %s, valid_from = least(valid_from, %s) "
                "where price_zone_id = %s and valid_to is null",
                (data["captured_at"], data["captured_at"], zone_id),
            )
            print(f"{data['chain']}: {len(entries)} productos (captura {data['captured_at']})")
    return 0


def cmd_export_demo(args: argparse.Namespace, settings: Settings) -> int:
    """Escribe el catálogo estático de la demo sin servidor (GitHub Pages)."""
    import export_demo

    with _connect(settings) as conn:
        data = export_demo.export(conn)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(data['products'])} productos, {len(data['zones'])} códigos postales -> {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingesta de precios de ComparaCompra")
    sub = parser.add_subparsers(dest="cmd", required=True)
    z = sub.add_parser("zones", help="Asigna códigos postales a zonas de precio")
    z.add_argument("--chain", choices=list(CONNECTORS), required=True)
    z.add_argument("--city", choices=list(CITIES), default="madrid")
    z.add_argument("--out", help="Guarda la asignación en este JSON en vez de la base de datos")
    z.add_argument("--from-file", help="Carga una asignación guardada antes con --out")
    r = sub.add_parser("run", help="Captura catálogo y precios")
    r.add_argument("--chain", choices=[*CONNECTORS, "all"], required=True)
    r.add_argument("--city", choices=list(CITIES), default="madrid")
    r.add_argument("--dry-run", action="store_true", help="No escribe en la base de datos")
    sub.add_parser("record-fixtures", help="Graba respuestas reales para los tests de contrato")
    sub.add_parser("record-sample", help="Graba una muestra de catálogo real de productos básicos")
    m = sub.add_parser("match", help="Empareja los productos de la base de datos")
    m.add_argument(
        "--llm", action="store_true", help="Usa la IA para lo que las reglas no resuelven"
    )
    sub.add_parser("load-sample", help="Carga la muestra grabada en la base de datos (desarrollo)")
    d = sub.add_parser("export-demo", help="Exporta el catálogo estático de la demo (GitHub Pages)")
    d.add_argument("--out", required=True, help="Ruta del JSON")
    args = parser.parse_args(argv)
    settings = load_settings()
    handlers = {
        "zones": cmd_zones,
        "run": cmd_run,
        "record-fixtures": cmd_record_fixtures,
        "record-sample": cmd_record_sample,
        "match": cmd_match,
        "load-sample": cmd_load_sample,
        "export-demo": cmd_export_demo,
    }
    return handlers[args.cmd](args, settings)


if __name__ == "__main__":
    sys.exit(main())
