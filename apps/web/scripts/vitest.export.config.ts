import path from "node:path";
import { defineConfig } from "vitest/config";

/** Solo para scripts/export-menu-fixture.export.ts (necesita DATABASE_URL con la muestra). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../src") } },
  test: { include: ["scripts/*.export.ts"], environment: "node", testTimeout: 120_000 },
});
