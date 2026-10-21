// GitHub Pages no envía Service-Worker-Allowed: el service worker va a la raíz de la web.
import { copyFileSync } from "node:fs";

for (const f of ["sw.js", "sw.js.map"]) copyFileSync(`out/serwist/${f}`, `out/${f}`);
