# Documento maestro para Claude Code: PWA comparador de supermercados

Oct 20, 2026 · @Carlos

## Objetivo y alcance

Claude Code debe construir una PWA instalable desde el navegador que, a partir del código postal del usuario, le diga dónde le sale más barata su compra y le ayude a decidir qué cocinar con lo que está barato esa semana. Este documento es la especificación de referencia: ante cualquier duda de producto, manda lo que dice aquí.

**Contexto previo.** La viabilidad, el acceso a datos por cadena, el marco legal y el algoritmo de la cesta están en el documento [Comparador de supermercados en España: viabilidad y plan](https://claude.ai/code/artifact/c85aa130-de58-41a0-adbd-99e208e26cec). Este documento no lo repite; lo da por base.

**Dentro del alcance del MVP:**

- PWA instalable en Android e iOS, sin tiendas de aplicaciones, usable sin conexión en el supermercado.
- Captura diaria de precios de Mercadona, Carrefour, Dia y Alcampo para los códigos postales de 5 ciudades.
- Lista de la compra en lenguaje natural, comparación por tienda única y por compra repartida en 2 tiendas.
- Creación de platos con coste por ración en cada cadena.
- Menú semanal por presupuesto que reaprovecha ingredientes (función nueva 1).
- Modo tienda sin conexión.

**Fuera del MVP (fases siguientes):** Lidl y Aldi, despensa alimentada por tickets (función nueva 2), lista compartida en tiempo real, alertas push, histórico de precios público, compra directa en la web de la cadena.

**Cómo usarlo con Claude Code:** exportar este documento a Markdown, guardarlo como `docs/SPEC.md` en el repositorio y copiar la sección "Reglas de trabajo" en `CLAUDE.md`. El prompt de arranque debe indicar el hito por el que empezar.

## Competencia: qué hacen y dónde no llegan

Ninguna alternativa une las tres piezas: precios reales de supermercados españoles por código postal, platos con coste por ración y un menú que se optimiza por presupuesto. Las apps de menús no conocen precios locales; los comparadores españoles no planifican comidas, o lo hacen con recetas fijas.

| Alternativa | Qué hace bien | Dónde no llega | Cómo lo superamos |
| --- | --- | --- | --- |
| [Samsung Food](https://apps.apple.com/br/app/id1133637674) | Más de 240.000 recetas, planificador semanal, lista compartida, nutrición; en la versión de pago, planes por IA y recetas según lo que tienes en casa, priorizando lo que caduca antes ([fuente](https://news.samsung.com/us/?p=74058)) | No conoce precios de supermercados españoles; lo mejor (despensa, IA) es de pago | Coste real por ración en tu zona; despensa gratis alimentada por el ticket |
| [Mealime](https://www.plantoeat.com/?p=37293) | Planes sencillos, filtros por dieta y alergias, lista automática | Solo cenas y recetas propias de la app; sin precios | Platos propios del usuario y menú completo con precio |
| [Eat This Much](https://www.plantoeat.com/blog/2023/10/eat-this-much-app-review-pros-and-cons/) | Plan automático por macros, con límite de gasto diario ([fuente](https://fitia.app/en/learn/article/top-3-meal-planning-apps-compared/)) | Una reseña señala listas enormes por exceso de variedad de recetas; pensado para una persona; precios no españoles | Menú de aprovechamiento: menos ingredientes distintos, envases completos usados |
| [Plan to Eat](https://www.plantoeat.com/?p=9210) y Paprika | Recetario propio, importación de recetas, calendario | Sin recetas sugeridas ni precios; todo manual | Importación de recetas con IA y coste automático |
| [RadarSuper](https://radarsuper.com/) | Precios diarios de 5 cadenas, recetas con coste por ración, menú semanal | Recetas del sitio, cesta básica fija de 12 productos, sin compra repartida | Platos del usuario, menú por presupuesto propio, optimizador multitienda |
| [SoySuper](https://www.applesfera.com/aplicaciones-ios/comienza-operacion-despensa-para-vuelta-al-cole-esta-app-para-iphone-he-ahorrado-monton-a-hora-hacer-compra), Findit, OkLista | Lista comparada por cadena, escáner de código de barras | Sin planificación de comidas ni platos | Del plato a la lista y de la lista a la tienda más barata |

**Huecos que vamos a ocupar:**

1. **Coste local y real del plato.** El precio de un plato depende del código postal y de la cadena; nadie lo calcula con los platos propios del usuario.
2. **Menú que gasta menos y desperdicia menos.** Los planificadores eligen recetas por gusto o macros; ninguno elige las que comparten ingredientes y agotan los envases que compras.
3. **Despensa sin esfuerzo.** Samsung Food la ofrece de pago y ligada a su ecosistema; aquí se alimenta con la foto del ticket, que además aporta precios reales de tienda (también de Lidl y Aldi).
4. **Instalación sin tienda.** Los planificadores se usan sobre todo como app de tienda; aquí basta abrir la web y añadirla a la pantalla de inicio.

## Catálogo de funciones

Son ocho funciones; las cinco marcadas como MVP se implementan ahora y las demás quedan especificadas para fases posteriores. Las dos funciones nuevas que propone este documento son F4 y F7.

| ID | Función | Qué hace | Fase |
| --- | --- | --- | --- |
| F1 | Lista inteligente y comparador | Lista escrita en lenguaje natural ("2 docenas de huevos, leche sin lactosa, pechuga para 4"), convertida en productos con nivel de equivalencia; total por cadena y mejor combinación de 1 o 2 tiendas | MVP |
| F2 | Creación de platos | El usuario crea platos a mano, pegando texto o una URL, desde una foto de la receta o pidiendo a la IA un plato con ciertos ingredientes; cada plato muestra coste por ración en cada cadena de su zona e información nutricional | MVP |
| F3 | Menú semanal por presupuesto | Elige platos para los días y comidas indicados, para N personas, sin pasar de un presupuesto semanal; genera la lista de la compra | MVP |
| F4 | **Nueva: menú de aprovechamiento** | Optimizador que, al elegir el menú, premia platos que comparten ingredientes y usan envases completos (si compras 1 kg de pechuga, el menú la gasta entera); muestra el desperdicio estimado y el ahorro frente a un menú sin optimizar | MVP |
| F5 | Modo tienda | Lista de la tienda elegida, agrupada por sección, que funciona sin conexión y permite marcar productos y anotar el precio real visto | MVP |
| F6 | Sustitución por precio | Si un ingrediente de un plato está caro esta semana en tu zona, propone un sustituto equivalente y muestra el ahorro | v2 |
| F7 | **Nueva: despensa por ticket** | Foto del ticket: se leen las líneas, se actualiza la despensa del hogar y se guardan como precios observados en tienda; el menú prioriza lo que ya tienes y lo que caduca antes | v2 |
| F8 | Hogar compartido y alertas | Lista y menú compartidos entre miembros del hogar; avisos cuando baja de precio un producto habitual | v2 |

**Por qué F4 y F7.** F4 ataca a la vez el gasto y el desperdicio y no existe en los competidores revisados; además reutiliza el motor de cesta y el catálogo canónico, así que su coste marginal es bajo. F7 resuelve dos problemas del producto con una sola acción del usuario: tener despensa sin teclear y conseguir precios de tienda física, incluidos Lidl y Aldi, que no publican su catálogo online.

**Detalle de F2, creación de platos.** Cinco vías de entrada, todas acaban en la misma estructura (ingredientes canónicos con cantidad y unidad, pasos, raciones, tiempo, etiquetas):

1. Formulario manual con autocompletado de ingredientes canónicos.
2. Texto pegado: la IA extrae ingredientes y pasos.
3. URL de una receta: se lee el marcado `schema.org/Recipe` si existe; si no, la IA extrae el contenido. Solo se guardan ingredientes y cantidades, y el enlace a la fuente; no se copian textos ni fotos del autor.
4. Foto de una receta en papel: extracción con un modelo de visión.
5. Generación por IA: "algo con garbanzos y espinacas para 4, menos de 30 minutos", priorizando ingredientes baratos esa semana en la zona del usuario.

El usuario siempre revisa y confirma los ingredientes emparejados antes de guardar el plato.

## Priorización

El MVP incluye las dos funciones de más valor y poco esfuerzo (F4 y F5) y las tres piezas sin las que el producto no existe (F1, F2 y F3); F7 aporta mucho valor pero depende de la lectura de tickets y queda para v2.

&#91;embedded content: priorización de funciones · valor frente a esfuerzo, estimación propia\]

F4 cae en victorias rápidas porque reutiliza el catálogo canónico y el optimizador del menú; F8 queda al final porque las notificaciones en iOS dependen de la instalación y su comportamiento en la UE no está claro.

## Requisitos PWA

La app debe instalarse desde el navegador y funcionar sin conexión en el supermercado; las notificaciones son un extra opcional porque en iOS dependen de que la app esté instalada y de un permiso explícito. Safari soporta Service Worker y Web App Manifest desde iOS 11.3, e iOS 16.4 añadió Web Push y el contador en el icono para apps instaladas en la pantalla de inicio ([fuente](https://www.monterail.com/blog/pwa-for-apple-ios)).

**Instalación**

- `manifest.webmanifest` con `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `theme_color`, `background_color`, `lang: "es"` e iconos de 192 y 512 px, incluido uno `maskable`.
- Etiquetas `apple-touch-icon` y `apple-mobile-web-app-capable` para iOS.
- En Android y escritorio, botón propio "Instalar" que usa el evento `beforeinstallprompt`. En iOS, pantalla de ayuda con los pasos de Safari (Compartir y Añadir a pantalla de inicio), mostrada solo si la app no está ya en modo `standalone`.

**Funcionamiento sin conexión**

- Service worker con precarga del armazón de la app (rutas, CSS, JS, iconos) y estrategia *stale-while-revalidate* para catálogo y precios.
- Datos del usuario (listas, platos, menú, despensa) en IndexedDB, con cola de sincronización que se envía al recuperar la conexión o al volver la app a primer plano. No se depende de Background Sync porque no está disponible en iOS ([fuente](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).
- El modo tienda (F5) debe funcionar entero en modo avión una vez abierta la lista.
- Cada precio mostrado lleva su fecha de captura; sin conexión se avisa de que puede estar desactualizado.

**Notificaciones (fase v2)**

- Web Push con claves VAPID; la suscripción solo se pide tras un toque del usuario, requisito de Safari ([fuente](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=es)).
- **Riesgo UE:** Apple llegó a anunciar la retirada de las PWA en la UE con iOS 17.4 y dio marcha atrás ([fuente](https://www.applesfera.com/aplicaciones-ios-1/websapp-siguen-disponibles-ios-17-4-pese-a-amenaza-apple-eliminarlas-miedo-a-ue-ha-funcionado)). Las fuentes consultadas no coinciden sobre si Web Push funciona hoy en iPhone dentro de la UE, así que hay que probarlo en un dispositivo real y tener alternativa: avisos dentro de la app y correo opcional.

**Calidad mínima**

- HTTPS obligatorio, primera carga útil en menos de 2,5 s en 4G en un móvil de gama media, diseño desde 360 px de ancho, accesibilidad AA (contraste, tamaño táctil de 44 px, etiquetas).
- Interfaz en español; textos preparados para traducción (catalán, euskera y gallego en el futuro).

## Stack, repositorio y modelo de datos

Un monorepo con la web en TypeScript y la ingesta en Python, sobre Supabase. Claude Code debe comprobar las versiones estables actuales de cada dependencia antes de instalarlas.

| Capa | Tecnología | Motivo |
| --- | --- | --- |
| Web y PWA | Next.js (App Router), TypeScript estricto, Tailwind CSS | Renderizado en servidor para SEO de páginas de producto, ecosistema PWA maduro |
| Service worker | Serwist o un service worker propio con Workbox | Precarga y estrategias de caché declarativas |
| Datos en el cliente | IndexedDB con Dexie | Listas, platos y modo tienda sin conexión |
| Backend | Supabase: Postgres, Auth, Storage, Row Level Security, Edge Functions | Un solo servicio para datos, usuarios y ficheros |
| Ingesta y emparejamiento | Python 3.12, httpx, pydantic, pgvector para embeddings | Conectores por cadena aislados y testeables |
| Orquestación | GitHub Actions con cron en el MVP; Airflow si crece | Coste cero al inicio |
| IA | API de Claude: lista en texto, extracción de recetas, clasificación de productos, verificación de equivalencias | Salidas estructuradas en JSON validadas con esquemas |
| Optimización | Enumeración exacta para la cesta; OR-Tools para el menú (F3 y F4) | Problemas pequeños, solución óptima garantizada |
| Tests | Vitest, Playwright, pytest | Unidad, extremo a extremo y conectores |

**Estructura del repositorio**

```text
/apps/web            Next.js: páginas, componentes, service worker, manifest
/packages/core       Tipos compartidos, motor de cesta, unidades y conversiones
/packages/menu       Optimizador de menú (F3, F4)
/ingest/connectors   Un módulo por cadena: mercadona.py, carrefour.py, dia.py, alcampo.py
/ingest/matching     Normalización, taxonomía, embeddings, verificación con LLM
/ingest/tests        Tests de contrato con respuestas grabadas por cadena
/supabase/migrations SQL versionado
/docs                SPEC.md (este documento), decisiones de arquitectura
```

**Modelo de datos (núcleo)**

```sql
-- Catálogo y precios
chain(id, name, slug)
price_zone(id, chain_id, external_ref)                 -- almacén o zona de precios
postal_code_zone(postal_code, chain_id, price_zone_id)
product_chain(id, chain_id, external_id, name, brand, quantity, unit, units_per_pack, ean, category_ref, url)
product_canonical(id, category_id, name, attributes jsonb)
category(id, parent_id, name)                          -- taxonomía canónica de 300 a 500 hojas
equivalence(product_chain_id, product_canonical_id, level, confidence, source)  -- level: identical|equivalent|generic
price(id, product_chain_id, price_zone_id, price, unit_price, promo jsonb, source, valid_from, valid_to)

-- Usuario y hogar
household(id, postal_code, members, weekly_budget)
profile(user_id, household_id, diet jsonb, allergens jsonb, disliked jsonb)
shopping_list(id, household_id, name, created_at)
list_item(id, list_id, raw_text, product_canonical_id, quantity, unit, equivalence_level, preferred_brand, checked)

-- Platos y menú
ingredient(id, name, product_canonical_id, default_unit, density_g_ml, unit_weight_g)
recipe(id, household_id, title, servings, minutes, steps jsonb, tags text[], source_url, visibility)
recipe_ingredient(recipe_id, ingredient_id, quantity, unit, optional)
meal_plan(id, household_id, week_start, budget, people, optimized_for)
meal_plan_slot(meal_plan_id, day, meal, recipe_id, servings)

-- Fase v2
pantry_item(id, household_id, ingredient_id, quantity, unit, best_before)
receipt(id, household_id, chain_id, store_ref, purchased_at, image_path, status)
price_observation(id, product_chain_id, price, observed_at, source)  -- ticket o modo tienda
```

Reglas: precios con histórico por intervalos (`valid_from`, `valid_to`) y fila nueva solo si cambia; todas las tablas de usuario con Row Level Security por `household_id`; unidades normalizadas a g, ml o unidad en `packages/core`.

## Especificación de las funciones del MVP

Cada función tiene pantallas, flujo, API y criterios de aceptación; una función está terminada cuando pasan sus criterios en Playwright sobre un móvil emulado.

### Pantallas

Navegación inferior con cinco pestañas: **Lista**, **Platos**, **Menú**, **Tienda** y **Perfil**. Primer uso: código postal, número de personas, presupuesto semanal opcional, dietas y alérgenos, cadenas que tiene cerca.

### F1. Lista inteligente y comparador

- **Flujo:** el usuario escribe o dicta la lista; la IA la convierte en líneas (producto canónico, cantidad, unidad, nivel de equivalencia por defecto: equivalente); cada línea se puede abrir para elegir marca o nivel; botón "Comparar".
- **Resultado:** total por cadena con cobertura de la lista, mejor tienda única y mejor combinación de 2 tiendas con el ahorro; en cada línea, producto elegido, precio, precio por kg o litro y fecha del precio.
- **API:** `POST /api/list/parse` (texto a líneas), `POST /api/basket/compare` (líneas, código postal, cadenas, máximo de tiendas, coste fijo por tienda).
- **Aceptación:** una lista de 20 líneas se interpreta en menos de 4 s; la comparación responde en menos de 800 ms; ninguna línea sin precio se oculta, se marca como no disponible; el total cuadra con la suma de líneas.

### F2. Creación de platos

- **Flujo:** botón "Nuevo plato" con las cinco vías de entrada del catálogo; pantalla de revisión donde cada ingrediente aparece emparejado con su ingrediente canónico y se puede corregir; guardar.
- **Ficha del plato:** raciones ajustables, coste por ración en cada cadena de la zona (con el producto concreto usado), coste total, información nutricional por ración si los productos tienen datos de Open Food Facts, botón "Añadir a la lista" y "Añadir al menú".
- **Coste por ración:** se calcula con la cantidad realmente usada; aparte se muestra el coste de compra (envases completos), porque no es lo mismo usar 200 g que comprar 1 kg.
- **API:** `POST /api/recipes/extract` (texto, URL o imagen), `POST /api/recipes/generate` (ingredientes, raciones, tiempo, dieta), `GET /api/recipes/:id/cost?postal_code=`.
- **Aceptación:** una receta pegada de 10 ingredientes se extrae con al menos 9 emparejados correctamente en el conjunto de prueba; si la URL tiene `schema.org/Recipe`, no se llama a la IA; un plato generado respeta alérgenos y dieta del perfil en el 100% de los casos de prueba.

### F3 y F4. Menú semanal por presupuesto y aprovechamiento

- **Flujo:** el usuario elige días y comidas a cubrir, personas, presupuesto y si quiere priorizar "ahorro", "variedad" o "aprovechamiento"; puede fijar platos que quiere sí o sí; el sistema propone el menú, y cada hueco se puede cambiar, bloquear o regenerar.
- **Resultado:** coste total, coste por persona y día, número de productos distintos a comprar, desperdicio estimado en euros y ahorro frente a un menú elegido solo por gusto; botón "Generar lista" que pasa a F1 ya agrupada.
- **Modelo de optimización:** con x\_{r,s} = 1 si el plato r va en el hueco s, n\_g envases comprados del ingrediente g de tamaño p\_g y precio c\_g (el más barato en las tiendas elegidas), q\_{g,r} la cantidad por ración y σ\_s las raciones del hueco:

```latex
\min \sum_{g} \left( c_g\, n_g + \lambda\, w_g \right) \quad \text{s.a.} \quad \sum_{r} x_{r,s} = 1 \;\; \forall s, \qquad w_g = n_g\, p_g - \sum_{r,s} q_{g,r}\, \sigma_s\, x_{r,s} \ge 0, \qquad \sum_{g} c_g\, n_g \le B
```

w\_g es el sobrante (desperdicio), λ el peso del desperdicio (0 en modo "ahorro" puro), B el presupuesto. Restricciones extra: un plato no se repite más de dos veces por semana, alérgenos excluidos, platos fijados. Se resuelve con OR-Tools (CP-SAT) en menos de 3 s para 14 huecos y 200 platos candidatos.

- **Despensa manual en el MVP:** el usuario puede indicar lo que ya tiene; esas cantidades se restan antes de calcular n\_g. En v2 la despensa se alimentará con tickets (F7).
- **API:** `POST /api/menu/plan`, `POST /api/menu/:id/swap`, `POST /api/menu/:id/to-list`.
- **Aceptación:** el menú nunca supera el presupuesto si existe solución; si no existe, se explica qué restricción lo impide; en el conjunto de prueba, el modo "aprovechamiento" reduce el número de productos distintos al menos un 20% frente a "variedad".

### F5. Modo tienda

- **Flujo:** tras comparar, el usuario elige tienda; se descarga la lista de esa tienda con sus productos y precios; vista por secciones, marcar como cogido, anotar el precio real si difiere.
- **Sin conexión:** todo se guarda en IndexedDB; los precios anotados se envían como `price_observation` al recuperar la conexión.
- **Aceptación:** con el modo avión activado, la lista abre, se marca y conserva los cambios tras cerrar y reabrir la app.

## Plan de implementación por hitos

Ocho hitos en orden; Claude Code no empieza un hito sin que el anterior pase sus tests y sin un resumen de lo hecho. Cada hito termina con una demo ejecutable en local.

**H0. Base del proyecto**

- [ ] Monorepo con `apps/web`, `packages/core`, `packages/menu` e `ingest`; lint, formato y CI en GitHub Actions
- [ ] Proyecto Supabase, migraciones iniciales del modelo de datos y Row Level Security
- [ ] Variables de entorno documentadas en `.env.example`, sin secretos en el repositorio

**H1. Ingesta de precios**

- [ ] Conector de Mercadona por almacén y tabla `postal_code_zone` para las 5 ciudades
- [ ] Conectores de Carrefour, Dia y Alcampo con la misma interfaz (`fetch_catalog`, `fetch_prices`)
- [ ] Tests de contrato con respuestas grabadas; alerta si cae el número de productos más de un 20%
- [ ] Cron diario, límite de peticiones por cadena y User-Agent identificado

**H2. Normalización y emparejamiento**

- [ ] Parser de formato y precio por unidad con tests de 200 casos reales
- [ ] Taxonomía canónica y clasificador por lotes con LLM
- [ ] Candidatos por embeddings y verificación con LLM; cola de revisión manual
- [ ] Conjunto de referencia de 500 pares; informe de precisión por nivel (objetivo: 95%)

**H3. Armazón PWA**

- [ ] Manifest, iconos, service worker con precarga, pantalla de instalación para iOS y botón para Android
- [ ] IndexedDB con cola de sincronización; prueba en modo avión
- [ ] Primer uso y perfil del hogar; autenticación con enlace por correo

**H4. F1 Lista y comparador**

- [ ] `list/parse` con salida JSON validada y reintento ante esquema inválido
- [ ] Motor de cesta en `packages/core`: envases, promociones, tienda única y 2 tiendas
- [ ] Pantalla de resultado con fecha y nivel de equivalencia por línea

**H5. F2 Creación de platos**

- [ ] Formulario manual, extracción desde texto, URL (`schema.org/Recipe` primero) e imagen
- [ ] Generación por IA respetando perfil y precios de la semana
- [ ] Coste por ración y coste de compra por cadena; nutrición desde Open Food Facts

**H6. F3 y F4 Menú**

- [ ] Modelo CP-SAT con los tres modos (ahorro, variedad, aprovechamiento) y despensa manual
- [ ] Pantalla de menú con bloquear, cambiar y regenerar huecos; métricas de desperdicio y ahorro
- [ ] Conversión del menú en lista agrupada

**H7. F5 Modo tienda y cierre del MVP**

- [ ] Lista por secciones sin conexión, marcado y precio observado
- [ ] Pruebas Playwright de todos los criterios de aceptación en móvil emulado
- [ ] Páginas legales (aviso legal, privacidad, cookies) y página de metodología de precios

## Reglas de trabajo para Claude Code

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

## Fuentes

Competencia

- [Samsung Food en App Store: funciones y versión de pago](https://apps.apple.com/br/app/id1133637674)
- [Samsung Newsroom: Food List, visión por IA y planes según despensa](https://news.samsung.com/us/?p=74058)
- [Plan to Eat: análisis de Samsung Food](https://www.plantoeat.com/?p=9210)
- [Plan to Eat: comparativa con Mealime](https://www.plantoeat.com/?p=37293)
- [Plan to Eat: análisis de Eat This Much](https://www.plantoeat.com/blog/2023/10/eat-this-much-app-review-pros-and-cons/)
- [Fitia: comparativa Fitia, Mealime y Eat This Much](https://fitia.app/en/learn/article/top-3-meal-planning-apps-compared/)
- [RadarSuper](https://radarsuper.com/)
- [Applesfera: SoySuper](https://www.applesfera.com/aplicaciones-ios/comienza-operacion-despensa-para-vuelta-al-cole-esta-app-para-iphone-he-ahorrado-monton-a-hora-hacer-compra)

PWA en iOS

- [Monterail: PWA en iOS, actualizado en junio de 2026](https://www.monterail.com/blog/pwa-for-apple-ios)
- [MagicBell: limitaciones de PWA en iOS y Safari](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [WebScraft: notificaciones push en PWA de iOS en 2026](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=es)
- [Applesfera: las web apps siguen en iOS 17.4 en la UE](https://www.applesfera.com/aplicaciones-ios-1/websapp-siguen-disponibles-ios-17-4-pese-a-amenaza-apple-eliminarlas-miedo-a-ue-ha-funcionado)

Documento base

- [Comparador de supermercados en España: viabilidad y plan](https://claude.ai/code/artifact/c85aa130-de58-41a0-adbd-99e208e26cec)
