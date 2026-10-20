"""Cliente HTTP común a todos los conectores.

Reglas (docs/SPEC.md, "Respeto a las cadenas"): User-Agent identificado, un máximo de
peticiones por minuto por cadena, caché en disco, sin sesión iniciada y sin intentar
saltarse bloqueos: si la cadena bloquea, se lanza BlockedError y el conector para.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

# Señales de que la respuesta es una barrera anti-bots y no contenido.
BLOCK_MARKERS = (
    "Attention Required! | Cloudflare",
    "cf-challenge",
    "cf_chl_opt",
    "challenge-platform",
    "captcha",
    "Access Denied",
    "Request unsuccessful. Incapsula",
)
STRONG_BLOCK_MARKERS = (
    "Attention Required! | Cloudflare",
    "cf_chl_opt",
    "Request unsuccessful. Incapsula",
)


class BlockedError(RuntimeError):
    """La cadena ha bloqueado la petición. No se reintenta ni se intenta esquivar."""


@dataclass
class Response:
    status: int
    text: str
    headers: dict[str, str]
    url: str
    from_cache: bool = False

    def json(self) -> Any:
        return json.loads(self.text)


@dataclass
class PoliteClient:
    chain: str
    user_agent: str
    requests_per_minute: int
    cache_dir: Path | None = None
    cache_ttl_seconds: int = 20 * 3600
    transport: httpx.BaseTransport | None = None
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], None] = time.sleep
    max_retries: int = 2
    timeout: float = 30.0
    requests_made: int = 0
    _last_request_at: float | None = field(default=None, init=False)
    _client: httpx.Client | None = field(default=None, init=False)

    @property
    def min_interval(self) -> float:
        return 60.0 / max(1, self.requests_per_minute)

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                transport=self.transport,
                timeout=self.timeout,
                follow_redirects=True,
                headers={
                    "User-Agent": self.user_agent,
                    "Accept-Language": "es-ES,es;q=0.9",
                },
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # ------------------------------------------------------------------ caché
    def _cache_path(self, method: str, url: str, body: str | None) -> Path | None:
        if self.cache_dir is None:
            return None
        key = hashlib.sha256(f"{method} {url} {body or ''}".encode()).hexdigest()
        return self.cache_dir / self.chain / f"{key}.json"

    def _read_cache(self, path: Path | None) -> Response | None:
        if path is None or not path.exists():
            return None
        data = json.loads(path.read_text())
        if time.time() - data["stored_at"] > self.cache_ttl_seconds:
            return None
        return Response(data["status"], data["text"], data["headers"], data["url"], True)

    def _write_cache(self, path: Path | None, resp: Response) -> None:
        if path is None or resp.status != 200:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "stored_at": time.time(),
            "status": resp.status,
            "text": resp.text,
            "headers": resp.headers,
            "url": resp.url,
        }
        path.write_text(json.dumps(payload))

    # -------------------------------------------------------------- peticiones
    def _wait_turn(self) -> None:
        now = self.clock()
        if self._last_request_at is not None:
            wait = self.min_interval - (now - self._last_request_at)
            if wait > 0:
                self.sleep(wait)
        self._last_request_at = self.clock()

    def request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
        use_cache: bool = True,
    ) -> Response:
        full_url = str(httpx.URL(url, params=params)) if params else url
        body = json.dumps(json_body, sort_keys=True) if json_body is not None else None
        cache_path = self._cache_path(method, full_url, body) if use_cache else None
        cached = self._read_cache(cache_path)
        if cached is not None:
            return cached

        attempt = 0
        while True:
            self._wait_turn()
            self.requests_made += 1
            raw = self._http().request(method, full_url, json=json_body)
            resp = Response(raw.status_code, raw.text, dict(raw.headers), str(raw.url))
            if is_blocked(resp):
                raise BlockedError(f"{self.chain}: bloqueo en {full_url} (HTTP {resp.status})")
            if resp.status == 429 or resp.status >= 500:
                if attempt >= self.max_retries:
                    raise httpx.HTTPStatusError(
                        f"{self.chain}: HTTP {resp.status} en {full_url}",
                        request=raw.request,
                        response=raw,
                    )
                attempt += 1
                retry_after = _retry_after_seconds(resp.headers, default=30.0 * attempt)
                self.sleep(retry_after)
                continue
            if resp.status >= 400:
                raise httpx.HTTPStatusError(
                    f"{self.chain}: HTTP {resp.status} en {full_url}",
                    request=raw.request,
                    response=raw,
                )
            self._write_cache(cache_path, resp)
            return resp

    def get(self, url: str, *, params: dict[str, str] | None = None) -> Response:
        return self.request("GET", url, params=params)


def is_blocked(resp: Response) -> bool:
    if resp.status in (401, 403):
        return True
    head = resp.text[:5000]
    if resp.status != 200:
        return any(marker in head for marker in BLOCK_MARKERS)
    # Una página 200 solo se considera bloqueo con marcas inequívocas de desafío.
    return any(marker in head for marker in STRONG_BLOCK_MARKERS)


def _retry_after_seconds(headers: dict[str, str], default: float) -> float:
    value = headers.get("retry-after") or headers.get("Retry-After")
    if value is None:
        return default
    try:
        return min(float(value), 300.0)
    except ValueError:
        return default
