from __future__ import annotations

import json
import os
from collections.abc import Callable
from pathlib import Path

import httpx
import psycopg
import pytest

from connectors.http import PoliteClient

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_text(chain: str, name: str) -> str:
    return (FIXTURES / chain / name).read_text()


def fixture_response(chain: str, name: str) -> httpx.Response:
    meta = json.loads((FIXTURES / chain / f"{name}.meta.json").read_text())
    return httpx.Response(meta["status"], text=fixture_text(chain, name), headers=meta["headers"])


Router = Callable[[httpx.Request], httpx.Response]


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def make_client() -> Callable[..., PoliteClient]:
    def _make(chain: str, router: Router, rpm: int = 60) -> PoliteClient:
        clock = FakeClock()
        return PoliteClient(
            chain=chain,
            user_agent="ComparaCompraBot/test",
            requests_per_minute=rpm,
            transport=httpx.MockTransport(router),
            clock=clock,
            sleep=clock.sleep,
        )

    return _make


ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL = os.environ.get("TEST_ADMIN_DATABASE_URL")
needs_db = pytest.mark.skipif(not ADMIN_URL, reason="sin TEST_ADMIN_DATABASE_URL")


@pytest.fixture
def conn():
    """Base de datos nueva con migraciones y seeds (necesita TEST_ADMIN_DATABASE_URL)."""
    if not ADMIN_URL:
        pytest.skip("sin TEST_ADMIN_DATABASE_URL")
    assert ADMIN_URL
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute("drop database if exists comparacompra_pytest")
        admin.execute("create database comparacompra_pytest")
    url = psycopg.conninfo.make_conninfo(ADMIN_URL, dbname="comparacompra_pytest")
    with psycopg.connect(url, autocommit=True) as c:
        c.execute((ROOT / "scripts/supabase_stub.sql").read_text())
        for f in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            c.execute(f.read_text())
        for f in sorted((ROOT / "supabase/seeds").glob("*.sql")):
            c.execute(f.read_text())
        yield c
