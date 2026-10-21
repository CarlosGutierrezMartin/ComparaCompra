"use client";

import {
  compareBasket,
  costRecipe,
  recipeViolations,
  scaleIngredients,
  type BasketLine,
  type RecipeCostIngredient,
} from "@comparacompra/core";
import type highsLoader from "highs";
import { adaptHighs } from "@comparacompra/menu/highs-adapter";
import { ingredientKey, planMenu, type Solver } from "@comparacompra/menu/plan";
import { RECETARIO } from "@comparacompra/menu/recetario";
import type { MenuRecipe, PackOption } from "@comparacompra/menu/types";
import type { CompareRequest } from "./api-types";
import type { CompareResponse } from "./compare";
import { withBase } from "./demo";
import {
  demoOffersForIngredient,
  demoOffersForLine,
  demoUnitWeights,
  loadDemoCatalog,
} from "./demo-catalog";
import type { PlanResponse } from "./menu";
import type { PlanRequest } from "./menu-types";
import type { CostRequest } from "./recipe-types";
import type { CostResponse } from "./recipes";

/**
 * Las rutas /api calculadas en el móvil para la demo sin servidor. Mismos contratos y
 * mismas funciones puras (packages/core y packages/menu) que el servidor.
 */

export async function demoCompare(req: CompareRequest): Promise<CompareResponse> {
  const started = performance.now();
  const cat = await loadDemoCatalog();
  const lines: BasketLine[] = req.lines.map((l) => ({
    id: l.id,
    label: l.label,
    quantity: l.quantity,
    unit: l.unit,
    packs: l.packs ?? null,
    offers: demoOffersForLine(cat, l, req.postalCode, req.chains),
  }));
  const result = compareBasket(lines, {
    chains: req.chains,
    maxStores: req.maxStores,
    fixedCostPerStore: req.fixedCostPerStore,
  });
  return {
    ...result,
    offers: Object.fromEntries(lines.map((l) => [l.id, l.offers])),
    elapsedMs: Math.round(performance.now() - started),
  };
}

export async function demoRecipeCost(req: CostRequest): Promise<CostResponse> {
  const cat = await loadDemoCatalog();
  const scaled = scaleIngredients(req.ingredients, req.servings, req.targetServings);
  const leaves = [...new Set(scaled.map((i) => i.leafSlug).filter((s): s is string => Boolean(s)))];
  const weights = demoUnitWeights(cat, leaves);
  const ingredients: RecipeCostIngredient[] = scaled.map((i, idx) => ({
    id: String(idx),
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    optional: i.optional,
    offers: demoOffersForIngredient(cat, i, req.postalCode, req.chains),
    unitWeightG: i.leafSlug ? (weights[i.leafSlug] ?? null) : null,
  }));
  const chains = costRecipe(ingredients, req.targetServings, req.chains);
  return {
    chains,
    unitWeights: Object.fromEntries(
      Object.entries(weights).map(([leaf, grams]) => [leaf, { grams, chains: [] }]),
    ),
    // Sin EAN en el catálogo no hay datos de Open Food Facts: la ficha dice "Sin datos".
    nutrition: Object.fromEntries(chains.map((c) => [c.chain, { perServing: null, sources: [] }])),
  };
}

let solver: Promise<Solver> | null = null;

/** HiGHS servido como fichero estático (public/highs), sin pasar por el empaquetador. */
function loadBrowserSolver(): Promise<Solver> {
  solver ??= import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ withBase("/highs/highs.mjs")
  ).then(async (mod: { default: typeof highsLoader }) =>
    adaptHighs(await mod.default({ locateFile: (file: string) => withBase(`/highs/${file}`) })),
  );
  solver.catch(() => {
    solver = null;
  });
  return solver;
}

export async function demoPlan(req: PlanRequest): Promise<PlanResponse> {
  const started = performance.now();
  const fixed = new Set(req.slots.map((s) => s.fixedRecipeId).filter(Boolean));
  const all: MenuRecipe[] = [...req.recipes, ...(req.includeBase ? RECETARIO : [])];
  const excluded: PlanResponse["excluded"] = [];
  const candidates = all.filter((r) => {
    const violations = recipeViolations(
      r.ingredients.filter((i) => !i.optional),
      req.diet,
      req.allergens,
    );
    if (!violations.length || fixed.has(r.id)) return true;
    excluded.push({
      recipeId: r.id,
      title: r.title,
      reasons: violations.map((v) => `${v.ingredient}: ${v.reason}`),
    });
    return false;
  });
  const [cat, highs] = await Promise.all([loadDemoCatalog(), loadBrowserSolver()]);
  const packs: Record<string, PackOption[]> = {};
  const leaves = new Set<string>();
  for (const r of candidates) {
    for (const ing of r.ingredients) {
      const key = ingredientKey(ing);
      if (!key || ing.optional || packs[key] || !ing.leafSlug) continue;
      leaves.add(ing.leafSlug);
      packs[key] = demoOffersForIngredient(cat, ing, req.postalCode, req.chains)
        .filter((o) => o.quantity !== null && o.quantity > 0 && o.unit !== null)
        .map((o) => ({
          productId: o.productId,
          chain: o.chain,
          name: o.name,
          price: o.price,
          content: (o.quantity ?? 0) * o.unitsPerPack,
          unit: o.unit ?? "g",
          url: o.url,
          priceDate: o.priceDate,
        }));
    }
  }
  const pantry = req.pantry.flatMap((p) => {
    const key = ingredientKey(p);
    return key ? [{ key, quantity: p.quantity, unit: p.unit }] : [];
  });
  // Deja pintar el "Calculando…" antes de que el cálculo ocupe el hilo principal.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const result = planMenu(highs, {
    slots: req.slots,
    recipes: candidates,
    packs,
    unitWeights: demoUnitWeights(cat, [...leaves]),
    pantry,
    budget: req.budget,
    mode: req.mode,
  });
  const used = new Set(Object.values(result.assignments));
  return {
    ...result,
    recipes: candidates.filter((r) => used.has(r.id)),
    excluded,
    elapsedMs: Math.round(performance.now() - started),
  };
}
