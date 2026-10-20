"""Clasificación por lotes con IA de los productos que las reglas no resuelven."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, Field

from .classify_rules import Classification
from .llm import StructuredLLM
from .taxonomy import BY_SLUG, FLAGS, LEAVES

BATCH_SIZE = 40

Flag = Literal["sin_lactosa", "sin_gluten", "ecologico", "congelado", "sin_azucar", "integral"]
# Enum con los slugs reales: la salida estructurada no puede devolver una hoja inventada.
LeafSlug = Literal[tuple(leaf.slug for leaf in LEAVES)]  # type: ignore[valid-type]


class ProductIn(BaseModel):
    id: str
    nombre: str
    marca: str | None = None
    categoria_cadena: str | None = None


class ProductClass(BaseModel):
    id: str
    hoja: LeafSlug | None = Field(
        description="slug de la hoja de la taxonomía, o null si ninguna encaja"
    )  # type: ignore[valid-type]
    variante: str | None = Field(description="una de las variantes de la hoja, o null")
    marcas: list[Flag] = Field(default_factory=list)
    confianza: float = Field(description="entre 0 y 1")


class BatchOut(BaseModel):
    productos: list[ProductClass]


def _taxonomy_text() -> str:
    lines = []
    for leaf in LEAVES:
        variants = f" [variantes: {', '.join(leaf.variants)}]" if leaf.variants else ""
        lines.append(f"{leaf.slug}: {leaf.section} > {leaf.name}{variants}")
    return "\n".join(lines)


SYSTEM = f"""Clasificas productos de supermercados españoles en una taxonomía canónica.

Para cada producto devuelve:
- hoja: el slug exacto de la hoja que mejor describe QUÉ ES el producto (no sus ingredientes
  secundarios: "Atún en aceite de oliva" es atun-en-conserva). Si ninguna hoja encaja, null.
- variante: solo si la hoja tiene variantes y el nombre la indica; si no, null.
- marcas: las que el nombre afirma ({", ".join(FLAGS)}); nunca las supongas.
- confianza: tu seguridad de 0 a 1. Usa menos de 0,7 si dudas entre dos hojas.

No inventes hojas ni variantes. Taxonomía (slug: sección > nombre):
{_taxonomy_text()}"""


def classify_batch(llm: StructuredLLM, products: Sequence[ProductIn]) -> dict[str, Classification]:
    """Clasifica un lote. Los productos sin respuesta válida no aparecen en el resultado."""
    out: dict[str, Classification] = {}
    for start in range(0, len(products), BATCH_SIZE):
        chunk = list(products[start : start + BATCH_SIZE])
        user = "Clasifica estos productos:\n" + json.dumps(
            [p.model_dump(exclude_none=True) for p in chunk], ensure_ascii=False
        )
        result = llm.parse(system=SYSTEM, user=user, output=BatchOut, max_tokens=8000)
        if result is None:
            continue
        wanted = {p.id for p in chunk}
        for item in result.productos:
            if item.id not in wanted:
                continue
            out[item.id] = _validated(item)
    return out


def _validated(item: ProductClass) -> Classification:
    """Descarta hojas o variantes que no existen en la taxonomía (no se aceptan inventos)."""
    leaf = BY_SLUG.get(item.hoja or "")
    if leaf is None:
        return Classification(leaf=None, confidence=0.0, source="model")
    variant = item.variante if item.variante in leaf.variants else None
    confidence = max(0.0, min(1.0, item.confianza))
    return Classification(
        leaf=leaf.slug,
        variant=variant,
        flags=sorted(set(item.marcas)),
        confidence=confidence,
        source="model",
    )
