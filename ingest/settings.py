"""Configuración común de la ingesta, leída del entorno."""

from __future__ import annotations

import os
from dataclasses import dataclass

USER_AGENT_DEFAULT = (
    "ComparaCompraBot/0.1 (+https://github.com/carlosgutierrezmartin/comparacompra)"
)


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    user_agent: str
    # Peticiones por minuto, por cadena. Configurable con INGEST_RPM_<CADENA>.
    requests_per_minute: dict[str, int]
    cache_dir: str


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ) if env is None else env
    chains = ("mercadona", "carrefour", "dia", "alcampo")
    default_rpm = int(env.get("INGEST_RPM_DEFAULT", "20"))
    rpm = {c: int(env.get(f"INGEST_RPM_{c.upper()}", default_rpm)) for c in chains}
    return Settings(
        database_url=env.get("SUPABASE_DB_URL"),
        user_agent=env.get("INGEST_USER_AGENT", USER_AGENT_DEFAULT),
        requests_per_minute=rpm,
        cache_dir=env.get("INGEST_CACHE_DIR", ".cache/http"),
    )
