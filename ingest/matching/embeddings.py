"""Embeddings léxicos para buscar candidatos a emparejamiento.

Para nombres de producto lo que importa es el parecido de palabras ("Leche entera
Hacendado" frente a "Leche entera Dia"), así que se usa un embedding por hashing de
palabras y trigramas de caracteres: determinista, sin descargar modelos ni pagar una
API, y guardable en pgvector. La interfaz Embedder permite cambiarlo por un modelo
semántico más adelante sin tocar el resto (docs/DECISIONS.md, H2).
"""

from __future__ import annotations

import hashlib
import itertools
import math
from collections.abc import Sequence
from typing import Protocol

from .normalize import canonical_text

DIM = 256


class Embedder(Protocol):
    dim: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def _bucket(feature: str, dim: int) -> tuple[int, float]:
    h = hashlib.blake2b(feature.encode(), digest_size=8).digest()
    value = int.from_bytes(h, "little")
    return value % dim, 1.0 if (value >> 63) & 1 else -1.0


class HashingEmbedder:
    def __init__(self, dim: int = DIM) -> None:
        self.dim = dim

    def _features(self, text: str) -> list[tuple[str, float]]:
        words = text.split()
        feats = [(f"w:{w}", 2.0) for w in words]
        feats += [(f"b:{a}_{b}", 1.5) for a, b in itertools.pairwise(words)]
        for w in words:
            padded = f"#{w}#"
            feats += [(f"c:{padded[i : i + 3]}", 0.5) for i in range(len(padded) - 2)]
        return feats

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        out = []
        for text in texts:
            vec = [0.0] * self.dim
            for feat, weight in self._features(text):
                idx, sign = _bucket(feat, self.dim)
                vec[idx] += sign * weight
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


def product_text(name: str, brand: str | None) -> str:
    """Texto que se compara: el nombre sin marca, formato ni palabras vacías."""
    return canonical_text(name, brand)


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))
