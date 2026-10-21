import { readFileSync } from "node:fs";
import { parseList } from "@comparacompra/core";
import { RECETARIO } from "@comparacompra/menu";
import { expect, it, vi } from "vitest";

/**
 * Comprueba que el catálogo de la demo (filtrado en el móvil) da los mismos productos,
 * precios y fechas que las consultas SQL del servidor. Necesita DATABASE_URL y el JSON de
 * `cli.py export-demo` en DEMO_CATALOG:
 *   pnpm --filter web exec vitest run --config scripts/vitest.export.config.ts scripts/demo-parity.export.ts
 */
import {
  demoOffersForIngredient,
  demoOffersForLine,
  demoUnitWeights,
  type DemoCatalog,
} from "@/lib/demo-catalog";

vi.mock("server-only", () => ({}));

it("paridad servidor / demo", async () => {
  const { offersForLine, offersForIngredient, unitWeightsForLeaves } =
    await import("@/server/catalog");
  const cat = JSON.parse(
    readFileSync(process.env.DEMO_CATALOG ?? "public/demo/catalogo.json", "utf8"),
  ) as DemoCatalog;
  const chains = ["mercadona", "dia", "alcampo", "carrefour"];
  const text =
    "2 docenas de huevos\n6 litros de leche semidesnatada\n1 kg de arroz redondo\naceite de oliva virgen extra\ntomate frito\n3 latas de atún\npechuga de pollo para 4\n1 kg de patatas\ncebollas\nzanahorias\ngarbanzos cocidos\nlentejas\nmacarrones\nqueso rallado\nyogur natural\npan de molde\nmantequilla\nnata para cocinar\nplátanos\nleche sin lactosa\nleche entera\ncerveza\nagua mineral\ncafé molido\nmanzanas golden";
  let checked = 0;
  for (const pc of ["28001", "28030", "28055", "08001"]) {
    for (const l of parseList(text)) {
      for (const level of ["equivalent", "generic"] as const) {
        const line = {
          id: "x",
          label: l.label,
          leafSlug: l.leafSlug,
          variant: l.variant,
          flags: l.flags,
          level,
          quantity: null,
          unit: null,
        };
        const a = (await offersForLine(line, pc, chains))
          .map((o) => `${o.productId}:${o.price}:${o.priceDate}:${o.identicalCanonicalId}`)
          .sort();
        const b = demoOffersForLine(cat, line, pc, chains)
          .map((o) => `${o.productId}:${o.price}:${o.priceDate}:${o.identicalCanonicalId}`)
          .sort();
        expect(b, `${pc} ${level} ${l.raw}`).toEqual(a);
        checked += a.length;
      }
    }
  }
  const leaves = new Set<string>();
  for (const r of RECETARIO)
    for (const i of r.ingredients) {
      if (i.leafSlug) leaves.add(i.leafSlug);
      const a = (await offersForIngredient(i, "28001", chains))
        .map((o) => `${o.productId}:${o.level}`)
        .sort();
      const b = demoOffersForIngredient(cat, i, "28001", chains)
        .map((o) => `${o.productId}:${o.level}`)
        .sort();
      expect(b, i.name).toEqual(a);
      checked += a.length;
    }
  const w = await unitWeightsForLeaves([...leaves]);
  expect(demoUnitWeights(cat, [...leaves])).toEqual(
    Object.fromEntries([...w].map(([k, v]) => [k, v.grams])),
  );
  // Idénticos: los primeros 60 canónicos idénticos del catálogo.
  const ids = [
    ...new Set(cat.products.flatMap((p) => p.links.filter((l) => l[0] === "i").map((l) => l[1]))),
  ].slice(0, 60);
  for (const id of ids) {
    const line = {
      id: "x",
      label: "x",
      leafSlug: null,
      variant: null,
      flags: [],
      level: "identical" as const,
      identicalCanonicalId: id,
      quantity: null,
      unit: null,
    };
    const a = (await offersForLine(line, "28001", chains)).map((o) => o.productId).sort();
    const b = demoOffersForLine(cat, line, "28001", chains)
      .map((o) => o.productId)
      .sort();
    expect(b, `idéntico ${id}`).toEqual(a);
  }
  expect(checked).toBeGreaterThan(1000);
}, 120_000);
