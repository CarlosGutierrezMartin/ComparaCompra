import { expect, test, type Page } from "@playwright/test";

// Registro de los eventos de conexión de cada página: si una navegación sin conexión acaba
// en otra página, la salida de la prueba dice qué evento llegó y cuándo.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const type of ["online", "offline"]) {
      window.addEventListener(type, () =>
        console.log(`[conexión] ${type} en ${location.pathname}`),
      );
    }
  });
  page.on("console", (msg) => {
    if (msg.text().startsWith("[conexión]")) console.log(msg.text());
  });
});

/** Rutas relativas a la base (/ComparaCompra/); el export estático usa barra final. */
async function onboard(page: Page) {
  await page.goto("bienvenida/");
  await page.getByLabel("Código postal").fill("28001");
  await page.getByLabel("Personas en casa").fill("2");
  await page.getByRole("button", { name: "Guardar y empezar" }).click();
  await expect(page).toHaveURL(/\/ComparaCompra\/lista\/$/);
}

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active) && navigator.serviceWorker.controller !== null;
  });
  // El catálogo y el optimizador se precargan con la app.
  await page.waitForFunction(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
      if (
        urls.includes("/ComparaCompra/demo/catalogo.json") &&
        urls.includes("/ComparaCompra/highs/highs.wasm")
      )
        return true;
    }
    return false;
  });
}

test("la demo se instala: manifiesto y service worker bajo /ComparaCompra/", async ({ page }) => {
  await page.goto("./");
  const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifest).toBe("/ComparaCompra/manifest.webmanifest");
  const res = await page.request.get(manifest ?? "");
  const data = await res.json();
  expect(data.start_url).toBe("/ComparaCompra/");
  expect(data.scope).toBe("/ComparaCompra/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await onboard(page);
  await waitForServiceWorker(page);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/ComparaCompra/");
});

test("comparar, ir a la tienda y calcular el coste de un plato, todo sin servidor", async ({
  page,
}) => {
  await onboard(page);
  await expect(page.getByText(/Demo: precios reales de una muestra/)).toBeVisible();
  await page
    .getByLabel("Escribe o dicta tu lista")
    .fill("2 docenas de huevos\nleche semidesnatada\n1 kg de arroz redondo\nazafrán en hebras");
  await page.getByRole("button", { name: "Añadir a la lista" }).click();
  await expect(page.getByTestId("list-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Comparar precios" }).click();
  await expect(page.getByTestId("best-single")).toContainText("de 4 productos");
  await expect(page.getByTestId("unavailable")).toContainText("azafrán");
  await page
    .getByRole("button", { name: /^Ir a comprar a / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/tienda\/$/);
  await expect(page.getByTestId("store-item")).toHaveCount(4);

  await page.goto("platos/nuevo/");
  await expect(page.getByRole("tab")).toHaveText(["Escribir", "Pegar texto"]);
  await page.getByRole("tab", { name: "Pegar texto" }).click();
  await page
    .getByLabel("Pega la receta")
    .fill(
      "Tortilla\nPara 4 personas\nIngredientes:\n- 6 huevos\n- 800 g de patatas\n- 1 cebolla\n- sal al gusto",
    );
  await page.getByRole("button", { name: "Interpretar" }).click();
  await page.getByRole("button", { name: "Guardar plato" }).click();
  await page.getByRole("button", { name: "Calcular coste" }).click();
  await expect(page.getByTestId("per-serving").first()).toHaveText(/\d+,\d{2} €/);
});

test("el menú se calcula en el móvil y todo funciona en modo avión", async ({ page, context }) => {
  await onboard(page);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto("menu/");
  await page.getByRole("button", { name: "Proponer menú" }).click();
  await expect(page.getByTestId("menu-slot")).toHaveCount(14, { timeout: 30_000 });
  await expect(page.getByTestId("menu-total")).toHaveText(/\d+,\d{2} €/);
  await page.getByRole("button", { name: "Generar lista" }).click();
  await page.getByRole("link", { name: "Lista" }).click();
  await expect(page).toHaveURL(/\/lista\/$/);
  await page.getByRole("button", { name: "Comparar precios" }).click();
  await expect(page.getByTestId("best-single")).toBeVisible();
  await context.setOffline(false);
});
