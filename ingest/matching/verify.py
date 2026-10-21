"""Verificación con IA de pares candidatos a "idéntico" que las reglas no deciden."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .llm import StructuredLLM

SYSTEM = """Comparas dos productos de supermercados españoles y decides su relación:
- identico: el mismo producto de la misma marca, misma variedad y mismo formato.
- equivalente: mismo tipo de producto y variedad (p. ej. leche semidesnatada de otra marca o
  de otro tamaño), intercambiable para la compra.
- distinto: no son intercambiables (otra variedad, sabor, tipo o uso).
Fíjate en marca, variedad, sabor, formato y marcas como "sin lactosa" o "ecológico".
Devuelve también tu confianza de 0 a 1."""


class Verdict(BaseModel):
    nivel: Literal["identico", "equivalente", "distinto"]
    confianza: float = Field(description="entre 0 y 1")


def verify_pair(llm: StructuredLLM, a: str, b: str) -> Verdict | None:
    user = f"Producto A: {a}\nProducto B: {b}"
    return llm.parse(system=SYSTEM, user=user, output=Verdict, max_tokens=2000)
