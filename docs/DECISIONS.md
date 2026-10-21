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

## H2. Normalización y emparejamiento

- **Muestra de catálogo real** (`ingest/tests/fixtures/sample`, 2.462 productos de Mercadona, Dia y Alcampo, 20/10/2026, unas 130 peticiones). Es la base de los tests, del conjunto de referencia y de los datos de desarrollo (`cli.py load-sample`). Los precios cargados así llevan la fuente "(muestra)" y su fecha de captura.
- **Parser de formatos validado contra la propia cadena.** Cada formato leído del nombre se contrasta con el precio por unidad que publica la cadena (obligatorio por el RD 3423/2000). Coincide (±2 %) en el 96,1 % de 1.371 productos; el resto son incoherencias de la cadena (peso escurrido en conservas, precios por kg desfasados). Los 200 casos del test son reales y su verdad es el precio por unidad publicado, no la salida del parser.
- **Convenciones de pack distintas por cadena.** En Dia "6 unidades … 540 g" es el total; en Alcampo "3 uds. 120 g" es cada envase (y ni siquiera son constantes). El conector elige la lectura que cuadra con el precio por unidad publicado.
- **Taxonomía de 363 hojas** en 21 secciones que coinciden con los pasillos del supermercado (sirven para agrupar el modo tienda). Cada hoja lleva variantes que definen la equivalencia, unidad de compra, alérgenos (Reglamento UE 1169/2011, anexo II) y dietas incompatibles. Se genera el seed (`supabase/seeds/10_taxonomia.sql`) y un JSON para la web (`packages/core/src/data/taxonomy.json`) con `python -m matching.export_taxonomy`; un test comprueba que están al día.
- **Tres niveles como tres canónicos.** Cada producto de cadena se enlaza con un canónico genérico (la hoja), uno equivalente (hoja + variante + marcas como sin lactosa o ecológico + rasgos diferenciadores) y, si es de marca de fabricante, uno idéntico (además marca y formato). El modelo de datos de la especificación ya lo permitía (`equivalence` es una relación N a N). Se añaden a `product_canonical` las columnas `level` y `key` (clave estable del emparejador).
- **Rasgos diferenciadores** (`matching/differentiators.py`): cabra/oveja, enriquecida, en polvo, light, precocinado, en pastillas, tipos de queso rallado, en conserva frente a fresco en verduras… Si dos productos difieren en uno, no son equivalentes aunque compartan hoja y variante. Fue lo que llevó la precisión de equivalentes del 64,5 % al 98,4 %.
- **Marcas blancas nunca son idénticas entre cadenas.** Las submarcas de Dia ("Dia Láctea", "El Molino de Dia") se detectan por la palabra "dia". Mercadona no publica la marca: se busca en el nombre con el léxico de marcas que publican Dia y Alcampo, y "Central Lechera Asturiana" y "Asturiana" se tratan como la misma marca.
- **Embeddings léxicos por hashing** (palabras, pares de palabras y trigramas, 256 dimensiones) en lugar de un modelo semántico: para nombres de producto importa el parecido de palabras, es determinista, no necesita descargar modelos ni una clave de API y se guarda en pgvector (`product_chain_embedding`, índice HNSW, función `similar_products`). La interfaz `Embedder` permite cambiarlo.
- **IA para lo dudoso, no para todo.** Las reglas resuelven el ~80 % con confianza; el resto va a clasificación con IA por lotes de 40 (salida estructurada con la hoja restringida a un `enum` de slugs reales) y, si tampoco, a la cola `match_review`. Los idénticos con parecido de nombre entre 0,6 y 0,85 se verifican con IA o van a revisión. Modelo `claude-opus-5-5` con esfuerzo bajo y respaldo automático del servidor si los filtros de seguridad rechazan la petición (`fallbacks: "default"`).
- **Umbrales:** el enlace equivalente pide confianza ≥ 0,9 (reglas) o ≥ 0,8 (IA); el genérico ≥ 0,8 o ≥ 0,7. Equivocarse en el equivalente cambia el producto que se compra.
- **Las decisiones humanas no se pisan:** un enlace con `source = 'human'` se conserva en cada nueva ejecución.
- **Botón "no es equivalente":** función `report_not_equivalent` para usuarios con sesión; crea una entrada `usuario` en la cola de revisión.
- **Conjunto de referencia de 500 pares** (`ingest/tests/data/referencia_500.json`), estratificado y etiquetado a ciegas (sin ver la predicción). Lo etiquetó Claude revisando nombre, marca y formato; conviene que una persona lo revise. Una etiqueta se corrigió al comprobar el dato (par 178: fresco frente a congelado).
- **Resultado solo con reglas** (`python -m matching.evaluate`):

| Nivel predicho | Pares | Precisión | Objetivo |
| -------------- | ----- | --------- | -------- |
| Idéntico       | 16    | 100,0 %   | 95 %     |
| Equivalente    | 126   | 98,4 %    | 95 %     |
| Genérico       | 180   | 99,4 %    | —        |

La exhaustividad de equivalentes es del 84 %: lo que las reglas no resuelven queda sin enlace equivalente hasta que pase por la IA o por revisión. **Sin clave de API en este entorno no se ha podido medir la parte con IA**; `python -m matching.evaluate --llm` lo hace en cuanto haya `ANTHROPIC_API_KEY`.

## H3. Armazón PWA

- **Service worker con `@serwist/turbopack`.** Se construye en una ruta (`/serwist/sw.js`) con esbuild. Precarga los estáticos de la build y, además, las rutas del armazón (`/`, `/lista`, `/platos`, `/menu`, `/tienda`, `/perfil`, `/bienvenida`, `/instalar`) para que la app abra en modo avión. Catálogo y precios (`/api/catalog/*`) con _stale-while-revalidate_; página `/~offline` para lo que no esté guardado.
- **Las páginas son estáticas y los datos viven en el dispositivo.** Todo lo del usuario (hogar, listas, platos, menú, despensa, modo tienda) está en IndexedDB con Dexie y la interfaz lee de ahí. El servidor solo se usa para catálogo, comparación e IA.
- **Cola de sincronización propia** (`lib/sync.ts`): cada cambio se guarda como operación, se fusionan los upserts de la misma fila y se envían en orden con la sesión del usuario, de modo que RLS limita la escritura a su hogar. Se reintenta al volver la conexión y al volver la app a primer plano; no se usa Background Sync (no existe en iOS). Si una operación falla, se para y se conserva el orden.
- **Cuenta opcional.** Sin cuenta la app funciona entera en el móvil; con cuenta (enlace mágico al correo de Supabase, flujo PKCE) los datos se sincronizan. El hogar se crea en el servidor con `create_household` al primer envío con sesión; si el usuario ya tenía hogar en otro dispositivo, se reutiliza.
- **Instalación.** Manifest con iconos de 192 y 512 px y uno _maskable_; `apple-touch-icon` y `apple-mobile-web-app-capable` (Next 16 solo emite la variante sin prefijo, así que la añadimos). Botón propio con `beforeinstallprompt` en Android y escritorio; en iOS, enlace a `/instalar` con los pasos de Safari, solo si no está ya en modo `standalone`.
- **Iconos generados** con `apps/web/scripts/make-icons.mjs` (sharp) a partir de un SVG propio.
- **Textos en `src/i18n/es.ts`**, preparados para añadir otros idiomas.
- **Accesibilidad:** objetivos táctiles de 44 px, contraste AA en claro y oscuro, foco visible y comprobación automática con axe (WCAG 2.1 AA) en las pruebas de Playwright.
- **Pruebas de extremo a extremo** contra la build de producción en un Pixel 7 emulado. Incluyen el modo avión: la app recarga, navega y guarda cambios sin conexión, y los cambios siguen en la cola tras recargar. En CI se levanta Postgres con la muestra real emparejada para los hitos siguientes.
- **Sin Supabase en este entorno** (las imágenes de Docker no se pudieron descargar por límites del registro): el inicio de sesión y la sincronización con el servidor real están implementados pero solo probados con una cola simulada. Hay que probarlos con `supabase start` antes de publicar.

## H4. F1 Lista y comparador

- **Motor de cesta en `packages/core/src/basket.ts`**, puro y probado: para cada línea y cadena elige el producto que cubre la cantidad al menor coste con envases enteros y promociones; después enumera las tiendas únicas y todas las parejas (solución exacta). La mejor opción es la que cubre más líneas y, a igualdad, la más barata con el coste fijo por tienda; repartir en dos tiendas solo se propone si ahorra de verdad.
- **Promociones:** se aplican las que se entienden sin ambigüedad (N×M, enésima unidad con descuento). "2 X 2 L" es un formato, no un 2x2. Si la promoción regala envases, se avisa ("3 cuestan lo mismo que 2"). Las bajadas de precio ya vienen en el precio actual.
- **Cantidad de referencia.** Si la lista no da cantidad ("aceite de oliva"), comparar "un envase" premia el envase más pequeño (250 ml frente a 1 l). Se compara la mediana del contenido de los envases disponibles y la interfaz lo dice ("se compara 1 l").
- **Líneas sin precio:** nunca se ocultan. Las que no tienen oferta en ninguna cadena aparecen como "No disponible en ninguna cadena"; las que faltan en una cadena, como "No disponible aquí" en esa cadena.
- **Interpretación de la lista en dos niveles.** Un intérprete determinista en `packages/core/src/listparse.ts` (cantidades, docenas, "medio kilo", envases, "para 4", marcas como sin lactosa) con las mismas palabras clave que el clasificador de productos, exportadas en `taxonomy.json`; funciona sin conexión y sin IA. Si hay `ANTHROPIC_API_KEY`, `/api/list/parse` usa la IA con salida estructurada (la hoja restringida a un `enum` de slugs, Zod, un reintento) y, si falla, vuelve a las reglas. Una cantidad deducida de "para 4" se marca como estimada.
- **Niveles en la consulta.** Idéntico: el canónico idéntico elegido ("Quiero exactamente este producto" en el resultado). Equivalente: misma hoja, variante si se pidió, mismas marcas y sin rasgos diferenciadores. Genérico: cualquier producto de la hoja. Con "leche" sin variante, el nivel equivalente acepta cualquier variante pero no leche de cabra, enriquecida o sin lactosa.
- **Catálogo leído desde el servidor con SQL** (`postgres`, `DATABASE_URL`, de solo lectura) en vez de PostgREST: una consulta por línea con el precio vigente en la zona del código postal. La comparación de 20 líneas tarda unos 70 ms en local.
- **Rasgos propios de la hoja:** "Garbanzos cocidos" no se separa de sí misma por el rasgo "cocinado". Nuevos rasgos: "codorniz" (los huevos de codorniz no son huevos de gallina) y jalapeños o guindillas dentro de "picante".
- **Dictado** con la API de reconocimiento de voz del navegador cuando existe; si no, el teclado del móvil ya permite dictar.
- **Base de desarrollo:** `scripts/dev-db.sh` crea una base con migraciones, seeds, la muestra real y el emparejamiento.
- **Criterios de aceptación de F1** comprobados en Playwright sobre la muestra real: 20 líneas interpretadas en menos de 4 s, comparación en menos de 800 ms, líneas sin precio visibles como no disponibles y total igual a la suma de líneas.

## H5. F2 Platos

- **Intérprete de recetas en `packages/core/src/recipeparse.ts`**, puro y sin red: secciones Ingredientes/Preparación, raciones y tiempo, cucharada = 15 ml y cucharadita = 5 ml, dientes de ajo como unidades, "un bote (400 g)" con el peso indicado, "al gusto" como opcional y "sal y pimienta" en dos ingredientes. Con las 5 recetas de prueba propias (`data/test/recetas.json`, 10 ingredientes cada una) identifica al menos 9 de 10 en todas.
- **Coste del plato en `packages/core/src/recipecost.ts`**: coste por ración con la cantidad realmente usada (precio por unidad de medida) y coste de compra con envases enteros (motor de cesta). Cada ingrediente usa primero productos equivalentes y, si una cadena no tiene, cualquiera de su hoja; la interfaz dice el nivel de cada producto. Sin cantidad, sin precio o con unidades que no se pueden convertir (ml a g sin densidad conocida), el ingrediente se queda sin coste y se dice por qué; no se estima.
- **Peso de una pieza** ("2 tomates") a partir de los productos que las propias cadenas venden por pieza, solo en fruta y verdura (mediana). Si no hay, la línea queda "no se puede convertir la unidad".
- **Rutas POST** (`/api/recipes/extract`, `/generate`, `/cost`) en lugar de `GET /api/recipes/:id/cost`: los platos viven en el móvil (IndexedDB) y pueden no estar aún en el servidor, así que se envían los ingredientes.
- **Importar desde un enlace:** primero el marcado schema.org/Recipe, sin IA (comprobado en test); si no lo hay, IA sobre el texto visible y, sin IA, reglas. De una página ajena solo se guardan ingredientes, cantidades, raciones, tiempo y el enlace: ni los pasos ni las fotos del autor. La descarga solo admite http(s), bloquea direcciones privadas (para que el servidor no sirva de puente a la red interna) y limita tiempo (8 s) y tamaño (3 MB).
- **Foto de una receta:** visión del modelo con salida estructurada; la imagen no se guarda en ningún sitio.
- **Generación con IA:** salida estructurada con la hoja restringida a los slugs de la taxonomía; después se comprueba cada ingrediente contra los alérgenos y dietas del perfil con la taxonomía (no se confía en el modelo). Si incumple, se reintenta una vez indicando el motivo; si vuelve a incumplir, se rechaza. Un ingrediente sin hoja no se puede comprobar y cuenta como incumplimiento. "Sin lactosa" no quita el alérgeno lácteos; "sin gluten" sí quita el gluten. Se priorizan las hojas con promociones esa semana en la zona.
- **Modelo de datos (migración `20261021000005`):** `recipe_ingredient` admite ingredientes sin cantidad ("sal al gusto") y sin ingrediente canónico, con nombre, variante, marcas y posición. La alternativa era inventar cantidades o descartar ingredientes, que la especificación prohíbe.
- **Nutrición:** de Open Food Facts por EAN con caché (`product_nutrition`, migración `20261021000004`) y atribución ODbL. Las cadenas no publican el EAN en sus listados, así que hoy casi ningún plato tiene datos; solo se muestra el total si todos los ingredientes los tienen y, si no, "Sin datos". No se usan tablas genéricas para no presentar como dato algo estimado.
- **Sin conexión:** los platos se guardan en el móvil y se sincronizan con la cola. La ficha `/platos/plato?id=` se abre en modo avión (el service worker ignora el parámetro `id` al buscar en la precarga); calcular el coste necesita conexión y se dice.
- **Pendiente sin clave de IA en este entorno:** la extracción con IA, la foto y la generación están probadas con la IA simulada; no se han probado contra la API real.

## H6. F3 y F4 Menú

- **HiGHS en lugar de OR-Tools (CP-SAT).** OR-Tools no tiene versión para Node y obligaría a montar un servicio Python aparte. HiGHS es un optimizador de programación lineal entera de la Universidad de Edimburgo, con licencia MIT y compilado a WebAssembly (`highs` 1.15.3, fijado). El modelo es el de la especificación, escrito como programa lineal entero en `packages/menu/src/plan.ts`; el solver se pasa como parámetro para que el paquete siga siendo puro y sin red.
- **Modelo.** Variables x (plato en hueco), n (envases de cada opción de compra), u (lo que se toma de la despensa) y w (sobrante). Por ingrediente se ofrecen hasta cuatro envases de las tiendas elegidas: los tres más baratos por unidad y el más pequeño, para que el optimizador pueda elegir entre 1 kg y 500 g. El desperdicio se valora al precio por unidad más barato del ingrediente. Restricciones: un plato por hueco, como mucho dos veces por semana, platos fijados y presupuesto.
- **Modos (pesos en euros):** ahorro (solo coste); variedad (8 € por repetir un plato y un premio de 0,50 € por cada ingrediente distinto en la semana); aprovechamiento (el sobrante cuenta como coste y cada producto distinto más pesa 1 €). Con los precios reales de la muestra, aprovechamiento compra entre un 35 % y un 45 % menos de productos distintos que variedad (criterio: al menos un 20 %), con menos desperdicio.
- **Ingredientes sin precio.** Un plato no debe parecer barato porque falte el precio de su ingrediente principal: cada ingrediente sin precio penaliza 1,50 € por ración al elegir, sin sumarse al coste mostrado, y la pantalla los lista como "sin precio (no están en el coste)".
- **Ahorro frente a un menú elegido solo por gusto:** el mismo número de huecos resuelto solo por variedad, sin mirar precios (desempate determinista), con su compra mínima. Se dice así en la pantalla.
- **Tiempo:** 1,8 s para el menú y 1 s para la referencia; con 14 huecos y 200 platos candidatos, unos 2 s en total. Si se agota el tiempo se usa el mejor menú encontrado y se avisa.
- **Sin solución:** se explica la causa: no hay platos para un tipo de comida, el presupuesto no alcanza (con el coste del menú más barato posible) o faltan platos para no repetir más de dos veces.
- **Recetario base:** 40 platos sencillos de cocina de casa escritos para el proyecto (`packages/menu/src/recetario.ts`), para que el menú funcione aunque el usuario aún no tenga platos. Se puede desactivar. Los huecos con estos platos se guardan en el servidor por referencia (`meal_plan_slot.recipe_ref`, migración `20261021000006`).
- **Alergias y dietas:** los platos con un ingrediente que incumple, o que no se puede comprobar, no entran en el menú salvo que el usuario los fije; la respuesta dice cuántos se han dejado fuera. La comprobación está en `packages/core/src/diet.ts`, compartida con la generación de platos.
- **API:** una sola ruta, `POST /api/menu/plan`, en lugar de `/plan`, `/:id/swap` y `/:id/to-list`. Los menús viven en el móvil: "cambiar" es recalcular con el resto de huecos fijados y el plato actual prohibido en ese hueco; "regenerar" deja fijados solo los bloqueados; y "generar lista" se hace en el móvil (`menuToListLines`), con lo que hace falta menos la despensa, ordenado por sección.
- **Despensa manual** en el móvil (con sincronización), por producto genérico de la taxonomía.
- **Fixture con precios reales** para las pruebas del optimizador (`packages/menu/src/data/test/precios-muestra.json`), generado desde la muestra con `apps/web/scripts/export-menu-fixture.export.ts`.
- **Corrección en F1:** los identificadores bigint de Postgres llegaban como texto; al elegir "Quiero exactamente este producto", la siguiente comparación se rechazaba. Ahora se convierten a número en el catálogo.
- **Limitación conocida:** algunos emparejamientos de la muestra son mejorables (p. ej., una "ensalada rusa con atún" clasificada como atún en conserva) y aparecen en las compras del menú. Es calidad de H2, no del optimizador.

## H7. F5 Modo tienda y cierre del MVP

- **Modo tienda:** "Ir a comprar a …" en el resultado de la comparación descarga al móvil la lista de esa tienda (producto elegido, envases, precio con su fecha y enlace a la ficha), ordenada por las secciones de la taxonomía, que coinciden con los pasillos. En un plan de dos tiendas, cada lista lleva solo lo que se compra en ella; lo que la tienda no tiene aparece como "No disponible en esta tienda". Solo hay un viaje activo a la vez.
- **Sin conexión:** el viaje vive en IndexedDB; marcar y anotar precios se guarda al momento. Marcar un producto marca también su línea de la lista (que se sincroniza si hay cuenta). Cada precio anotado se encola como `price_observation` y se envía al volver la conexión con sesión iniciada; sin cuenta se queda en el móvil.
- **Datos de salud (pregunta abierta al propietario).** Las dietas y alergias son datos de salud (art. 9 RGPD). Por prudencia, solo se suben a la cuenta si el usuario marca una casilla de consentimiento explícito en su perfil; si no, se quedan en el móvil, y al retirar el consentimiento se borran del servidor. Es una decisión legal que conviene confirmar.
- **Páginas legales** (`/legal/aviso-legal`, `/legal/privacidad`, `/legal/cookies`) y **metodología** (`/metodologia`), enlazadas desde el perfil y disponibles sin conexión. Los datos que no conocemos (titular, NIF, domicilio, contacto, proveedores de alojamiento y garantías de transferencia) aparecen marcados como "Pendiente" en lugar de inventarlos. Las normas citadas enlazan a su fuente oficial (BOE, EUR-Lex, AEPD) y se comprobó que cada enlace abre la norma correcta.
- **Sin aviso de cookies:** la app no usa cookies de análisis ni de publicidad; solo IndexedDB, la caché del service worker y, con sesión, localStorage para la sesión de Supabase. Son técnicos y están exentos de consentimiento (art. 22.2 LSSI-CE).
- **Precisión actual del emparejamiento** (solo reglas, tras los ajustes de H4): idénticos 100 %, equivalentes 97,6 % y genéricos 99,4 %. La tabla de H2 reflejaba la medición de entonces (98,4 % en equivalentes).
- **Pruebas de aceptación en Playwright (Pixel 7 emulado):** F1 (lista de 20 líneas, tiempos, no disponibles, totales), F2 (receta pegada con al menos 9 de 10 ingredientes identificados, coste por ración y de compra, nutrición "sin datos", a la lista, sin conexión), F3 y F4 (menú de 14 huecos, presupuesto que no alcanza explicado y respetado cuando alcanza, cambiar, bloquear, regenerar, sin conexión, a la lista, plato propio fijado) y F5 (modo avión, marcar, precio real, cerrar y reabrir). Los criterios que no dependen de la interfaz se comprueban con Vitest: schema.org sin llamada a la IA, cumplimiento del 100 % de alergias y dietas en los casos de prueba, aprovechamiento con al menos un 20 % menos de productos que variedad y menú en menos de 3 s con 200 platos candidatos.
