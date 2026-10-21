import { expect, test } from "@playwright/test";
import { expectAccessible, onboard, waitForServiceWorker } from "./helpers";

function euros(text: string): number {
  const m = /(-?[\d.]+,\d{2})\s*€/.exec(text);
  if (!m?.[1]) throw new Error(`Sin importe en: ${text}`);
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

test("F3/F4: menú semanal, cambiar, bloquear y generar la lista", async ({ page, context }) => {
  await onboard(page);
  await waitForServiceWorker(page);
  await page.goto("/menu");
  await expect(page.getByRole("radio", { name: /Aprovechamiento/ })).toBeChecked();
  await expectAccessible(page);

  const t0 = Date.now();
  await page.getByRole("button", { name: "Proponer menú" }).click();
  await expect(page.getByTestId("menu-slot")).toHaveCount(14, { timeout: 15_000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  for (const title of await page.getByTestId("menu-slot-title").allTextContents())
    expect(title).not.toBe("Sin plato");
  const total = euros(await page.getByTestId("menu-total").innerText());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByTestId("menu-products")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("menu-waste")).toContainText("€");
  await expect(page.getByTestId("menu-savings")).toContainText("€");
  await expect(
    page.getByText(/Precios de la muestra capturada; el más antiguo es del \d{2}\/\d{2}\/\d{4}/),
  ).toBeVisible();
  await expectAccessible(page);

  // Bloquear el primer hueco y cambiar el segundo.
  const slots = page.getByTestId("menu-slot");
  const firstTitle = await slots.nth(0).getByTestId("menu-slot-title").innerText();
  await slots.nth(0).getByRole("button", { name: "Bloquear" }).click();
  await expect(slots.nth(0)).toContainText("Bloqueado");
  const secondTitle = await slots.nth(1).getByTestId("menu-slot-title").innerText();
  await slots.nth(1).getByRole("button", { name: "Cambiar" }).click();
  await expect(slots.nth(1).getByTestId("menu-slot-title")).not.toHaveText(secondTitle, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Regenerar" }).click();
  await expect(page.getByRole("button", { name: "Regenerar" })).toBeEnabled({ timeout: 15_000 });
  await expect(slots.nth(0).getByTestId("menu-slot-title")).toHaveText(firstTitle);

  // Sin conexión el menú guardado sigue ahí.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("menu-slot")).toHaveCount(14);
  await expect(page.getByText("Necesitas conexión para calcular el menú")).toBeVisible();
  await context.setOffline(false);

  await page.getByRole("button", { name: "Generar lista" }).click();
  await expect(
    page.getByText(/productos añadidos a la lista, agrupados por sección/),
  ).toBeVisible();
  await page.goto("/lista");
  expect(await page.getByTestId("list-item").count()).toBeGreaterThan(10);
});

test("F3: el presupuesto nunca se supera y, si no alcanza, se explica", async ({ page }) => {
  await onboard(page);
  await page.goto("/menu");
  await page.getByLabel("Presupuesto semanal (€)").fill("10");
  await page.getByRole("button", { name: "Proponer menú" }).click();
  await expect(page.getByTestId("menu-notice")).toContainText(
    /presupuesto de 10,00 € no alcanza: el menú más barato posible con estos platos cuesta \d+,\d{2} €/,
    {
      timeout: 15_000,
    },
  );
  const cheapest = euros(
    (await page.getByTestId("menu-notice").innerText()).split("cuesta")[1] ?? "",
  );
  const budget = Math.ceil(cheapest + 3);
  await page.getByLabel("Presupuesto semanal (€)").fill(String(budget));
  await page.getByRole("button", { name: "Proponer menú" }).click();
  await expect(page.getByTestId("menu-slot")).toHaveCount(14, { timeout: 15_000 });
  expect(euros(await page.getByTestId("menu-total").innerText())).toBeLessThanOrEqual(budget);
});

test("F2 → F3: añadir un plato propio al menú lo fija en un hueco", async ({ page }) => {
  await onboard(page);
  await page.goto("/platos/nuevo");
  await page.getByLabel("Nombre del plato").fill("Garbanzos de la abuela");
  const name = page.getByLabel("Ingrediente", { exact: true }).first();
  await name.fill("Garbanzos cocidos");
  await name.blur();
  await page.getByLabel("Cantidad", { exact: true }).first().fill("800");
  await page.getByRole("button", { name: "Guardar plato" }).click();
  await page.getByRole("link", { name: "Añadir al menú" }).click();
  await expect(page.getByText(/Elige un hueco para «Garbanzos de la abuela»/)).toBeVisible();
  await page.getByRole("button", { name: "Proponer menú" }).click();
  await expect(page.getByTestId("menu-slot")).toHaveCount(14, { timeout: 15_000 });
  await expect(
    page.getByTestId("menu-slot").filter({ hasText: "Garbanzos de la abuela" }).first(),
  ).toContainText("Bloqueado");
});
