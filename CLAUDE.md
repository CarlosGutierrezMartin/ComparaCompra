# CLAUDE.md

Guía para Claude Code en este repositorio. La especificación de producto es `docs/SPEC.md`; ante cualquier duda de producto, manda lo que dice allí. Las decisiones tomadas por hito están en `docs/DECISIONS.md`.

## Comandos

```bash
pnpm install                     # dependencias TypeScript (monorepo pnpm)
pnpm dev                         # web en http://localhost:3000
pnpm lint && pnpm typecheck      # calidad TypeScript
pnpm test                        # Vitest en todos los paquetes
pnpm --filter web test:e2e       # Playwright (móvil emulado)
pnpm format                      # Prettier
cd ingest && uv sync && uv run pytest -q && uv run ruff check .   # ingesta Python
./scripts/db-test-local.sh       # migraciones + tests pgTAP sin Docker (Postgres local)
pnpm exec supabase db start && pnpm exec supabase test db        # lo mismo con Supabase (Docker)
```

## Estructura

- `apps/web`: Next.js (App Router), PWA, rutas `/api`. Next 16 trae cambios: leer `apps/web/node_modules/next/dist/docs/` antes de usar APIs nuevas.
- `packages/core`: tipos, unidades, motor de cesta. Funciones puras, sin red.
- `packages/menu`: optimizador del menú (F3, F4). Funciones puras, sin red.
- `ingest`: conectores por cadena, normalización y emparejamiento (Python 3.12, uv).
- `supabase/migrations`: SQL versionado; `supabase/tests/database`: tests pgTAP de RLS.

## Reglas de trabajo (copiadas de docs/SPEC.md)

Estas reglas se copian en `CLAUDE.md`; tienen prioridad sobre cualquier decisión de estilo y se resumen en tres ideas: trabajar por hitos, no inventar datos y respetar a las cadenas.

**Forma de trabajar**

- Leer `docs/SPEC.md` antes de cada hito; si algo es ambiguo, proponer una opción, explicarla en una línea y seguir, salvo que afecte al modelo de datos o a la parte legal: ahí se pregunta.
- Commits pequeños con mensaje en español que digan qué cambia y por qué; una rama por hito.
- Tests antes de dar un hito por cerrado; ningún test desactivado sin explicarlo.
- Al terminar cada hito, actualizar `docs/DECISIONS.md` con las decisiones tomadas.

**Datos y precios**

- Nunca inventar precios, productos ni equivalencias para rellenar huecos; si falta un dato, se marca como no disponible.
- Todo precio guarda fuente y fecha; la interfaz siempre las muestra.
- Las salidas de la IA se validan con esquemas (Zod en TypeScript, pydantic en Python); si no validan, se reintenta una vez y después se marca para revisión.

**Respeto a las cadenas y legalidad**

- Solo datos factuales: nombre, formato, precio, precio por unidad, categoría y EAN. No copiar descripciones ni fotos de las cadenas; las imágenes salen de Open Food Facts con su atribución.
- Sin sesión iniciada en las tiendas, sin saltarse captchas ni bloqueos, con caché y un máximo de peticiones por minuto configurable por cadena.
- Enlace a la ficha original en cada producto.
- En recetas importadas desde una URL: guardar ingredientes, cantidades y el enlace; no copiar el texto de los pasos ni las fotos del autor salvo que sean del propio usuario.

**Seguridad y privacidad**

- Row Level Security en todas las tablas de usuario; claves de servicio solo en el servidor.
- Las fotos de tickets se procesan y se borran tras extraer las líneas; nunca se guardan números de tarjeta ni de fidelización.
- Datos mínimos: correo y código postal; sin geolocalización precisa salvo que el usuario la active.

**Estilo de la interfaz y del código**

- Español claro y directo en la interfaz; cifras con formato español (1.234,56 €).
- TypeScript estricto sin `any`; funciones puras en `packages/core` y `packages/menu`, sin acceso a red.
