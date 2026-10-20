import { expect, test } from "@playwright/test";
import { expectAccessible, onboard, waitForServiceWorker } from "./helpers";

test("el manifest permite instalar la app", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone", lang: "es" });
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.theme_color).toBeTruthy();
  expect(manifest.background_color).toBeTruthy();
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test("etiquetas para iOS", async ({ page }) => {
  await page.goto("/instalar");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
});

test("primer uso guarda el hogar y lo conserva al recargar", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expectAccessible(page);
  await onboard(page);
  await page.reload();
  await page.getByRole("link", { name: "Perfil" }).click();
  await expect(page.getByLabel("Código postal")).toHaveValue("28001");
  await expect(page.getByLabel("Personas en casa")).toHaveValue("3");
  await expectAccessible(page);
});

test("código postal sin cobertura avisa pero deja seguir", async ({ page }) => {
  await page.goto("/bienvenida");
  await page.getByLabel("Código postal").fill("08001");
  await expect(page.getByText("Aún no tenemos precios para ese código postal")).toBeVisible();
});

test("en modo avión la app abre, navega y guarda cambios en la cola", async ({ page, context }) => {
  await onboard(page);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").first()).toContainText("Sin conexión");
  await page.getByRole("link", { name: "Perfil" }).click();
  await expect(page.getByLabel("Código postal")).toHaveValue("28001");
  await page.getByLabel("Personas en casa").fill("4");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();
  // Sin servidor configurado ni conexión, los cambios esperan en la cola y sobreviven al cierre.
  await page.reload();
  await expect(page.getByLabel("Personas en casa")).toHaveValue("4");
  await expect(page.getByTestId("sync-status")).toContainText("pendiente");
  await context.setOffline(false);
});

test("en iPhone se ofrece la ayuda de instalación de Safari", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await onboard(page);
  await page.getByRole("link", { name: "Perfil" }).click();
  await page.getByRole("link", { name: "Cómo instalarla en iPhone" }).click();
  await expect(page.getByText("Añadir a pantalla de inicio")).toBeVisible();
  await context.close();
});
