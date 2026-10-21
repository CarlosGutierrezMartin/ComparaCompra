import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.DEMO_PORT ?? 4100);

/**
 * Pruebas de la demo estática (GitHub Pages) en móvil emulado: se sirve `out/` bajo
 * /ComparaCompra/ con un servidor de ficheros, como Pages. Antes: `pnpm build:demo`
 * con NEXT_PUBLIC_BASE_PATH=/ComparaCompra.
 */
export default defineConfig({
  testDir: "./e2e-demo",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/ComparaCompra/`,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "movil", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `node scripts/serve-demo.mjs ${PORT}`,
    url: `http://localhost:${PORT}/ComparaCompra/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
