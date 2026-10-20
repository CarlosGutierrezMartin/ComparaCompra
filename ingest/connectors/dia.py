"""Conector de Dia: páginas de categoría de www.dia.es (HTML con schema.org ItemList).

robots.txt de dia.es permite las páginas de categoría y la paginación hasta pag-5;
por eso se leen como mucho 5 páginas por subcategoría y se anota si quedan productos.
Sin código postal, dia.es muestra su precio online general: es la zona "web".
"""

from __future__ import annotations

import json
import math
import re
from decimal import Decimal

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from matching.formats import parse_format

from .base import Connector
from .models import CatalogEntry, ChainProduct, PriceRecord, Zone

BASE = "https://www.dia.es"
# Página de categoría cualquiera: todas llevan el árbol de categorías embebido.
ENTRY_PAGE = f"{BASE}/agua-y-refrescos/c/L117"
PAGE_SIZE = 20
SKIP_SECTIONS = ("navidad", "novedades-y-recomendados")
MAX_PAGES = 5  # robots.txt: Allow */pag-1/* ... */pag-5/*

_TREE_ITEM = re.compile(r'\{"id":"(L\d+)","link":"((?:\\/|/)[^"]+)","name":"([^"]+)"\}')
_PRODUCT_ID = re.compile(r"/p/(\d+)")
_UNIT_PRICE = re.compile(r"([\d.]+,\d+)\s*€\s*/\s*([A-ZÁÉÍÓÚa-z]+)")
_UNIT_LABELS = {"KILO": Decimal(1), "KG": Decimal(1), "LITRO": Decimal(1), "L": Decimal(1)}
_UNIT_LABELS |= {"UNIDAD": Decimal(1), "UD": Decimal(1), "DOCENA": Decimal(12)}


class DiaConnector(Connector):
    slug = "dia"
    name = "Dia"
    website_url = BASE

    def resolve_zone(self, postal_code: str) -> Zone:
        return Zone(external_ref="web", name="Web (precio online sin código postal)")

    def subcategories(self) -> list[tuple[str, str, str]]:
        """(código, ruta, nombre) de cada subcategoría, leídos del árbol embebido."""
        html = self.client.get(ENTRY_PAGE).text
        self.stats.pages += 1
        return parse_category_tree(html)

    def _fetch_listing(self, zone: Zone) -> list[CatalogEntry]:
        entries: list[CatalogEntry] = []
        for code, link, name in self.subcategories():
            top = link.strip("/").split("/")[0].replace("-", " ").capitalize()
            path = f"{top} > {name}"
            first = self.client.get(f"{BASE}{link}").text
            self.stats.pages += 1
            page_entries, total = parse_listing_page(first, path)
            entries.extend(page_entries)
            pages = math.ceil(total / PAGE_SIZE) if total else 1
            if pages > MAX_PAGES:
                self.stats.truncated_categories.append(f"{code} {name} ({total} productos)")
            prefix, _, suffix = link.rpartition("/c/")
            for n in range(2, min(pages, MAX_PAGES) + 1):
                html = self.client.get(f"{BASE}{prefix}/pag-{n}/c/{suffix}").text
                self.stats.pages += 1
                entries.extend(parse_listing_page(html, path)[0])
        return entries


def parse_category_tree(html: str) -> list[tuple[str, str, str]]:
    seen: dict[str, tuple[str, str, str]] = {}
    for code, link, name in _TREE_ITEM.findall(html):
        link = link.replace("\\/", "/")
        # Las de primer nivel ("Todo agua y refrescos") duplican a sus hijas, y las
        # secciones de temporada o novedades repiten productos de otras categorías.
        if link.count("/") < 4 or link.split("/")[1] in SKIP_SECTIONS:
            continue
        seen.setdefault(code, (code, link, json.loads(f'"{name}"')))
    return list(seen.values())


def _money(text: str) -> Decimal | None:
    m = re.search(r"([\d.]+,\d+)", text)
    if not m:
        return None
    return Decimal(m.group(1).replace(".", "").replace(",", "."))


def parse_listing_page(html: str, category_path: str) -> tuple[list[CatalogEntry], int]:
    """Productos de una página de categoría y número total que anuncia la categoría."""
    tree = HTMLParser(html)
    total = 0
    items: dict[str, dict] = {}
    for node in tree.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.text())
        except json.JSONDecodeError:
            continue
        if data.get("@type") != "ItemList":
            continue
        total = int(data.get("numberOfItems") or 0)
        for el in data.get("itemListElement", []):
            m = _PRODUCT_ID.search(el.get("url", ""))
            item = el.get("item") or {}
            offers = item.get("offers") or {}
            if not m or offers.get("price") is None:
                continue
            items[m.group(1)] = {
                "name": item.get("name", ""),
                "price": Decimal(str(offers["price"])),
                "url": el["url"],
            }

    # Las tarjetas añaden marca, precio por unidad y promoción a parte de los productos.
    cards: dict[str, dict] = {}
    for card in tree.css('[data-test-id="product-card"]'):
        pid = card.attributes.get("object_id")
        if not pid:
            continue
        unit_node = card.css_first('[data-test-id="search-product-card-kilo-price"]')
        promo_node = card.css_first('[data-test-id="product-special-offer-promotion-title"]')
        name_node = card.css_first(".search-product-card__product-name")
        price_node = card.css_first('[data-test-id="search-product-card-unit-price"]')
        link_node = card.css_first('a[data-test-id="search-product-card-name"]')
        cards[pid] = {
            "brand": card.attributes.get("brand") or None,
            "unit_text": unit_node.text(strip=True) if unit_node else None,
            "promo": promo_node.text(strip=True) if promo_node else None,
            "name": name_node.text(strip=True) if name_node else None,
            "price": _money(price_node.text()) if price_node else None,
            "url": f"{BASE}{link_node.attributes.get('href')}" if link_node else None,
        }
        if pid not in items and cards[pid]["price"] is not None and cards[pid]["url"]:
            items[pid] = {
                "name": cards[pid]["name"] or "",
                "price": cards[pid]["price"],
                "url": cards[pid]["url"],
            }

    entries: list[CatalogEntry] = []
    for pid, item in items.items():
        card = cards.get(pid, {})
        fmt = parse_format(item["name"])
        unit_price = None
        if card.get("unit_text"):
            m = _UNIT_PRICE.search(card["unit_text"])
            if m and m.group(2).upper() in _UNIT_LABELS:
                value = Decimal(m.group(1).replace(".", "").replace(",", "."))
                unit_price = value / _UNIT_LABELS[m.group(2).upper()]
        promo = {"type": "text", "text": card["promo"]} if card.get("promo") else None
        product = ChainProduct(
            external_id=pid,
            name=item["name"],
            brand=card.get("brand"),
            quantity=fmt.quantity if fmt else None,
            unit=fmt.unit if fmt else None,
            units_per_pack=fmt.units_per_pack if fmt else 1,
            category_ref=category_path,
            url=item["url"],
        )
        record = PriceRecord(
            external_id=pid,
            price=item["price"],
            unit_price=unit_price,
            promo=promo,
            source="dia_web",
        )
        entries.append(CatalogEntry(product=product, price=record))
    return entries, total
