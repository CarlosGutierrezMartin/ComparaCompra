import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, onboard, waitForServiceWorker } from "./helpers";

async function pendingOps(page: Page, table: string): Promise<number> {
  return page.evaluate(
    (t) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("comparacompra");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("syncQueue", "readonly");
          const all = tx.objectStore("syncQueue").getAll();
          all.onsuccess = () =>
            resolve((all.result as { table: string }[]).filter((o) => o.table === t).length);
          all.onerror = () => reject(all.error);
        };
      }),
    table,
  );
}

test("F5: modo tienda sin conexión; lo marcado se conserva al cerrar y reabrir", async ({
  page,
  context,
}) => {
  await onboard(page);
  await waitForServiceWorker(page);
  await page
    .getByLabel("Escribe o dicta tu lista")
    .fill(
      "1 kg de arroz redondo\n6 huevos\nleche semidesnatada\nplátanos\naceite de oliva virgen extra\nazafrán en hebras de La Mancha",
    );
  await page.getByRole("button", { name: "Añadir a la lista" }).click();
  await expect(page.getByTestId("list-item")).toHaveCount(6);
  await page.getByRole("button", { name: "Comparar precios" }).click();
  await expect(page.getByTestId("best-single")).toBeVisible();
  await page
    .getByRole("button", { name: /^Ir a comprar a / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/tienda$/);
  const items = page.getByTestId("store-item");
  await expect(items).toHaveCount(6);
  // Agrupada por sección (pasillos).
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expectAccessible(page);

  // Modo avión: se marca y se anota un precio.
  await context.setOffline(true);
  await page.reload();
  await expect(items).toHaveCount(6);
  await expect(page.getByText("Sin conexión: todo se guarda en el móvil.")).toBeVisible();
  const firstPriced = items
    .filter({ has: page.getByRole("button", { name: "Precio real" }) })
    .first();
  const pricedName = (await firstPriced.locator(".font-medium").first().innerText()).trim();
  const priced = items.filter({ hasText: pricedName }).first();
  // Casillas controladas por IndexedDB: se pulsa y se espera al estado guardado.
  await priced.getByRole("checkbox").click();
  await expect(priced.getByRole("checkbox")).toBeChecked();
  await items.nth(5).getByRole("checkbox").click();
  await expect(items.nth(5).getByRole("checkbox")).toBeChecked();
  await priced.getByRole("button", { name: "Precio real" }).click();
  await priced.getByRole("textbox").fill("1,23");
  await priced.getByRole("button", { name: "Guardar" }).click();
  await expect(priced.getByTestId("observed-price")).toHaveText("Visto en tienda: 1,23 €");
  await expect(page.getByTestId("store-progress")).toHaveText("2 de 6 cogidos");
  expect(await pendingOps(page, "price_observation")).toBe(1);

  // Se cierra la app y se vuelve a abrir, todavía sin conexión.
  await page.close();
  const again = await context.newPage();
  await again.goto("/tienda");
  await expect(again.getByTestId("store-progress")).toHaveText("2 de 6 cogidos");
  const row = again.getByTestId("store-item").filter({ hasText: pricedName }).first();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(row.getByTestId("observed-price")).toHaveText("Visto en tienda: 1,23 €");
  // Desmarcar también se conserva.
  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await again.reload();
  await expect(again.getByTestId("store-progress")).toHaveText("1 de 6 cogidos");
  await context.setOffline(false);
});

test("páginas legales y de metodología", async ({ page }) => {
  await onboard(page);
  for (const [path, title] of [
    ["/legal/aviso-legal", "Aviso legal"],
    ["/legal/privacidad", "Política de privacidad"],
    ["/legal/cookies", "Política de cookies"],
    ["/metodologia", "Cómo calculamos los precios"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectAccessible(page);
  }
  await page.goto("/perfil");
  await page.getByRole("link", { name: "Cómo calculamos los precios" }).click();
  await expect(page).toHaveURL(/\/metodologia$/);
});
