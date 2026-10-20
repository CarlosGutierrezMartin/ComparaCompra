import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function onboard(page: Page, postalCode = "28001") {
  await page.goto("/bienvenida");
  await page.getByLabel("Código postal").fill(postalCode);
  await page.getByLabel("Personas en casa").fill("3");
  await page.getByRole("button", { name: "Guardar y empezar" }).click();
  await expect(page).toHaveURL(/\/lista$/);
}

/** Espera a que el service worker controle la página y haya precargado el armazón. */
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active) && navigator.serviceWorker.controller !== null;
  });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      if (await cache.match("/lista", { ignoreSearch: true })) return true;
    }
    return false;
  });
}

/** Comprobación automática de accesibilidad (WCAG 2.1 AA). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
