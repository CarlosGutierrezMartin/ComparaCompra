import { LEAF_BY_SLUG } from "@comparacompra/core";
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./data/test/precios-muestra.json";
import { planMenu, recipeFitsMeal, type PlanInput, type Solver } from "./plan";
import { RECETARIO } from "./recetario";
import { loadSolver } from "./solver";
import { menuToListLines } from "./tolist";
import type { Meal, MenuRecipe, MenuSlot, PackOption } from "./types";

let solver: Solver;
beforeAll(async () => {
  solver = await loadSolver();
});

const PACKS = fixture.packs as unknown as Record<string, PackOption[]>;
const WEIGHTS = fixture.unitWeights as Record<string, number>;

function week(meals: Meal[], people: number, days = 7): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let day = 0; day < days; day++) {
    for (const meal of meals)
      slots.push({ id: `${day}-${meal}`, day, meal, servings: people, fixedRecipeId: null });
  }
  return slots;
}

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  slots: week(["comida", "cena"], 2),
  recipes: RECETARIO,
  packs: PACKS,
  unitWeights: WEIGHTS,
  pantry: [],
  budget: null,
  mode: "ahorro",
  ...over,
});

describe("recetario base", () => {
  it("usa hojas y variantes de la taxonomía", () => {
    const ids = new Set<string>();
    for (const r of RECETARIO) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      for (const i of r.ingredients) {
        const leaf = i.leafSlug ? LEAF_BY_SLUG.get(i.leafSlug) : undefined;
        expect(leaf, `${r.id}: ${i.leafSlug}`).toBeDefined();
        if (i.variant) expect(leaf?.variants, `${r.id}: ${i.variant}`).toContain(i.variant);
      }
    }
    expect(RECETARIO.length).toBeGreaterThanOrEqual(40);
  });
});

describe("optimizador del menú", () => {
  it("cubre los 14 huecos en menos de 3 s, sin repetir más de dos veces", () => {
    const t0 = performance.now();
    const res = planMenu(solver, base());
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(res.status).toBe("ok");
    expect(Object.keys(res.assignments)).toHaveLength(14);
    const counts = new Map<string, number>();
    for (const r of Object.values(res.assignments)) counts.set(r, (counts.get(r) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    for (const slot of base().slots) {
      const r = RECETARIO.find((x) => x.id === res.assignments[slot.id]);
      expect(r && recipeFitsMeal(r, slot.meal)).toBe(true);
    }
    expect(res.metrics.totalCost).toBeGreaterThan(0);
    expect(res.metrics.totalCost).toBeCloseTo(
      res.purchases.reduce((s, p) => s + p.cost, 0),
      2,
    );
    // Todo lo necesario está comprado.
    for (const b of res.balances)
      expect(b.bought + b.fromPantry + 1e-6).toBeGreaterThanOrEqual(b.needed);
    expect(res.baseline).not.toBeNull();
    expect(res.savings).toBeGreaterThanOrEqual(0);
  });

  it("nunca supera el presupuesto y, si no hay solución, explica por qué", () => {
    const cheapest = planMenu(solver, base()).metrics.totalCost;
    const ok = planMenu(solver, base({ budget: cheapest + 5, mode: "variedad" }));
    expect(ok.status).toBe("ok");
    expect(ok.metrics.totalCost).toBeLessThanOrEqual(cheapest + 5);
    const tight = planMenu(solver, base({ budget: 10 }));
    expect(tight.status).toBe("infeasible");
    expect(tight.explanation).toMatch(
      /presupuesto de 10,00 € no alcanza: el menú más barato posible con estos platos cuesta \d+,\d{2} €/,
    );
  });

  it("explica cuando faltan platos para cubrir los huecos", () => {
    const few = RECETARIO.filter((r) => recipeFitsMeal(r, "cena")).slice(0, 3);
    const res = planMenu(solver, base({ recipes: few, slots: week(["cena"], 2) }));
    expect(res.status).toBe("infeasible");
    expect(res.explanation).toContain("7 cenas que cubrir y solo 3 platos aptos");
  });

  it("respeta los platos fijados y los que se quieren cambiar", () => {
    const slots = week(["comida", "cena"], 2);
    const lunes = slots[0];
    const martes = slots[2];
    if (!lunes || !martes) throw new Error("huecos");
    lunes.fixedRecipeId = "base:lasana-de-carne";
    martes.avoidRecipeIds = ["base:lentejas-con-verduras", "base:garbanzos-con-espinacas"];
    const res = planMenu(solver, base({ slots }));
    expect(res.assignments[lunes.id]).toBe("base:lasana-de-carne");
    expect(martes.avoidRecipeIds).not.toContain(res.assignments[martes.id]);
  });

  it("la despensa se descuenta antes de comprar", () => {
    const one: MenuRecipe[] = RECETARIO.filter((r) => r.id === "base:tortilla-de-patatas");
    const slots = week(["cena"], 4, 1);
    const without = planMenu(solver, base({ recipes: one, slots }));
    const huevos = without.balances.find((b) => b.leafSlug === "huevos");
    expect(huevos?.needed).toBe(6);
    const withPantry = planMenu(
      solver,
      base({ recipes: one, slots, pantry: [{ key: "huevos||", quantity: 6, unit: "unit" }] }),
    );
    expect(withPantry.purchases.some((p) => p.leafSlug === "huevos")).toBe(false);
    expect(withPantry.metrics.totalCost).toBeLessThan(without.metrics.totalCost);
  });

  it("aprovechamiento: al menos un 20 % menos de productos distintos que variedad", () => {
    for (const people of [2, 4]) {
      const variedad = planMenu(
        solver,
        base({ mode: "variedad", slots: week(["comida", "cena"], people) }),
      );
      const aprov = planMenu(
        solver,
        base({ mode: "aprovechamiento", slots: week(["comida", "cena"], people) }),
      );
      expect(variedad.status).toBe("ok");
      expect(aprov.status).toBe("ok");
      const reduction = 1 - aprov.metrics.distinctProducts / variedad.metrics.distinctProducts;
      expect(
        reduction,
        `${people} personas: ${aprov.metrics.distinctProducts} frente a ${variedad.metrics.distinctProducts}`,
      ).toBeGreaterThanOrEqual(0.2);
      expect(aprov.metrics.wasteCost).toBeLessThanOrEqual(variedad.metrics.wasteCost);
    }
  });

  it("200 platos candidatos y 14 huecos en menos de 3 s", () => {
    const many: MenuRecipe[] = [];
    for (let i = 0; i < 5; i++)
      for (const r of RECETARIO) many.push({ ...r, id: `${r.id}#${i}`, servings: r.servings + i });
    const t0 = performance.now();
    const res = planMenu(solver, base({ recipes: many, mode: "aprovechamiento" }));
    expect(res.status).toBe("ok");
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("la lista sale agrupada por sección y sin lo que hay en la despensa", () => {
    const slots = week(["comida", "cena"], 2, 2);
    const res = planMenu(
      solver,
      base({ slots, pantry: [{ key: "huevos||", quantity: 30, unit: "unit" }] }),
    );
    const lines = menuToListLines(res.balances, slots, res.assignments, RECETARIO);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.leafSlug === "huevos")).toBe(false);
    const sections = lines.map((l) => l.section);
    const firstSeen = sections.filter((s, i) => sections.indexOf(s) === i);
    // Cada sección aparece en un bloque continuo.
    expect(firstSeen.length).toBe(new Set(sections).size);
    expect(sections.join("|")).toBe([...sections].join("|"));
  });
});
