import httpx
import pytest

from connectors.http import BlockedError, PoliteClient
from tests.conftest import FakeClock, fixture_response


def _client(router, rpm=30, cache_dir=None):
    clock = FakeClock()
    client = PoliteClient(
        chain="test",
        user_agent="ComparaCompraBot/test",
        requests_per_minute=rpm,
        transport=httpx.MockTransport(router),
        clock=clock,
        sleep=clock.sleep,
        cache_dir=cache_dir,
    )
    return client, clock


def test_envia_user_agent_identificado():
    seen = {}

    def router(request):
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, text="ok")

    client, _ = _client(router)
    client.get("https://example.com/a")
    assert seen["ua"] == "ComparaCompraBot/test"


def test_respeta_el_limite_de_peticiones_por_minuto():
    client, clock = _client(lambda r: httpx.Response(200, text="ok"), rpm=30)
    for i in range(3):
        client.get(f"https://example.com/{i}")
    # 30 por minuto = una cada 2 s: la segunda y la tercera esperan.
    assert clock.sleeps == [2.0, 2.0]
    assert client.requests_made == 3


def test_detecta_el_bloqueo_de_cloudflare_y_no_reintenta():
    calls = []

    def router(request):
        calls.append(request.url)
        return fixture_response("carrefour", "blocked.html")

    client, _ = _client(router)
    with pytest.raises(BlockedError):
        client.get("https://www.carrefour.es/supermercado/la-despensa/cat20001/c")
    assert len(calls) == 1


def test_reintenta_tras_429_respetando_retry_after():
    responses = [httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, text="ok")]
    client, clock = _client(lambda r: responses.pop(0))
    assert client.get("https://example.com/x").text == "ok"
    assert 7.0 in clock.sleeps


def test_tras_varios_5xx_falla():
    client, _ = _client(lambda r: httpx.Response(503))
    with pytest.raises(httpx.HTTPStatusError):
        client.get("https://example.com/x")
    assert client.requests_made == 3


def test_cache_en_disco_evita_repetir_peticiones(tmp_path):
    client, _ = _client(lambda r: httpx.Response(200, text="hola"), cache_dir=tmp_path)
    assert client.get("https://example.com/x").text == "hola"
    again = client.get("https://example.com/x")
    assert again.from_cache and client.requests_made == 1
