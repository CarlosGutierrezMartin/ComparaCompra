"""Graba respuestas reales para los tests de contrato (cli.py record-fixtures).

Hace el mínimo de peticiones (unas 15 en total) con el cliente de los conectores
(User-Agent identificado y límite por minuto). Las páginas grandes se recortan a las
partes que leen los conectores, para que los ficheros sean pequeños.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from connectors.http import BlockedError, PoliteClient, Response
from settings import Settings

HERE = Path(__file__).parent

MERCADONA_CATEGORIES = (156, 77, 29)
DIA_PAGES = (
    "https://www.dia.es/agua-y-refrescos/c/L117",
    "https://www.dia.es/agua-y-refrescos/naranja-limon-y-lima-limon/c/L2212",
    "https://www.dia.es/agua-y-refrescos/naranja-limon-y-lima-limon/pag-2/c/L2212",
)
ALCAMPO_SITEMAP = "https://www.compraonline.alcampo.es/sitemaps/sitemap-categories-part1.xml"
ALCAMPO_PAGES = (
    "https://www.compraonline.alcampo.es/categories/frescos/charcutería/charcutería-en-taquitos/taquitos-bacon/OC15400202",
    "https://www.compraonline.alcampo.es/categories/leche-huevos-lácteos-yogures-y-bebidas-vegetales/huevos/huevos-por-tamaños/OCHuevoportallas",
)
CARREFOUR_PAGE = "https://www.carrefour.es/supermercado/la-despensa/cat20001/c"


def save(chain: str, name: str, resp: Response, body: str | None = None) -> None:
    folder = HERE / chain
    folder.mkdir(parents=True, exist_ok=True)
    meta = {
        "url": resp.url,
        "status": resp.status,
        "headers": {
            k: v
            for k, v in resp.headers.items()
            if k.lower().startswith(("content-type", "x-customer"))
        },
    }
    (folder / f"{name}.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    (folder / name).write_text(body if body is not None else resp.text)


def _client(chain: str, settings: Settings) -> PoliteClient:
    return PoliteClient(
        chain=chain,
        user_agent=settings.user_agent,
        requests_per_minute=min(settings.requests_per_minute[chain], 12),
    )


def trim_alcampo_page(html: str) -> str:
    """Conserva solo el ld+json y la parte de productos del estado inicial."""
    marker = "window.__INITIAL_STATE__="
    start = html.find(marker)
    state, _ = json.JSONDecoder().raw_decode(html[start + len(marker) :])
    products = state["data"]["products"]
    slim = {"data": {"products": {k: products[k] for k in ("catalogue", "productEntities")}}}
    ld = re.findall(r"<script[^>]*application/ld\+json[^>]*>.*?</script>", html, re.S)
    return (
        "<html><head>"
        + "".join(ld)
        + f"<script>{marker}{json.dumps(slim, ensure_ascii=False)}</script></head><body></body></html>"
    )


def trim_alcampo_sitemap(xml: str) -> str:
    keep = [
        u
        for u in re.findall(r"<loc>([^<]+)</loc>", xml)
        if "charcuter%C3%ADa" in u or "charcutería" in u or "/huevos/" in u or "/juguetes/" in u
    ][:80]
    locs = "".join(f"<sitemap><loc>{u}</loc></sitemap>" for u in keep)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset>{locs}</urlset>'


def record_all(settings: Settings) -> None:
    c = _client("mercadona", settings)
    save(
        "mercadona",
        "change_pc_28001.json",
        c.request(
            "PUT",
            "https://tienda.mercadona.es/api/postal-codes/actions/change-pc/",
            json_body={"new_postal_code": "28001"},
            use_cache=False,
        ),
    )
    params = {"lang": "es", "wh": "mad3"}
    save(
        "mercadona",
        "categories.json",
        c.get("https://tienda.mercadona.es/api/categories/", params=params),
    )
    for cat in MERCADONA_CATEGORIES:
        save(
            "mercadona",
            f"category_{cat}.json",
            c.get(f"https://tienda.mercadona.es/api/categories/{cat}/", params=params),
        )

    c = _client("dia", settings)
    for i, url in enumerate(DIA_PAGES):
        save("dia", f"page_{i}.html", c.get(url))

    c = _client("alcampo", settings)
    sm = c.get(ALCAMPO_SITEMAP)
    save("alcampo", "sitemap-categories.xml", sm, trim_alcampo_sitemap(sm.text))
    for i, url in enumerate(ALCAMPO_PAGES):
        resp = c.get(url)
        save("alcampo", f"category_{i}.html", resp, trim_alcampo_page(resp.text))

    c = _client("carrefour", settings)
    try:
        c.get(CARREFOUR_PAGE)
        print("Carrefour respondió sin bloqueo: revisar el conector")
    except BlockedError:
        # El cuerpo del bloqueo se graba aparte con una petición sin detección.
        raw = c._http().get(CARREFOUR_PAGE)
        save(
            "carrefour",
            "blocked.html",
            Response(raw.status_code, raw.text, dict(raw.headers), str(raw.url)),
        )
