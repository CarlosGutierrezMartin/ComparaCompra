# Decisiones de arquitectura

Registro de decisiones por hito. Cada entrada: qué se decidió, por qué y qué alternativa se descartó.

## Decisiones previas al desarrollo (respuestas del propietario, 20/10/2026)

- **Alcance de esta iteración:** todo el MVP (H0 a H7) seguido, una rama por hito.
- **Supabase solo en local.** No se crea ningún proyecto en la nube; el propietario lo enlazará después.
- **Ciudades:** de momento solo Madrid (la especificación habla de 5 ciudades; se amplía después).
- **Captura de precios:** conectores reales con el mínimo de peticiones necesario para grabar respuestas de test. El cron diario queda desactivado hasta que el propietario lo active (pendiente de revisión legal).

## H0. Base del proyecto

- **Monorepo con pnpm workspaces**, sin Turborepo: con tres paquetes TypeScript los scripts recursivos de pnpm bastan.
- **TypeScript 6.0**, no 7.0: `typescript-eslint` 8.72 solo admite TypeScript < 6.1.
- **ESLint 9**: `eslint-config-next` 16.4 y sus plugins están probados con la 9.
- **`cacheComponents` desactivado en Next.js 16.** `@serwist/turbopack` (service worker con Turbopack) solo funciona sin él. La app es sobre todo cliente con datos en IndexedDB, así que no se pierde nada relevante.
- **Fuente del sistema** en vez de `next/font/google`: evita una descarga en la primera carga (objetivo < 2,5 s en 4G) y no depende de la red en el build.
- **Formato de cifras propio** (`formatEuro`): `Intl.NumberFormat("es-ES")` no pone separador de miles en números de 4 cifras (1234,56 €) y la especificación pide 1.234,56 €.
- **Tests de base de datos con pgTAP.** En CI se usa `supabase db start` + `supabase test db`. En local sin Docker, `scripts/db-test-local.sh` usa un Postgres con una imitación mínima de Supabase (`supabase/tests/local/supabase_stub.sql`: roles, `auth.uid()`).
- **Añadidos al modelo de datos de la especificación** (todos necesarios para funciones del MVP, ninguno cambia lo especificado):
  - `chain.website_url`, `price_zone.name`, `category.slug` y `category.aisle` (sección para el modo tienda).
  - `product_chain.active`, `first_seen_at`, `last_seen_at` (detectar productos retirados).
  - `price.checked_at`: última captura que confirmó el precio. Es la fecha que se muestra, porque con histórico por intervalos `valid_from` puede ser antiguo aunque el precio siga vigente.
  - `household.chain_ids`: cadenas que el hogar tiene cerca (primer uso).
  - `shopping_list.chain_id` (tienda elegida para el modo tienda), `list_item.position`.
  - `ingredient.allergens` y `ingredient.not_suitable_for` para filtrar platos por alérgenos y dieta.
  - `recipe_ingredient.raw_text` (texto original, para revisar el emparejamiento), `meal_plan_slot.locked` (huecos bloqueados).
  - `price_observation.household_id` para aplicar RLS.
  - `pantry_item`, `receipt` y `price_observation` se crean ya: la despensa manual y el precio observado son del MVP.
- **RLS:** función `my_household_ids()` (security definer) para no recursar sobre `profile`. El alta del hogar es una función `create_household()` que crea hogar y perfil en una operación.
