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
- **Tests de base de datos con pgTAP.** En CI se usa `supabase db start` + `supabase test db`. En local sin Docker, `scripts/db-test-local.sh` usa un Postgres con una imitación mínima de Supabase (`scripts/supabase_stub.sql`: roles, `auth.uid()`).
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

## H1. Ingesta de precios

Exploración inicial (20/10/2026, unas 30 peticiones en total con User-Agent identificado):

| Cadena    | Fuente usada                                                                                     | Zona de precios                                     | Estado    |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------- |
| Mercadona | API interna `tienda.mercadona.es/api` (árbol de categorías y productos por almacén)              | Almacén asignado al código postal (`x-customer-wh`) | Activa    |
| Carrefour | Ninguna: `www.carrefour.es` responde con un desafío de Cloudflare (HTTP 403)                     | —                                                   | Bloqueada |
| Dia       | Páginas de categoría de `www.dia.es` (HTML con `schema.org/ItemList` y tarjetas de producto)     | `web`: precio online sin código postal              | Activa    |
| Alcampo   | Páginas de categoría de `compraonline.alcampo.es` (estado inicial embebido) y su sitemap público | `web`: precio online sin código postal              | Activa    |

- **Mercadona y robots.txt (decisión del propietario).** El `robots.txt` de `tienda.mercadona.es` excluye `/api` y solo permite `/product` y el sitemap; las fichas de producto no llevan el precio en el HTML. El propietario decidió usar la API igualmente con el mínimo de peticiones. Es una desviación consciente de la regla de respeto a las cadenas: conviene incluirla en la revisión legal previa al lanzamiento y estar dispuestos a retirar la cadena si Mercadona lo pide.
- **Carrefour bloqueada.** El conector existe con la misma interfaz, hace una sola petición de prueba, detecta el desafío (`BlockedError`) y para. No se intenta esquivar el bloqueo. En la interfaz Carrefour aparece como "sin precios". Si el bloqueo desaparece, el conector falla con `NotImplementedError` para avisar de que hay que implementar la lectura.
- **Dia y Alcampo sin código postal.** Ambas webs muestran un precio online general sin elegir código postal; se guarda como zona `web` y todos los códigos postales de Madrid apuntan a ella. La interfaz debe decir "precio online". Pendiente comprobar si cambian precios al fijar un código postal.
- **Dia: paginación limitada a 5 páginas** porque su `robots.txt` solo permite `pag-1` a `pag-5`. Las categorías con más de 100 productos se registran en `ingest_run.truncated_categories`. Se omiten las secciones "Navidad" y "Novedades" porque repiten productos de otras categorías.
- **Alcampo: solo raíces de supermercado** (frescos, alimentación, bebidas, desayuno, lácteos, congelados, comida preparada, droguería, perfumería, bebé, mascotas). Fuera bazar, electrónica, folletos y vistas duplicadas (ecológico, veganos, sin gluten).
- **Marca en Mercadona.** El listado no trae la marca; se detectan sus marcas propias (Hacendado, Deliplus, Bosque Verde, Compy…) en el nombre. El resto queda sin marca hasta el emparejamiento (H2).
- **EAN.** Ninguno de los listados lo trae y pedir la ficha de cada producto multiplicaría las peticiones; se deja vacío y el emparejamiento por idénticos usa marca y formato normalizados.
- **Precio por unidad de medida.** Se guarda el que publica la cadena (RD 3423/2000) pasado a €/kg, €/l o €/unidad (los precios por docena se dividen entre 12). Si no lo publica, se calcula del formato.
- **Promociones.** Mercadona: bajada de precio (`previous_unit_price`). Dia: texto de la oferta ("3X2 …"). Alcampo: precio anterior (`was`) o texto. El texto se interpreta en el motor de cesta (H4).
- **Carga con histórico por intervalos.** Si precio y promoción no cambian solo se actualiza `price.checked_at`; si cambian se cierra el intervalo y se abre otro. Un producto que deja de aparecer en una zona pierde el precio vigente, y el que no aparece en ninguna zona pasa a `active = false`.
- **Alerta por caída > 20 %.** Si una captura trae más de un 20 % menos productos que la última correcta, se registra como `alert`, no se cierra ni desactiva nada y el comando termina con código 1. En GitHub Actions eso hace fallar el job y GitHub avisa por correo; no hace falta otro canal en el MVP.
- **Nueva tabla `ingest_run`** (migración `20261020000002`): registro de cada captura (productos, peticiones, cambios, estado, categorías truncadas). Solo accesible con la clave de servicio.
- **Cron desactivado.** `.github/workflows/ingest.yml` está programado a las 04:17 UTC, pero solo corre si la variable `INGEST_ENABLED` del repositorio vale `true`. Siempre se puede lanzar a mano.
- **Límites:** 20 peticiones por minuto por cadena por defecto (`INGEST_RPM_*`), caché en disco de 20 h, reintento solo ante 429 y 5xx (respetando `Retry-After`) y ninguno ante bloqueo.
- **Tests de contrato** con respuestas reales grabadas por `cli.py record-fixtures` (unas 15 peticiones). Las páginas grandes se recortan a la parte que leen los conectores.
