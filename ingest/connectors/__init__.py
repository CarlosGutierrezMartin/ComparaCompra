from .alcampo import AlcampoConnector
from .base import Connector
from .carrefour import CarrefourConnector
from .dia import DiaConnector
from .mercadona import MercadonaConnector

CONNECTORS: dict[str, type[Connector]] = {
    c.slug: c for c in (MercadonaConnector, CarrefourConnector, DiaConnector, AlcampoConnector)
}

__all__ = ["CONNECTORS", "Connector"]
