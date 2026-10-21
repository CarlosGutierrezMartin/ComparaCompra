# ComparaCompra

Tu lista de la compra, lo más barata posible.

PWA que, a partir del código postal, dice dónde sale más barata la compra y ayuda a decidir qué cocinar con lo que está barato esa semana. Especificación: [`docs/SPEC.md`](docs/SPEC.md). Decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md). Guía de desarrollo: [`CLAUDE.md`](CLAUDE.md).

## Puesta en marcha

```bash
cp .env.example .env              # y apps/web/.env.local
pnpm install
pnpm exec supabase start          # Supabase local (Docker)
pnpm dev
```

Sin Docker, con un Postgres 16 local con pgvector:

```bash
./scripts/dev-db.sh               # migraciones, seeds, muestra real de precios y emparejamiento
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/comparacompra_dev pnpm dev
```

## Qué hace (MVP)

- **Lista y comparador (F1):** lista escrita o dictada, total por cadena, mejor tienda y mejor pareja, con fecha y fuente de cada precio.
- **Platos (F2):** a mano, pegando texto, con un enlace (schema.org primero), con una foto o propuestos por IA; coste por ración y de compra por cadena.
- **Menú semanal (F3 y F4):** presupuesto, modos ahorro, variedad y aprovechamiento, despensa, bloquear, cambiar y regenerar, y paso a la lista agrupada por sección.
- **Modo tienda (F5):** la lista de la tienda elegida, por secciones, sin conexión, con precio real anotado.
- **Páginas legales** (`/legal/…`) y **metodología de precios** (`/metodologia`). Los datos del titular están marcados como pendientes.

Las funciones con IA (interpretación con IA, fotos, generación de platos) necesitan `ANTHROPIC_API_KEY`; sin ella, la app usa los intérpretes por reglas.

## Demo en GitHub Pages

Versión estática para probar la PWA sin servidor, en `https://<usuario>.github.io/<repositorio>/`: precios de la muestra real, comparación, platos, menú y modo tienda calculados en el móvil, también sin conexión. Sin IA ni cuenta. Se publica sola al cambiar `main` (`.github/workflows/pages.yml`) una vez activado Pages con origen «GitHub Actions». En local:

```bash
(cd ingest && SUPABASE_DB_URL=... uv run python cli.py export-demo --out ../apps/web/public/demo/catalogo.json)
NEXT_PUBLIC_BASE_PATH=/ComparaCompra pnpm --filter web build:demo
pnpm --filter web exec playwright test -c playwright.demo.config.ts   # la sirve en http://localhost:4100/ComparaCompra/
```
