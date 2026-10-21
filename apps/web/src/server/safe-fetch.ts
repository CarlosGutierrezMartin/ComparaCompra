import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Descarga una página de receta con límites: solo http(s), sin direcciones privadas
 * (evita que el servidor sirva de puente a la red interna), 8 s y 3 MB como máximo.
 */

const MAX_BYTES = 3_000_000;

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    return (
      v6 === "::1" ||
      v6.startsWith("fc") ||
      v6.startsWith("fd") ||
      v6.startsWith("fe80") ||
      v6.startsWith("::ffff:127.")
    );
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export class FetchError extends Error {}

export async function fetchPage(rawUrl: string): Promise<{ html: string; url: string }> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new FetchError("Solo se admiten enlaces http o https");
    const host = url.hostname;
    const addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true })).map((a) => a.address);
    if (!addresses.length || addresses.some(isPrivate))
      throw new FetchError("Dirección no permitida");
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent":
          "ComparaCompraBot/0.1 (+https://github.com/carlosgutierrezmartin/comparacompra)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location") ?? "", url);
      continue;
    }
    if (!res.ok || !res.body) throw new FetchError(`La página respondió ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new FetchError("La página es demasiado grande");
      }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString("utf-8"), url: url.toString() };
  }
  throw new FetchError("Demasiadas redirecciones");
}
