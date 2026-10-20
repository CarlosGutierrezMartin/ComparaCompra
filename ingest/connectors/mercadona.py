"""Conector de Mercadona: API interna de tienda.mercadona.es, por almacén.

Aviso: el robots.txt de tienda.mercadona.es excluye /api. El propietario del proyecto
decidió usarla igualmente con el mínimo de peticiones (docs/DECISIONS.md, H1).
Mercadona fija el precio por almacén; el almacén se obtiene del código postal.
"""

from __future__ import annotations

from decimal import Decimal

from matching.formats import plain

from .base import Connector
from .models import BaseUnit, CatalogEntry, ChainProduct, PriceRecord, Zone

API = "https://tienda.mercadona.es/api"

# Marcas propias de Mercadona: el listado no trae la marca, solo el nombre comercial.
OWN_BRANDS = ("Hacendado", "Deliplus", "Bosque Verde", "Compy", "Solcare", "Casa Juncal")

_SIZE_FORMATS: dict[str, tuple[BaseUnit, Decimal]] = {
    "kg": ("g", Decimal(1000)),
    "g": ("g", Decimal(1)),
    "l": ("ml", Decimal(1000)),
    "ml": ("ml", Decimal(1)),
    "ud": ("unit", Decimal(1)),
}
# Formato del precio de referencia -> unidades base que cubre.
_REFERENCE_FORMATS: dict[str, Decimal] = {
    "kg": Decimal(1),
    "l": Decimal(1),
    "ud": Decimal(1),
    "dz": Decimal(12),
}


class MercadonaConnector(Connector):
    slug = "mercadona"
    name = "Mercadona"
    website_url = "https://tienda.mercadona.es"

    def resolve_zone(self, postal_code: str) -> Zone:
        resp = self.client.request(
            "PUT",
            f"{API}/postal-codes/actions/change-pc/",
            json_body={"new_postal_code": postal_code},
        )
        warehouse = resp.headers.get("x-customer-wh")
        if not warehouse:
            raise ValueError(f"Mercadona no devolvió almacén para {postal_code}")
        return Zone(external_ref=warehouse, name=f"Almacén {warehouse}")

    def _fetch_listing(self, zone: Zone) -> list[CatalogEntry]:
        params = {"lang": "es", "wh": zone.external_ref}
        tree = self.client.get(f"{API}/categories/", params=params).json()
        self.stats.pages += 1
        entries: list[CatalogEntry] = []
        for top in tree["results"]:
            for sub in top["categories"]:
                data = self.client.get(f"{API}/categories/{sub['id']}/", params=params).json()
                self.stats.pages += 1
                for leaf in data.get("categories", []):
                    path = f"{top['name']} > {sub['name']} > {leaf['name']}"
                    for raw in leaf.get("products", []):
                        entry = parse_product(raw, path)
                        if entry is not None:
                            entries.append(entry)
        return entries


def _dec(value: object) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip()
    return Decimal(text) if text else None


def parse_product(raw: dict, category_path: str) -> CatalogEntry | None:
    pi = raw.get("price_instructions") or {}
    price = _dec(pi.get("unit_price"))
    if price is None or not raw.get("published", True):
        return None

    quantity: Decimal | None = None
    unit: BaseUnit | None = None
    units_per_pack = 1
    size_format = (pi.get("size_format") or "").lower()
    unit_size = _dec(pi.get("unit_size"))
    if size_format in _SIZE_FORMATS and unit_size:
        unit, factor = _SIZE_FORMATS[size_format]
        total = unit_size * factor
        total_units = pi.get("total_units")
        pack_size = _dec(pi.get("pack_size"))
        if pi.get("is_pack") and total_units and pack_size:
            # Pack de N unidades de pack_size: unit_size es el total.
            units_per_pack = int(total_units)
            quantity = plain(pack_size * factor)
        elif unit == "unit" and total_units and Decimal(total_units) > unit_size:
            # "Cebollas tiernas, manojo de 3": unit_size=1 ud, total_units=3.
            quantity = Decimal(total_units)
        else:
            quantity = plain(total)

    ref_price = _dec(pi.get("reference_price"))
    ref_format = (pi.get("reference_format") or "").lower()
    unit_price = None
    if ref_price is not None and ref_format in _REFERENCE_FORMATS:
        unit_price = ref_price / _REFERENCE_FORMATS[ref_format]

    promo = None
    previous = _dec(pi.get("previous_unit_price"))
    if previous is not None and previous > price:
        promo = {"type": "price_drop", "previous_price": str(previous)}

    name = raw["display_name"]
    brand = next((b for b in OWN_BRANDS if b.lower() in name.lower()), None)
    product = ChainProduct(
        external_id=str(raw["id"]),
        name=name,
        brand=brand,
        quantity=quantity,
        unit=unit,
        units_per_pack=units_per_pack,
        category_ref=category_path,
        url=raw.get("share_url") or f"https://tienda.mercadona.es/product/{raw['id']}",
    )
    record = PriceRecord(
        external_id=product.external_id,
        price=price,
        unit_price=unit_price,
        promo=promo,
        source="mercadona_api",
    )
    return CatalogEntry(product=product, price=record)
