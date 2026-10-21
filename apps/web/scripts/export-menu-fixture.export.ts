/**
 * Exporta los envases y precios reales de la muestra para los ingredientes del recetario
 * base, como fixture de las pruebas del optimizador (packages/menu). Se ejecuta con:
 *   DATABASE_URL=... pnpm --filter web exec vitest run --config scripts/vitest.export.config.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { RECETARIO } from "@comparacompra/menu";
import { it, vi } from "vitest";

vi.mock("server-only", () => ({}));

it("exporta el fixture del menú", async () => {
  const { packsForRecipes } = await import("@/server/menu-catalog");
  const data = await packsForRecipes(RECETARIO, "28001", ["mercadona", "dia", "alcampo"]);
  const out = path.resolve(__dirname, "../../../packages/menu/src/data/test/precios-muestra.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        descripcion:
          "Envases y precios reales de la muestra capturada (código postal 28001) para los ingredientes del recetario base. Generado con apps/web/scripts/export-menu-fixture.export.ts.",
        ...data,
      },
      null,
      1,
    ) + "\n",
  );
});
