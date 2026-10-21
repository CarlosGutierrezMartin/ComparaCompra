"""Muestra de catálogo real de productos básicos (cli.py record-sample).

Sirve para el conjunto de referencia del emparejamiento, los casos reales del parser
de formatos y los datos de desarrollo. Unas 130 peticiones a ritmo lento; se guardan
solo los datos factuales ya interpretados por los conectores, con su fecha de captura.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote

from connectors import alcampo, dia, mercadona
from connectors.base import _with_unit_price
from connectors.http import PoliteClient
from connectors.models import CatalogEntry
from settings import Settings

OUT = Path(__file__).parent / "sample"

MERCADONA_SUBCATEGORIES = (
    72,
    77,
    112,
    118,
    120,
    121,
    38,
    44,
    37,
    126,
    29,
    27,
    28,
    122,
    54,
    56,
    60,
    104,
    149,
    31,
    145,
    75,
    69,
    89,
    83,
    238,
    226,
    156,
    129,
    53,
)
DIA_SUBCATEGORIES = (
    "/huevos-leche-y-mantequilla/leche/c/L2051",
    "/huevos-leche-y-mantequilla/huevos/c/L2055",
    "/aceites-salsas-y-especias/aceites/c/L2046",
    "/arroz-pastas-y-legumbres/arroz/c/L2042",
    "/arroz-pastas-y-legumbres/macarrones-espaguetis-y-pastas-secas/c/L2044",
    "/arroz-pastas-y-legumbres/garbanzos-y-alubias/c/L2191",
    "/arroz-pastas-y-legumbres/lentejas/c/L2193",
    "/carnes/pollo/c/L2202",
    "/carnes/hamburguesas-carne-picada-y-albondigas/c/L2017",
    "/carnes/cerdo/c/L2014",
    "/aceites-salsas-y-especias/salsas-de-tomate-y-pasta/c/L2208",
    "/verduras/tomates-pimientos-y-pepinos/c/L2023",
    "/verduras/ajos-cebollas-y-puerros/c/L2022",
    "/verduras/patatas-y-zanahorias/c/L2028",
    "/verduras/lechugas-y-hojas-verdes/c/L2027",
    "/verduras/setas-y-champinones/c/L2029",
    "/frutas/platanos-y-bananas/c/L2033",
    "/frutas/manzanas-y-peras/c/L2032",
    "/conservas-caldos-y-cremas/atun-y-bonito/c/L2179",
    "/conservas-caldos-y-cremas/caldos-y-sopas/c/L2093",
    "/quesos/curado/c/L2007",
    "/quesos/rallado/c/L2347",
    "/quesos/fresco/c/L2008",
    "/panaderia/pan-de-molde-y-especiales/c/L2069",
    "/yogures-y-postres/yogures-naturales-y-desnatados/c/L2079",
    "/pescados-y-mariscos/fresco/c/L2019",
    "/pescados-y-mariscos/congelado/c/L2249",
    "/verduras/verduras-congeladas/c/L2025",
    "/huevos-leche-y-mantequilla/mantequilla-y-margarina/c/L2056",
    "/huevos-leche-y-mantequilla/nata/c/L2054",
)
# Palabras para elegir hojas de Alcampo equivalentes a las de las otras cadenas.
ALCAMPO_KEYWORDS = (
    "leche/leche-entera",
    "leche/leche-semidesnatada",
    "leche/leche-desnatada",
    "huevos/huevos-por-tamaños",
    "aceite-de-oliva",
    "aceite-de-girasol",
    "arroz/",
    "pasta/macarrones",
    "pasta/espaguetis",
    "legumbres",
    "pollo",
    "carne-picada",
    "cerdo",
    "tomate-frito",
    "tomates",
    "cebollas",
    "patatas",
    "zanahorias",
    "lechugas",
    "champiñones",
    "plátanos",
    "manzanas",
    "atún",
    "caldos",
    "queso-curado",
    "queso-rallado",
    "queso-fresco",
    "pan-de-molde",
    "yogures-naturales",
    "merluza",
    "verduras-congeladas",
    "mantequilla",
    "nata",
    "harina",
    "azúcar",
    "café-molido",
    "papel-higiénico",
    "detergente",
)
MAX_ALCAMPO_LEAVES = 45


def _client(chain: str, settings: Settings) -> PoliteClient:
    return PoliteClient(
        chain=chain,
        user_agent=settings.user_agent,
        requests_per_minute=min(settings.requests_per_minute[chain], 12),
    )


def _save(chain: str, zone: str, entries: list[CatalogEntry]) -> None:
    unique: dict[str, CatalogEntry] = {}
    for e in entries:
        unique.setdefault(e.product.external_id, _with_unit_price(e))
    OUT.mkdir(exist_ok=True)
    payload = {
        "chain": chain,
        "zone": zone,
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "entries": [json.loads(e.model_dump_json()) for e in unique.values()],
    }
    (OUT / f"{chain}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    print(f"{chain}: {len(unique)} productos")


def record_sample(settings: Settings) -> None:
    c = _client("mercadona", settings)
    params = {"lang": "es", "wh": "mad3"}
    tree = c.get("https://tienda.mercadona.es/api/categories/", params=params).json()
    names = {s["id"]: (t["name"], s["name"]) for t in tree["results"] for s in t["categories"]}
    entries: list[CatalogEntry] = []
    for sub in MERCADONA_SUBCATEGORIES:
        data = c.get(f"https://tienda.mercadona.es/api/categories/{sub}/", params=params).json()
        top, name = names.get(sub, ("", str(sub)))
        for leaf in data.get("categories", []):
            for raw in leaf.get("products", []):
                e = mercadona.parse_product(raw, f"{top} > {name} > {leaf['name']}")
                if e:
                    entries.append(e)
    _save("mercadona", "mad3", entries)

    c = _client("dia", settings)
    conn = dia.DiaConnector(c)
    conn.subcategories = lambda: [  # type: ignore[method-assign]
        (link.rsplit("/", 1)[-1], link, link.split("/")[2]) for link in DIA_SUBCATEGORIES
    ]
    _save("dia", "web", conn._fetch_listing(conn.resolve_zone("28001")))

    c = _client("alcampo", settings)
    xml = c.get(alcampo.CATEGORY_SITEMAP).text
    leaves = alcampo.leaf_category_urls(xml)
    chosen = []
    for kw in ALCAMPO_KEYWORDS:
        match = [u for u in leaves if kw in unquote(u) and u not in chosen][:2]
        chosen.extend(match)
    entries = []
    for url in chosen[:MAX_ALCAMPO_LEAVES]:
        page_entries, _ = alcampo.parse_category_page(c.get(url).text)
        entries.extend(page_entries)
    _save("alcampo", "web", entries)


if __name__ == "__main__":
    raise SystemExit("Usa: uv run python cli.py record-sample")
