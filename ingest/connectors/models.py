"""Modelos comunes a todos los conectores (validados con pydantic)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

BaseUnit = Literal["g", "ml", "unit"]


class Zone(BaseModel):
    """Zona de precios de una cadena (almacén en Mercadona, web nacional en otras)."""

    external_ref: str
    name: str | None = None


class ChainProduct(BaseModel):
    """Datos factuales de un producto. No se guardan descripciones ni fotos de la cadena."""

    external_id: str
    name: str
    brand: str | None = None
    quantity: Decimal | None = Field(default=None, description="Contenido de una unidad")
    unit: BaseUnit | None = None
    units_per_pack: int = 1
    ean: str | None = None
    category_ref: str | None = None
    url: str

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return " ".join(v.split())


class PriceRecord(BaseModel):
    external_id: str
    price: Decimal = Field(ge=0)
    # Precio por kg, litro o unidad tal como lo publica la cadena (o calculado si no lo publica).
    unit_price: Decimal | None = None
    promo: dict[str, Any] | None = None
    source: str


class CatalogEntry(BaseModel):
    product: ChainProduct
    price: PriceRecord
