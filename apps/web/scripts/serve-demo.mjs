// Sirve out/ bajo /ComparaCompra/ como GitHub Pages (carpetas con index.html, 404.html).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.argv[2] ?? 4100);
const prefix = "/ComparaCompra";
const root = path.resolve("out");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(`${prefix}/`)) {
    res.writeHead(404).end();
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname.slice(prefix.length)));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
      return;
    }
    file = path.join(file, "index.html");
  }
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": types[".html"] });
    createReadStream(path.join(root, "404.html")).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Demo en http://localhost:${port}${prefix}/`));
