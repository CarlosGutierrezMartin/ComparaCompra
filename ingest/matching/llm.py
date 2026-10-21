"""Cliente de la API de Claude con salidas estructuradas validadas con pydantic.

Regla del proyecto: si la salida no valida, se reintenta una vez y después se marca
para revisión (el llamante recibe None). Sin ANTHROPIC_API_KEY no se llama a nada.
"""

from __future__ import annotations

import logging
import os
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-opus-5-5"


class StructuredLLM(Protocol):
    def parse(
        self, *, system: str, user: str, output: type[T], max_tokens: int = 16000
    ) -> T | None:
        """Devuelve la salida validada o None si no se pudo obtener tras un reintento."""
        ...


class ClaudeLLM:
    def __init__(self, model: str | None = None, effort: str = "low") -> None:
        import anthropic  # importación diferida: los tests no necesitan el SDK configurado

        self.client = anthropic.Anthropic()
        self.model = model or os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL
        self.effort = effort
        self._anthropic = anthropic

    def parse(
        self, *, system: str, user: str, output: type[T], max_tokens: int = 16000
    ) -> T | None:
        for attempt in (1, 2):
            try:
                resp = self.client.messages.parse(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                    output_format=output,
                    # Clasificar y extraer son tareas acotadas: esfuerzo bajo.
                    output_config={"effort": self.effort},
                    # Si los filtros de seguridad rechazan la petición, la API la repite
                    # con el modelo de respaldo que elija según el motivo.
                    extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
                    extra_body={"fallbacks": "default"},
                )
            except ValidationError as exc:
                log.warning("Salida no válida (intento %s): %s", attempt, exc)
                continue
            except self._anthropic.APIStatusError as exc:
                if exc.status_code in (400, 401, 403, 404):
                    raise
                log.warning("Error de la API (intento %s): %s", attempt, exc)
                continue
            if resp.stop_reason == "refusal" or resp.parsed_output is None:
                log.warning("Sin salida válida (intento %s): %s", attempt, resp.stop_reason)
                continue
            return resp.parsed_output
        return None


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
