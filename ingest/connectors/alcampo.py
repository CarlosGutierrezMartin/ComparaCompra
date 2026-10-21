"""Conector de Alcampo: páginas de categoría de compraonline.alcampo.es.

Cada página lleva el estado inicial de la tienda (window.__INITIAL_STATE__) con los
productos de la categoría. Las categorías hoja salen del sitemap público.
Sin código postal, la web muestra su precio online general: es la zona "web".
"""

from __future__ import annotations

import json
import re
from decimal import Decimal
from urllib.parse import unquote

from matching.formats import parse_format, parse_format_checked

from .base import Connector
from .models import CatalogEntry, ChainProduct, PriceRecord, Zone

BASE = "https://www.compraonline.alcampo.es"
CATEGORY_SITEMAP = f"{BASE}/sitemaps/sitemap-categories-part1.xml"
# Raíces de alimentación, droguería e higiene; se dejan fuera bazar, electrónica,
# folletos y las vistas duplicadas (ecológico, veganos, sin gluten).
GROCERY_ROOTS = (
    "frescos",
    "alimentación",
    "bebidas",
    "desayuno-y-merienda",
    "leche-huevos-lácteos-yogures-y-bebidas-vegetales",
    "congelados",
    "comida-preparada",
    "droguería",
    "perfumeria",
    "bebé",
    "mascotas",
)

_LOC = re.compile(r"<loc>([^<]+)</loc>")
_STATE = "window.__INITIAL_STATE__="
_UNIT_LABEL = {
    "fop.price.per.kg": Decimal(1),
    "fop.price.per.litre": Decimal(1),
    "fop.price.per.liter": Decimal(1),
    "fop.price.per.each": Decimal(1),
    "fop.price.per.unit": Decimal(1),
    "fop.price.per.100g": Decimal("0.1"),
    "fop.price.per.100ml": Decimal("0.1"),
    "fop.price.per.dozen": Decimal(12),
}


class AlcampoConnector(Connector):
    slug = "alcampo"
    name = "Alcampo"
    website_url = BASE

    def resolve_zone(self, postal_code: str) -> Zone:
        return Zone(external_ref="web", name="Web (precio online sin código postal)")

    def leaf_categories(self) -> list[str]:
        xml = self.client.get(CATEGORY_SITEMAP).text
        self.stats.pages += 1
        return leaf_category_urls(xml)

    def _fetch_listing(self, zone: Zone) -> list[CatalogEntry]:
        entries: list[CatalogEntry] = []
        for url in self.leaf_categories():
            html = self.client.get(url).text
            self.stats.pages += 1
            page_entries, total = parse_category_page(html)
            entries.extend(page_entries)
            if total > len(page_entries):
                self.stats.truncated_categories.append(f"{url} ({total} productos)")
        return entries


def leaf_category_urls(sitemap_xml: str, roots: tuple[str, ...] = GROCERY_ROOTS) -> list[str]:
    urls = [u for u in _LOC.findall(sitemap_xml) if "/categories/" in u]
    by_path: dict[str, str] = {}
    for u in urls:
        rest = unquote(u.split("/categories/", 1)[1])
        path = rest.rsplit("/", 1)[0]
        if path.split("/", 1)[0] in roots:
            by_path[path] = u
    paths = sorted(by_path)
    leaves = [p for i, p in enumerate(paths) if not _has_child(paths, i)]
    return [by_path[p] for p in leaves]


def _has_child(sorted_paths: list[str], i: int) -> bool:
    nxt = sorted_paths[i + 1] if i + 1 < len(sorted_paths) else ""
    return nxt.startswith(sorted_paths[i] + "/")


def _initial_state(html: str) -> dict:
    start = html.find(_STATE)
    if start < 0:
        raise ValueError("Alcampo: la página no trae el estado inicial")
    obj, _ = json.JSONDecoder().raw_decode(html[start + len(_STATE) :])
    return obj


def parse_category_page(html: str) -> tuple[list[CatalogEntry], int]:
    state = _initial_state(html)
    products = state["data"]["products"]
    catalogue = (products.get("catalogue") or {}).get("data") or {}
    total = int(catalogue.get("totalProducts") or 0)

    urls: dict[str, str] = {}
    for block in re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", html, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if data.get("@type") == "ItemList":
            for el in data.get("itemListElement", []):
                url = el.get("url", "")
                urls[url.rsplit("/", 1)[-1]] = url

    entries: list[CatalogEntry] = []
    for raw in (products.get("productEntities") or {}).values():
        entry = parse_entity(raw, urls)
        if entry is not None:
            entries.append(entry)
    return entries, total


def parse_entity(raw: dict, urls: dict[str, str]) -> CatalogEntry | None:
    pid = str(raw.get("retailerProductId") or "")
    price_block = raw.get("price") or {}
    current = (price_block.get("current") or {}).get("amount")
    if not pid or current is None or not raw.get("isInCurrentCatalog", True):
        return None
    price = Decimal(str(current))

    unit_price = None
    unit = price_block.get("unit") or {}
    unit_amount = (unit.get("current") or {}).get("amount")
    if unit_amount is not None and unit.get("label") in _UNIT_LABEL:
        unit_price = Decimal(str(unit_amount)) / _UNIT_LABEL[unit["label"]]

    promo = None
    was = (price_block.get("was") or {}).get("amount") if price_block.get("was") else None
    if was is not None and Decimal(str(was)) > price:
        promo = {"type": "price_drop", "previous_price": str(was)}
    promotions = raw.get("promotions") or []
    if promotions:
        texts = [p.get("description") for p in promotions if p.get("description")]
        if texts:
            promo = {
                **(promo or {}),
                "type": promo["type"] if promo else "text",
                "text": "; ".join(texts),
            }

    name = raw.get("name", "")
    size = (raw.get("size") or {}).get("value")
    fmt = parse_format_checked(name, price, unit_price) or parse_format(size)
    product = ChainProduct(
        external_id=pid,
        name=name.rstrip("."),
        brand=raw.get("brand") or None,
        quantity=fmt.quantity if fmt else None,
        unit=fmt.unit if fmt else None,
        units_per_pack=fmt.units_per_pack if fmt else 1,
        category_ref=" > ".join(raw.get("categoryPath") or []) or None,
        url=urls.get(pid, f"{BASE}/products/{pid}"),
    )
    record = PriceRecord(
        external_id=pid, price=price, unit_price=unit_price, promo=promo, source="alcampo_web"
    )
    return CatalogEntry(product=product, price=record)
