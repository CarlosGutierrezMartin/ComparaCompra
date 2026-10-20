from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import httpx
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
