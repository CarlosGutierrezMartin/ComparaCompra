import { expect, test } from "@playwright/test";
import recetas from "../../../packages/core/src/data/test/recetas.json";
import { expectAccessible, onboard, waitForServiceWorker } from "./helpers";

const LENTEJAS = recetas.recetas[0]?.texto ?? "";

test("F2: receta pegada, ingredientes, coste por ración y a la lista", async ({ page }) => {
  await onboard(page);
  await page.goto("/platos");
  await expect(page.getByText("Aún no tienes platos")).toBeVisible();
  await page.getByRole("link", { name: "Nuevo plato" }).click();
  await expect(page).toHaveURL(/\/platos\/nuevo$/);

  await page.getByRole("tab", { name: "Pegar texto" }).click();
  await page.getByLabel("Pega la receta").fill(LENTEJAS);
  await page.getByRole("button", { name: "Interpretar" }).click();

  // Al menos 9 de 10 ingredientes identificados.
  const rows = page.getByTestId("ingredient-row");
  await expect(rows).toHaveCount(10);
  const unmatched = await rows.filter({ hasText: "Sin identificar" }).count();
  expect(unmatched).toBeLessThanOrEqual(1);
  await expect(page.getByLabel("Nombre del plato")).toHaveValue("Lentejas con verduras");
  await expect(page.getByLabel("Raciones")).toHaveValue("4");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Guardar plato" }).click();
  await expect(page).toHaveURL(/\/platos\/plato\?id=/);
  await expect(page.getByRole("heading", { name: "Lentejas con verduras" })).toBeVisible();

  // Escalar raciones cambia las cantidades.
  await expect(page.getByText("300 g")).toBeVisible();
  await page.getByRole("button", { name: "Menos raciones" }).click();
  await page.getByRole("button", { name: "Menos raciones" }).click();
  await expect(page.getByTestId("servings")).toHaveText("2");
  await expect(page.getByText("150 g")).toBeVisible();

  // Coste por ración y de compra por cadena, con la fecha de los precios.
  const response = page.waitForResponse("**/api/recipes/cost");
  await page.getByRole("button", { name: "Calcular coste" }).click();
  expect((await response).ok()).toBe(true);
  const chains = page.getByTestId("chain-cost");
  await expect(chains.first()).toBeVisible();
  await expect(chains.first()).toContainText("por ración");
  await expect(chains.first()).toContainText("comprando envases enteros");
  await expect(chains.first()).toContainText("Precio más antiguo");
  await expect(page.getByTestId("per-serving").first()).toHaveText(/\d+,\d{2} €/);
  // Sin EAN en los listados de las cadenas no hay nutrición: se dice, no se inventa.
  await expect(page.getByTestId("nutrition-none").first()).toBeAttached();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Añadir a la lista" }).click();
  await expect(page.getByText(/ingredientes añadidos a la lista/)).toBeVisible();
  await page.goto("/lista");
  await expect(page.getByTestId("list-item")).toHaveCount(10);
  await expect(page.getByTestId("list-item").filter({ hasText: "lentejas" }).first()).toContainText(
    "150 g",
  );
});

test("F2: alta manual con autocompletado y edición sin conexión", async ({ page, context }) => {
  await onboard(page);
  await waitForServiceWorker(page);
  await page.goto("/platos/nuevo");
  await page.getByLabel("Nombre del plato").fill("Tortilla de patatas");
  const name = page.getByLabel("Ingrediente", { exact: true }).first();
  await name.fill("Patata");
  await name.blur();
  await page.getByLabel("Cantidad", { exact: true }).first().fill("600");
  await expect(page.getByTestId("ingredient-row").first()).toContainText("→ Patata");
  await page.getByRole("button", { name: "Añadir ingrediente" }).click();
  const second = page.getByLabel("Ingrediente", { exact: true }).nth(1);
  await second.fill("Huevos");
  await second.blur();
  await page.getByLabel("Cantidad", { exact: true }).nth(1).fill("6");
  await expect(page.getByLabel("Unidad", { exact: true }).nth(1)).toHaveValue("unit");
  await page.getByRole("button", { name: "Guardar plato" }).click();
  await expect(page.getByRole("heading", { name: "Tortilla de patatas" })).toBeVisible();
  const url = page.url();

  // En modo avión el plato sigue disponible: está en el móvil.
  await context.setOffline(true);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tortilla de patatas" })).toBeVisible();
  await expect(page.getByText("6 ud.")).toBeVisible();
  await page.getByRole("button", { name: "Calcular coste" }).click();
  await expect(page.getByText("Necesitas conexión para calcular el coste")).toBeVisible();
  await context.setOffline(false);
});
