"""Interfaz común de los conectores por cadena (docs/SPEC.md, H1)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal

from matching.formats import ParsedFormat, unit_price_per_reference

from .http import PoliteClient
from .models import CatalogEntry, ChainProduct, PriceRecord, Zone


@dataclass
class ListingStats:
    """Lo que el conector sabe de la completitud de su captura."""

    pages: int = 0
    # Categorías donde la web anuncia más productos de los que se pudieron leer.
    truncated_categories: list[str] = field(default_factory=list)


class Connector(ABC):
    """Un conector por cadena. Cada uno lee una sola fuente y no conoce a los demás."""

    slug: str
    name: str
    website_url: str

    def __init__(self, client: PoliteClient) -> None:
        self.client = client
        self.stats = ListingStats()
        self._listing_cache: dict[str, list[CatalogEntry]] = {}

    @abstractmethod
    def resolve_zone(self, postal_code: str) -> Zone:
        """Zona de precios que la cadena asigna a un código postal."""

    @abstractmethod
    def _fetch_listing(self, zone: Zone) -> list[CatalogEntry]:
        """Lee el catálogo con precios de una zona. Lo implementa cada cadena."""

    def listing(self, zone: Zone) -> list[CatalogEntry]:
        if zone.external_ref not in self._listing_cache:
            entries = self._fetch_listing(zone)
            # Sin duplicados: un producto puede aparecer en varias categorías.
            unique: dict[str, CatalogEntry] = {}
            for e in entries:
                unique.setdefault(e.product.external_id, _with_unit_price(e))
            self._listing_cache[zone.external_ref] = list(unique.values())
        return self._listing_cache[zone.external_ref]

    def fetch_catalog(self, zone: Zone) -> list[ChainProduct]:
        return [e.product for e in self.listing(zone)]

    def fetch_prices(self, zone: Zone) -> list[PriceRecord]:
        return [e.price for e in self.listing(zone)]


def _with_unit_price(entry: CatalogEntry) -> CatalogEntry:
    """Si la cadena no publica el precio por kg, litro o unidad, se calcula del formato."""
    p = entry.product
    if entry.price.unit_price is not None or p.quantity is None or p.unit is None:
        return entry
    fmt = ParsedFormat(p.quantity, p.unit, p.units_per_pack)
    unit_price = unit_price_per_reference(entry.price.price, fmt)
    if unit_price is None:
        return entry
    price = entry.price.model_copy(update={"unit_price": unit_price.quantize(Decimal("0.0001"))})
    return entry.model_copy(update={"price": price})
