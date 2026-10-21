import { formatEuro, type BaseUnit } from "@comparacompra/core";
import type { Meal, MenuMode, MenuRecipe, MenuSlot, PackOption, PantryEntry } from "./types";

/**
 * Menú semanal por presupuesto y aprovechamiento (docs/SPEC.md, F3 y F4) como programa
 * lineal entero:
 *
 *   min  Σ_g Σ_o c_o n_o + λ Σ_g ĉ_g w_g + μ Σ b_o + ρ Σ_r z_r + π Σ x·sinPrecio
 *   s.a. Σ_r x_{r,s} = 1                                  (cada hueco, un plato)
 *        Σ_o p_o n_o + u_g − Σ_{r,s} q_{g,r} σ_s x_{r,s} = w_g ≥ 0   (comprar lo que se usa)
 *        Σ_s x_{r,s} ≤ 2                                  (un plato, como mucho dos veces)
 *        Σ c_o n_o ≤ B                                    (presupuesto)
 *
 * con n_o envases de la opción o (tamaño p_o, precio c_o), u_g lo que se toma de la
 * despensa (0 ≤ u_g ≤ despensa), w_g el sobrante valorado al precio por unidad más bajo ĉ_g,
 * b_o = 1 si se compra la opción o (productos distintos) y z_r las repeticiones.
 * Por modo: ahorro (λ≈0), variedad (ρ alto) y aprovechamiento (λ = 1 y μ > 0).
 * Función pura: el solver (HiGHS) se pasa como parámetro.
 */

export interface Solver {
  solve(
    lp: string,
    options: Record<string, string | number | boolean>,
  ): { Status: string; Columns: Record<string, { Primal?: number }> };
}

export interface PlanInput {
  slots: MenuSlot[];
  recipes: MenuRecipe[];
  /** Envases disponibles por clave de ingrediente (ver ingredientKey). */
  packs: Record<string, PackOption[]>;
  /** Peso de una pieza por hoja, en gramos. */
  unitWeights: Record<string, number>;
  pantry: PantryEntry[];
  budget: number | null;
  mode: MenuMode;
  maxRepeats?: number;
  timeLimitSec?: number;
}

export interface Purchase {
  key: string;
  label: string;
  leafSlug: string;
  option: PackOption;
  packs: number;
  cost: number;
}

export interface IngredientBalance {
  key: string;
  label: string;
  leafSlug: string;
  variant: string | null;
  flags: string[];
  unit: BaseUnit;
  needed: number;
  fromPantry: number;
  bought: number;
  leftover: number;
  wasteCost: number;
}

export interface Unpriced {
  recipeId: string;
  ingredient: string;
  reason: "sin_cantidad" | "sin_precio" | "unidad_no_convertible";
}

export interface MenuMetrics {
  totalCost: number;
  costPerPersonDay: number;
  distinctProducts: number;
  wasteCost: number;
}

export interface PlanResult {
  status: "ok" | "infeasible";
  /** slotId -> recipeId */
  assignments: Record<string, string>;
  purchases: Purchase[];
  balances: IngredientBalance[];
  metrics: MenuMetrics;
  /** Menú elegido solo por gusto (variedad sin mirar precios), para medir el ahorro. */
  baseline: MenuMetrics | null;
  savings: number | null;
  unpriced: Unpriced[];
  explanation: string | null;
  optimal: boolean;
}

/**
 * Pesos por modo, en euros: cuánto "cuesta" un euro tirado (waste), un producto distinto
 * más en la compra (distinct), repetir un plato (repeat) y cuánto se premia comer un
 * ingrediente distinto más en la semana (diversity).
 */
const MODE_WEIGHTS: Record<MenuMode, Omit<Objective, "tieBreak" | "budget">> = {
  ahorro: { cost: 1, waste: 0.02, distinct: 0, repeat: 0, diversity: 0 },
  variedad: { cost: 1, waste: 0.02, distinct: 0, repeat: 8, diversity: 0.5 },
  aprovechamiento: { cost: 1, waste: 1, distinct: 1, repeat: 0, diversity: 0 },
};
/**
 * Penalización por ingrediente sin precio y ración: un plato no debe parecer barato porque
 * falte el precio de su ingrediente principal. No es un precio estimado: no se muestra ni
 * se suma al coste.
 */
const UNPRICED_PENALTY = 1.5;
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const round2 = (x: number) => Math.round(x * 100) / 100;

export function ingredientKey(i: {
  leafSlug: string | null;
  variant: string | null;
  flags: string[];
}): string | null {
  return i.leafSlug ? `${i.leafSlug}|${i.variant ?? ""}|${[...i.flags].sort().join(",")}` : null;
}

export function recipeFitsMeal(r: MenuRecipe, meal: Meal): boolean {
  return r.meals.length ? r.meals.includes(meal) : meal !== "desayuno";
}

function convert(
  q: number,
  from: BaseUnit,
  to: BaseUnit,
  unitWeight: number | undefined,
): number | null {
  if (from === to) return q;
  if (from === "unit" && to === "g" && unitWeight) return q * unitWeight;
  if (from === "g" && to === "unit" && unitWeight) return q / unitWeight;
  return null;
}

interface KeyInfo {
  key: string;
  leafSlug: string;
  variant: string | null;
  flags: string[];
  label: string;
  unit: BaseUnit;
  options: PackOption[];
  minUnitPrice: number;
  pantry: number;
}

/** Opciones de compra útiles: la más barata por unidad, la más pequeña y alguna más. */
function usefulOptions(all: PackOption[]): PackOption[] {
  const valid = all.filter((o) => o.content > 0 && o.price > 0);
  if (!valid.length) return [];
  const units = new Map<BaseUnit, number>();
  for (const o of valid) units.set(o.unit, (units.get(o.unit) ?? 0) + 1);
  const unit = [...units.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const same = valid.filter((o) => o.unit === unit);
  const byUnitPrice = [...same].sort(
    (a, b) => a.price / a.content - b.price / b.content || a.productId - b.productId,
  );
  const smallest = [...same].sort((a, b) => a.content - b.content || a.price - b.price)[0];
  const picked: PackOption[] = [];
  for (const o of [...byUnitPrice.slice(0, 3), smallest]) {
    if (
      o &&
      !picked.some((p) => p.productId === o.productId) &&
      !picked.some((p) => p.content === o.content && p.price <= o.price)
    ) {
      picked.push(o);
    }
  }
  return picked;
}

interface Prepared {
  keys: Map<string, KeyInfo>;
  /** demanda por ración: recipeId -> key -> cantidad */
  demand: Map<string, Map<string, number>>;
  unpriced: Unpriced[];
  unpricedCount: Map<string, number>;
}

function prepare(input: PlanInput): Prepared {
  const keys = new Map<string, KeyInfo>();
  const demand = new Map<string, Map<string, number>>();
  const unpriced: Unpriced[] = [];
  const unpricedCount = new Map<string, number>();
  const pantryByKey = new Map<string, PantryEntry[]>();
  for (const p of input.pantry) pantryByKey.set(p.key, [...(pantryByKey.get(p.key) ?? []), p]);

  for (const r of input.recipes) {
    const d = new Map<string, number>();
    let missing = 0;
    for (const ing of r.ingredients) {
      if (ing.optional) continue;
      const key = ingredientKey(ing);
      const miss = (reason: Unpriced["reason"]) => {
        unpriced.push({ recipeId: r.id, ingredient: ing.name, reason });
        missing += 1;
      };
      if (ing.quantity === null || ing.unit === null) {
        miss("sin_cantidad");
        continue;
      }
      if (!key || !ing.leafSlug) {
        miss("sin_precio");
        continue;
      }
      let info = keys.get(key);
      if (!info) {
        const options = usefulOptions(input.packs[key] ?? []);
        const first = options[0];
        if (!first) {
          miss("sin_precio");
          continue;
        }
        const unitWeight = input.unitWeights[ing.leafSlug];
        const pantry = (pantryByKey.get(key) ?? [])
          .map((p) => convert(p.quantity, p.unit, first.unit, unitWeight) ?? 0)
          .reduce((a, b) => a + b, 0);
        info = {
          key,
          leafSlug: ing.leafSlug,
          variant: ing.variant,
          flags: [...ing.flags].sort(),
          label: ing.name,
          unit: first.unit,
          options,
          minUnitPrice: Math.min(...options.map((o) => o.price / o.content)),
          pantry,
        };
        keys.set(key, info);
      }
      const q = convert(ing.quantity, ing.unit, info.unit, input.unitWeights[ing.leafSlug]);
      if (q === null) {
        miss("unidad_no_convertible");
        continue;
      }
      d.set(key, (d.get(key) ?? 0) + q / r.servings);
    }
    demand.set(r.id, d);
    unpricedCount.set(r.id, missing);
  }
  return { keys, demand, unpriced, unpricedCount };
}

const fmt = (v: number) => String(Number(v.toFixed(6)));

class LpBuilder {
  private objective = new Map<string, number>();
  private rows: string[] = [];
  private bounds: string[] = [];
  private generals: string[] = [];
  private binaries: string[] = [];

  addObjective(v: string, c: number) {
    if (c) this.objective.set(v, (this.objective.get(v) ?? 0) + c);
  }

  static expr(terms: [string, number][]): string {
    const parts: string[] = [];
    terms.forEach(([v, c], i) => {
      if (!c) return;
      const sign = c < 0 ? "-" : parts.length ? "+" : "";
      parts.push(`${sign} ${fmt(Math.abs(c))} ${v}`.trim());
      if (i % 12 === 11) parts.push("\n");
    });
    return parts.length ? parts.join(" ") : "0 dummy";
  }

  addRow(name: string, terms: [string, number][], op: "<=" | ">=" | "=", rhs: number) {
    this.rows.push(` ${name}: ${LpBuilder.expr(terms)} ${op} ${fmt(rhs)}`);
  }

  bound(text: string) {
    this.bounds.push(` ${text}`);
  }

  general(v: string) {
    this.generals.push(v);
  }

  binary(v: string) {
    this.binaries.push(v);
  }

  toString(): string {
    const obj = LpBuilder.expr([...this.objective.entries()]);
    return [
      "Minimize",
      ` obj: ${obj}`,
      "Subject To",
      ...this.rows,
      "Bounds",
      " dummy = 0",
      ...this.bounds,
      ...(this.generals.length ? ["General", ` ${this.generals.join(" ")}`] : []),
      ...(this.binaries.length ? ["Binary", ` ${this.binaries.join(" ")}`] : []),
      "End",
    ].join("\n");
  }
}

interface Objective {
  cost: number;
  waste: number;
  distinct: number;
  repeat: number;
  diversity: number;
  /** Desempate determinista independiente del precio (menú de referencia). */
  tieBreak: boolean;
  budget: number | null;
}

interface Model {
  lp: string;
  groups: SlotGroup[];
  /** Orden de los platos en la entrada, para desempatar el reparto. */
  order: Map<string, number>;
  x: Map<string, { recipe: string; group: number }>;
  n: Map<string, { key: string; option: PackOption }>;
  u: Map<string, string>;
}

function eligibleRecipes(input: PlanInput, slot: MenuSlot): MenuRecipe[] {
  if (slot.fixedRecipeId) return input.recipes.filter((r) => r.id === slot.fixedRecipeId);
  const avoid = new Set(slot.avoidRecipeIds ?? []);
  return input.recipes.filter((r) => recipeFitsMeal(r, slot.meal) && !avoid.has(r.id));
}

/**
 * Huecos intercambiables (misma comida, raciones, plato fijado y platos a evitar) forman un
 * grupo: el modelo decide cuántas veces va cada plato en el grupo, no en qué día. Sin esa
 * simetría (7 comidas iguales) el optimizador perdía el tiempo probando permutaciones
 * equivalentes y, con poco tiempo o un móvil lento, devolvía menús mucho peores.
 */
interface SlotGroup {
  key: string;
  slots: MenuSlot[];
  servings: number;
  recipes: MenuRecipe[];
}

function groupSlots(input: PlanInput): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  for (const slot of input.slots) {
    const avoid = [...(slot.avoidRecipeIds ?? [])].sort().join(",");
    const key = `${slot.meal}|${slot.servings}|${slot.fixedRecipeId ?? ""}|${avoid}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, slots: [], servings: slot.servings, recipes: eligibleRecipes(input, slot) };
      groups.set(key, g);
    }
    g.slots.push(slot);
  }
  for (const g of groups.values()) g.slots.sort((a, b) => a.day - b.day);
  return [...groups.values()];
}

/**
 * Reparte las veces de cada plato entre los huecos del grupo, por días: primero el plato
 * con más veces pendientes que no esté ya ese día ni en el hueco anterior del grupo.
 */
function distribute(
  groups: SlotGroup[],
  counts: Map<number, Map<string, number>>,
  order: Map<string, number>,
): Record<string, string> {
  const assignments: Record<string, string> = {};
  const byDay = new Map<number, Set<string>>();
  groups.forEach((g, gi) => {
    const left = new Map(counts.get(gi) ?? []);
    let previous: string | null = null;
    for (const slot of g.slots) {
      const taken = byDay.get(slot.day) ?? new Set<string>();
      const options = [...left.entries()]
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));
      const pick =
        options.find(([r]) => r !== previous && !taken.has(r)) ??
        options.find(([r]) => r !== previous) ??
        options[0];
      if (!pick) continue;
      const [recipe] = pick;
      assignments[slot.id] = recipe;
      left.set(recipe, (left.get(recipe) ?? 0) - 1);
      taken.add(recipe);
      byDay.set(slot.day, taken);
      previous = recipe;
    }
  });
  return assignments;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function buildModel(input: PlanInput, prep: Prepared, obj: Objective): Model {
  const lp = new LpBuilder();
  const x = new Map<string, { recipe: string; group: number }>();
  const n = new Map<string, { key: string; option: PackOption }>();
  const u = new Map<string, string>();
  const recipeIndex = new Map(input.recipes.map((r, i) => [r.id, i]));
  const keyIndex = new Map([...prep.keys.keys()].map((k, i) => [k, i]));
  const maxRepeats = input.maxRepeats ?? 2;
  const groups = groupSlots(input);

  const xByRecipe = new Map<string, string[]>();
  const demandTerms = new Map<string, [string, number][]>();
  const fixedCount = new Map<string, number>();
  for (const slot of input.slots) {
    if (slot.fixedRecipeId)
      fixedCount.set(slot.fixedRecipeId, (fixedCount.get(slot.fixedRecipeId) ?? 0) + 1);
  }

  groups.forEach((g, gi) => {
    const terms: [string, number][] = [];
    for (const r of g.recipes) {
      // x = veces que va el plato r en los huecos del grupo g.
      const v = `x${recipeIndex.get(r.id)}_${gi}`;
      const cap = Math.min(g.slots.length, Math.max(maxRepeats, fixedCount.get(r.id) ?? 0));
      x.set(v, { recipe: r.id, group: gi });
      lp.general(v);
      lp.bound(`0 <= ${v} <= ${cap}`);
      terms.push([v, 1]);
      xByRecipe.set(r.id, [...(xByRecipe.get(r.id) ?? []), v]);
      lp.addObjective(v, UNPRICED_PENALTY * g.servings * (prep.unpricedCount.get(r.id) ?? 0));
      if (obj.tieBreak) lp.addObjective(v, 0.01 * hash(`${r.id}@${g.key}`));
      for (const [key, perServing] of prep.demand.get(r.id) ?? []) {
        const qty = perServing * g.servings;
        demandTerms.set(key, [...(demandTerms.get(key) ?? []), [v, -qty]]);
        // El sobrante se resta de lo que se usa: valorar el desperdicio es Σ p n + u − demanda.
        lp.addObjective(v, -obj.waste * (prep.keys.get(key)?.minUnitPrice ?? 0) * qty);
      }
    }
    lp.addRow(`grp${gi}`, terms, "=", g.slots.length);
  });

  for (const [rid, vars] of xByRecipe) {
    const ri = recipeIndex.get(rid);
    const cap = Math.max(maxRepeats, fixedCount.get(rid) ?? 0);
    lp.addRow(
      `rep${ri}`,
      vars.map((v) => [v, 1]),
      "<=",
      cap,
    );
    if (obj.repeat) {
      const z = `z${ri}`;
      lp.addRow(`zr${ri}`, [...vars.map((v): [string, number] => [v, 1]), [z, -1]], "<=", 1);
      lp.bound(`${z} >= 0`);
      lp.addObjective(z, obj.repeat);
    }
  }

  // Cota de demanda por ingrediente (si todos los huecos eligieran el plato que más usa),
  // para acotar los envases: un modelo más ajustado se resuelve mucho antes.
  const maxDemand = new Map<string, number>();
  for (const g of groups) {
    const best = new Map<string, number>();
    for (const r of g.recipes) {
      for (const [key, q] of prep.demand.get(r.id) ?? [])
        best.set(key, Math.max(best.get(key) ?? 0, q * g.servings * g.slots.length));
    }
    for (const [key, q] of best) maxDemand.set(key, (maxDemand.get(key) ?? 0) + q);
  }

  const budgetTerms: [string, number][] = [];
  for (const [key, info] of prep.keys) {
    const ki = keyIndex.get(key);
    const terms: [string, number][] = [...(demandTerms.get(key) ?? [])];
    if (!terms.length) continue;
    info.options.forEach((o, oi) => {
      const v = `n${ki}_${oi}`;
      const maxPacks = Math.max(1, Math.ceil((maxDemand.get(key) ?? 0) / o.content));
      n.set(v, { key, option: o });
      lp.general(v);
      lp.bound(`0 <= ${v} <= ${maxPacks}`);
      terms.push([v, o.content]);
      lp.addObjective(v, obj.cost * o.price + obj.waste * info.minUnitPrice * o.content);
      budgetTerms.push([v, o.price]);
      if (obj.distinct) {
        const b = `b${ki}_${oi}`;
        lp.binary(b);
        lp.addRow(
          `bn${ki}_${oi}`,
          [
            [v, 1],
            [b, -maxPacks],
          ],
          "<=",
          0,
        );
        lp.addObjective(b, obj.distinct);
      }
    });
    if (info.pantry > 0) {
      const v = `u${ki}`;
      u.set(v, key);
      lp.bound(`0 <= ${v} <= ${fmt(info.pantry)}`);
      terms.push([v, 1]);
      lp.addObjective(v, obj.waste * info.minUnitPrice);
    }
    lp.addRow(`dem${ki}`, terms, ">=", 0);
    if (obj.diversity) {
      // y = 1 solo si algún plato elegido usa el ingrediente.
      const y = `y${ki}`;
      lp.binary(y);
      lp.addRow(
        `yd${ki}`,
        [[y, 1], ...(demandTerms.get(key) ?? []).map(([v]): [string, number] => [v, -1])],
        "<=",
        0,
      );
      lp.addObjective(y, -obj.diversity);
    }
  }
  if (obj.budget !== null && budgetTerms.length) lp.addRow("budget", budgetTerms, "<=", obj.budget);
  return { lp: lp.toString(), groups, order: recipeIndex, x, n, u };
}

interface Solution {
  assignments: Record<string, string>;
  packs: { key: string; option: PackOption; packs: number }[];
  optimal: boolean;
}

function solveModel(solver: Solver, model: Model, timeLimitSec: number): Solution | null {
  const res = solver.solve(model.lp, {
    time_limit: timeLimitSec,
    mip_rel_gap: 0.005,
    output_flag: false,
  });
  const hasSolution =
    res.Status === "Optimal" ||
    (res.Status === "Time limit reached" && Object.keys(res.Columns).length > 0);
  if (!hasSolution) return null;
  const val = (v: string) => res.Columns[v]?.Primal ?? 0;
  const counts = new Map<number, Map<string, number>>();
  for (const [v, { recipe, group }] of model.x) {
    const times = Math.round(val(v));
    if (times > 0) counts.set(group, (counts.get(group) ?? new Map()).set(recipe, times));
  }
  const assignments = distribute(model.groups, counts, model.order);
  const packs = [...model.n.entries()]
    .map(([v, { key, option }]) => ({ key, option, packs: Math.round(val(v)) }))
    .filter((p) => p.packs > 0);
  return { assignments, packs, optimal: res.Status === "Optimal" };
}

function evaluate(input: PlanInput, prep: Prepared, sol: Solution) {
  const needed = new Map<string, number>();
  for (const slot of input.slots) {
    const rid = sol.assignments[slot.id];
    if (!rid) continue;
    for (const [key, q] of prep.demand.get(rid) ?? [])
      needed.set(key, (needed.get(key) ?? 0) + q * slot.servings);
  }
  const purchases: Purchase[] = sol.packs.map((p) => {
    const info = prep.keys.get(p.key);
    return {
      key: p.key,
      label: info?.label ?? p.key,
      leafSlug: info?.leafSlug ?? "",
      option: p.option,
      packs: p.packs,
      cost: round2(p.packs * p.option.price),
    };
  });
  const balances: IngredientBalance[] = [];
  for (const [key, need] of needed) {
    const info = prep.keys.get(key);
    if (!info) continue;
    const bought = purchases
      .filter((p) => p.key === key)
      .reduce((s, p) => s + p.packs * p.option.content, 0);
    const spent = purchases.filter((p) => p.key === key).reduce((s, p) => s + p.cost, 0);
    const fromPantry = Math.min(info.pantry, need);
    const leftover = Math.max(0, bought + fromPantry - need);
    balances.push({
      key,
      label: info.label,
      leafSlug: info.leafSlug,
      variant: info.variant,
      flags: info.flags,
      unit: info.unit,
      needed: need,
      fromPantry,
      bought,
      leftover,
      wasteCost: bought > 0 ? round2((spent / bought) * Math.min(leftover, bought)) : 0,
    });
  }
  const totalCost = round2(purchases.reduce((s, p) => s + p.cost, 0));
  const days = new Set(input.slots.map((s) => s.day)).size || 1;
  const people = Math.max(1, ...input.slots.map((s) => s.servings));
  const metrics: MenuMetrics = {
    totalCost,
    costPerPersonDay: round2(totalCost / (people * days)),
    distinctProducts: purchases.length,
    wasteCost: round2(balances.reduce((s, b) => s + b.wasteCost, 0)),
  };
  return { purchases, balances, metrics };
}

const MEAL_PLURAL: Record<Meal, string> = {
  desayuno: "desayunos",
  comida: "comidas",
  cena: "cenas",
};

function explainInfeasible(
  input: PlanInput,
  solver: Solver,
  prep: Prepared,
  timeLimitSec: number,
): string {
  for (const slot of input.slots) {
    if (!eligibleRecipes(input, slot).length) {
      return slot.fixedRecipeId
        ? `El plato fijado para el ${DAY_NAMES[slot.day] ?? slot.day} (${slot.meal}) ya no está disponible.`
        : `No hay platos aptos para ${MEAL_PLURAL[slot.meal]}: añade alguno o quita ese hueco.`;
    }
  }
  if (input.budget !== null) {
    const cheapest = solveModel(
      solver,
      buildModel(input, prep, { ...MODE_WEIGHTS.ahorro, tieBreak: false, budget: null }),
      timeLimitSec,
    );
    if (cheapest) {
      const cost = evaluate(input, prep, cheapest).metrics.totalCost;
      return `El presupuesto de ${formatEuro(input.budget)} no alcanza: el menú más barato posible con estos platos cuesta ${formatEuro(cost)}.`;
    }
  }
  const maxRepeats = input.maxRepeats ?? 2;
  for (const meal of ["desayuno", "comida", "cena"] as const) {
    const slots = input.slots.filter((s) => s.meal === meal && !s.fixedRecipeId).length;
    const recipes = input.recipes.filter((r) => recipeFitsMeal(r, meal)).length;
    if (slots > recipes * maxRepeats) {
      return `Hay ${slots} ${MEAL_PLURAL[meal]} que cubrir y solo ${recipes} platos aptos; sin repetir un plato más de ${maxRepeats} veces hacen falta al menos ${Math.ceil(slots / maxRepeats)}.`;
    }
  }
  return "No hay combinación de platos que cumpla a la vez los platos fijados y el límite de repeticiones.";
}

export function planMenu(solver: Solver, input: PlanInput): PlanResult {
  const timeLimitSec = input.timeLimitSec ?? 1.8;
  const prep = prepare(input);
  const empty: MenuMetrics = {
    totalCost: 0,
    costPerPersonDay: 0,
    distinctProducts: 0,
    wasteCost: 0,
  };
  const sol = solveModel(
    solver,
    buildModel(input, prep, { ...MODE_WEIGHTS[input.mode], tieBreak: false, budget: input.budget }),
    timeLimitSec,
  );
  if (!sol) {
    return {
      status: "infeasible",
      assignments: {},
      purchases: [],
      balances: [],
      metrics: empty,
      baseline: null,
      savings: null,
      unpriced: [],
      explanation: explainInfeasible(input, solver, prep, timeLimitSec),
      optimal: false,
    };
  }
  const chosen = evaluate(input, prep, sol);

  // Referencia: el mismo menú elegido solo por variedad, sin mirar precios ni presupuesto.
  const baseSol = solveModel(
    solver,
    buildModel(input, prep, {
      cost: 0.0001,
      waste: 0,
      distinct: 0,
      repeat: 3,
      diversity: 0,
      tieBreak: true,
      budget: null,
    }),
    // La referencia solo sirve para medir el ahorro: menos tiempo para no pasar de 3 s en total.
    Math.min(1, timeLimitSec / 2),
  );
  const baseline = baseSol ? evaluate(input, prep, baseSol).metrics : null;
  const used = new Set(Object.values(sol.assignments));
  return {
    status: "ok",
    assignments: sol.assignments,
    purchases: chosen.purchases,
    balances: chosen.balances,
    metrics: chosen.metrics,
    baseline,
    savings: baseline ? round2(baseline.totalCost - chosen.metrics.totalCost) : null,
    unpriced: prep.unpriced.filter((u) => used.has(u.recipeId)),
    explanation: null,
    optimal: sol.optimal,
  };
}
