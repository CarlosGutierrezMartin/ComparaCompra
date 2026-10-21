// Prepara la demo estática: HiGHS como fichero estático y comprobación del catálogo.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const highsDir = path.dirname(require.resolve("highs/runtime"));
mkdirSync("public/highs", { recursive: true });
for (const f of ["highs.mjs", "highs.wasm"])
  copyFileSync(path.join(highsDir, f), path.join("public/highs", f));
if (!existsSync("public/demo/catalogo.json")) {
  console.error(
    "Falta public/demo/catalogo.json: genéralo con `uv run python cli.py export-demo --out ../apps/web/public/demo/catalogo.json` (carpeta ingest).",
  );
  process.exit(1);
}
