import { expect, test } from "@playwright/test";
import { expectAccessible, onboard } from "./helpers";

const LISTA_20 = [
  "2 docenas de huevos",
  "6 litros de leche semidesnatada",
  "1 kg de arroz redondo",
  "aceite de oliva virgen extra",
  "tomate frito",
  "3 latas de atún",
  "pechuga de pollo para 4",
  "1 kg de patatas",
  "cebollas",
  "zanahorias",
  "garbanzos cocidos",
  "lentejas",
  "macarrones",
  "queso rallado",
  "yogur natural",
  "pan de molde",
  "mantequilla",
  "nata para cocinar",
  "plátanos",
  "azafrán en hebras de La Mancha",
].join("\n");

function euros(text: string): number {
  const m = /(-?[\d.]+,\d{2})\s*€/.exec(text);
  if (!m?.[1]) throw new Error(`Sin importe en: ${text}`);
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

test("F1: lista de 20 líneas, comparación y totales", async ({ page }) => {
  await onboard(page);

  // Interpretación de 20 líneas en menos de 4 s.
  await page.getByLabel("Escribe o dicta tu lista").fill(LISTA_20);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Añadir a la lista" }).click();
  await expect(page.getByTestId("list-item")).toHaveCount(20);
  expect(Date.now() - t0).toBeLessThan(4000);
  await expect(page.getByTestId("list-item").filter({ hasText: "huevos" }).first()).toContainText(
    "24 ud.",
  );

  // Comparación en menos de 800 ms.
  const responsePromise = page.waitForResponse("**/api/basket/compare");
  const t1 = Date.now();
  await page.getByRole("button", { name: "Comparar precios" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect(Date.now() - t1).toBeLessThan(800);
  const body = await response.json();
  expect(body.elapsedMs).toBeLessThan(800);

  // Mejor tienda única con cobertura, y la línea sin precio sigue visible como no disponible.
  await expect(page.getByTestId("best-single")).toContainText("de 20 productos");
  await expect(page.getByTestId("unavailable")).toContainText("azafrán");

  // El total cuadra con la suma de las líneas mostradas.
  const totalText = await page.getByTestId("best-single").innerText();
  const total = euros(totalText.split("·")[1] ?? "");
  const costs = await page.getByTestId("line-cost").allInnerTexts();
  expect(costs.length).toBeGreaterThan(10);
  const sum = costs.reduce((s, txt) => s + euros(txt), 0);
  expect(Math.abs(sum - total)).toBeLessThan(0.011);

  // Cada línea muestra la fecha del precio y el nivel de equivalencia.
  const first = page.getByTestId("result-line").first();
  await expect(first).toContainText("Precio del");
  await expect(first).toContainText(/Equivalente|Idéntico|Genérico/);
  await expectAccessible(page);
  await page.screenshot({ path: "test-results/lista-resultado.png", fullPage: true });
});

test("F1: sin conexión la lista se interpreta en el móvil y avisa de que no puede comparar", async ({
  page,
  context,
}) => {
  await onboard(page);
  await context.setOffline(true);
  await page.getByLabel("Escribe o dicta tu lista").fill("leche, huevos");
  await page.getByRole("button", { name: "Añadir a la lista" }).click();
  await expect(page.getByTestId("list-item")).toHaveCount(2);
  await expect(
    page.getByRole("status").filter({ hasText: "interpretada en el móvil" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comparar precios" }).click();
  await expect(page.getByText("Necesitas conexión para comparar precios")).toBeVisible();
  await context.setOffline(false);
});
