"""Conector de Carrefour.

A fecha de 20/10/2026, www.carrefour.es responde con un desafío de Cloudflare
("Attention Required") a las peticiones del entorno de captura. Las reglas del proyecto
prohíben saltarse bloqueos, así que el conector solo comprueba si la web responde: si
hay bloqueo lanza BlockedError y Carrefour queda como "no disponible" (docs/DECISIONS.md).
Si el bloqueo desaparece, hay que implementar aquí la lectura de categorías.
"""

from __future__ import annotations

from .base import Connector
from .models import CatalogEntry, Zone

BASE = "https://www.carrefour.es"
PROBE_PAGE = f"{BASE}/supermercado/la-despensa/cat20001/c"


class CarrefourConnector(Connector):
    slug = "carrefour"
    name = "Carrefour"
    website_url = BASE

    def resolve_zone(self, postal_code: str) -> Zone:
        return Zone(external_ref="web", name="Web (precio online sin código postal)")

    def _fetch_listing(self, zone: Zone) -> list[CatalogEntry]:
        # Lanza BlockedError si Cloudflare bloquea, que es lo esperado hoy.
        self.client.get(PROBE_PAGE)
        self.stats.pages += 1
        raise NotImplementedError(
            "Carrefour respondió sin bloqueo: falta implementar la lectura del catálogo"
        )
