"use client";

import { menuToListLines, type PlanResult } from "@comparacompra/menu/tolist";
import type { Meal, MenuMode, MenuRecipe, MenuSlot } from "@comparacompra/menu/types";
import { useLiveQuery } from "dexie-react-hooks";
import type { ParsedLineDTO } from "./api-types";
import {
  db,
  newId,
  nowIso,
  type HouseholdLocal,
  type MealPlanLocal,
  type MealPlanSummary,
  type MealSlotLocal,
  type PantryItemLocal,
  type RecipeLocal,
} from "./db";
import { addLines, ensureActiveList } from "./lists";
import type { PlanRequest } from "./menu-types";
import { DEMO } from "./demo";
import { demoPlan } from "./demo-api";
import { enqueue } from "./sync";

export const MEAL_ORDER: Meal[] = ["desayuno", "comida", "cena"];

export function slotId(s: { day: number; meal: Meal }): string {
  return `${s.day}-${s.meal}`;
}

/** Lunes de la semana de una fecha, en formato AAAA-MM-DD. */
export function weekStartOf(date = new Date()): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useCurrentPlan(): MealPlanLocal | null | undefined {
  return useLiveQuery(async () => (await db.mealPlans.orderBy("weekStart").last()) ?? null, []);
}

export function usePantry(): PantryItemLocal[] | undefined {
  return useLiveQuery(() => db.pantry.toArray(), []);
}

export function recipeToMenu(r: RecipeLocal): MenuRecipe {
  const meals = r.tags.filter((t): t is Meal => (MEAL_ORDER as string[]).includes(t));
  return {
    id: r.id,
    title: r.title,
    servings: r.servings,
    minutes: r.minutes,
    meals,
    steps: [],
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      leafSlug: i.leafSlug,
      variant: i.variant,
      flags: i.flags,
      quantity: i.quantity,
      unit: i.quantity === null ? null : i.unit,
      optional: i.optional,
    })),
  };
}

export class MenuApiError extends Error {
  constructor(public readonly kind: "offline" | "catalog" | "server") {
    super(kind);
  }
}

export type PlanResponse = PlanResult & {
  recipes: MenuRecipe[];
  excluded: MealPlanSummary["excluded"];
  elapsedMs: number;
};

async function requestPlan(body: PlanRequest): Promise<PlanResponse> {
  if (DEMO) return demoPlan(body);
  if (!navigator.onLine) throw new MenuApiError("offline");
  let res: Response;
  try {
    res = await fetch("/api/menu/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MenuApiError("offline");
  }
  if (res.status === 503) throw new MenuApiError("catalog");
  if (!res.ok) throw new MenuApiError("server");
  return (await res.json()) as PlanResponse;
}

export interface MenuConfig {
  days: number[];
  meals: Meal[];
  people: number;
  budget: number | null;
  mode: MenuMode;
  includeBase: boolean;
}

interface SolveOptions {
  /** Huecos que se mantienen tal cual (bloqueados o el resto al "cambiar"). */
  keep: (slot: MealSlotLocal) => boolean;
  avoid?: Record<string, string[]>;
}

async function solve(
  household: HouseholdLocal,
  plan: Omit<MealPlanLocal, "summary">,
  opts: SolveOptions,
): Promise<{ plan: MealPlanLocal; response: PlanResponse }> {
  const [userRecipes, pantry] = await Promise.all([db.recipes.toArray(), db.pantry.toArray()]);
  const slots: MenuSlot[] = plan.slots.map((s) => ({
    id: slotId(s),
    day: s.day,
    meal: s.meal,
    servings: s.servings,
    fixedRecipeId: opts.keep(s) ? s.recipeId : null,
    avoidRecipeIds: opts.avoid?.[slotId(s)],
  }));
  // Platos fijados que no están en el dispositivo (del recetario base) los añade el servidor.
  const response = await requestPlan({
    postalCode: household.postalCode,
    chains: household.chainSlugs,
    mode: plan.optimizedFor,
    budget: plan.budget,
    slots,
    recipes: userRecipes.map(recipeToMenu),
    includeBase: plan.includeBase || slots.some((s) => s.fixedRecipeId?.startsWith("base:")),
    pantry: pantry.map((p) => ({
      leafSlug: p.leafSlug,
      variant: p.variant ?? null,
      flags: [],
      quantity: p.quantity,
      unit: p.unit,
    })),
    diet: household.diet,
    allergens: household.allergens,
  });
  if (response.status !== "ok") return { plan: { ...plan, summary: null }, response };
  const next: MealPlanLocal = {
    ...plan,
    slots: plan.slots.map((s) => ({ ...s, recipeId: response.assignments[slotId(s)] ?? null })),
    summary: {
      metrics: response.metrics,
      baseline: response.baseline,
      savings: response.savings,
      purchases: response.purchases,
      balances: response.balances,
      unpriced: response.unpriced,
      excluded: response.excluded,
      recipes: response.recipes,
      computedAt: nowIso(),
    },
    updatedAt: nowIso(),
  };
  await db.mealPlans.put(next);
  await enqueue("meal_plan", "upsert", next.id, next as unknown as Record<string, unknown>);
  return { plan: next, response };
}

/** Propone un menú nuevo. `pendingRecipeId` (desde "Añadir al menú") se fija en el primer hueco que admita. */
export async function proposeMenu(
  household: HouseholdLocal,
  config: MenuConfig,
  pendingRecipeId: string | null,
) {
  const now = nowIso();
  const slots: MealSlotLocal[] = [];
  for (const day of [...config.days].sort()) {
    for (const meal of MEAL_ORDER) {
      if (config.meals.includes(meal))
        slots.push({ day, meal, recipeId: null, servings: config.people, locked: false });
    }
  }
  if (pendingRecipeId) {
    const target = slots.find((s) => s.meal !== "desayuno") ?? slots[0];
    if (target) Object.assign(target, { recipeId: pendingRecipeId, locked: true });
  }
  const current = await db.mealPlans.orderBy("weekStart").last();
  const plan = {
    id: current?.id ?? newId(),
    weekStart: weekStartOf(),
    budget: config.budget,
    people: config.people,
    optimizedFor: config.mode,
    includeBase: config.includeBase,
    slots,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  return solve(household, plan, { keep: (s) => s.locked });
}

/** Vuelve a calcular los huecos sin bloquear. */
export function regenerate(household: HouseholdLocal, plan: MealPlanLocal) {
  return solve(household, plan, { keep: (s) => s.locked });
}

/** Cambia el plato de un hueco: el resto se mantiene y el plato actual no puede repetir ahí. */
export function swapSlot(household: HouseholdLocal, plan: MealPlanLocal, id: string) {
  const current = plan.slots.find((s) => slotId(s) === id)?.recipeId;
  return solve(household, plan, {
    keep: (s) => slotId(s) !== id,
    avoid: current ? { [id]: [current] } : {},
  });
}

/** Pone un plato en un hueco y lo bloquea; recalcula el resto si hay conexión. */
export function placeRecipe(
  household: HouseholdLocal,
  plan: MealPlanLocal,
  id: string,
  recipeId: string,
) {
  const next = {
    ...plan,
    slots: plan.slots.map((s) => (slotId(s) === id ? { ...s, recipeId, locked: true } : s)),
  };
  return solve(household, next, { keep: () => true });
}

export async function toggleLock(plan: MealPlanLocal, id: string): Promise<void> {
  const next = {
    ...plan,
    slots: plan.slots.map((s) => (slotId(s) === id ? { ...s, locked: !s.locked } : s)),
    updatedAt: nowIso(),
  };
  await db.mealPlans.put(next);
  await enqueue("meal_plan", "upsert", next.id, next as unknown as Record<string, unknown>);
}

/** Pasa el menú a la lista activa, agrupado por secciones y sin lo que hay en la despensa. */
export async function menuToList(plan: MealPlanLocal): Promise<number> {
  if (!plan.summary) return 0;
  const slots: MenuSlot[] = plan.slots.map((s) => ({
    id: slotId(s),
    day: s.day,
    meal: s.meal,
    servings: s.servings,
    fixedRecipeId: null,
  }));
  const assignments = Object.fromEntries(
    plan.slots.filter((s) => s.recipeId).map((s) => [slotId(s), s.recipeId ?? ""]),
  );
  const lines = menuToListLines(plan.summary.balances, slots, assignments, plan.summary.recipes);
  const dto: ParsedLineDTO[] = lines.map((l) => ({
    raw: l.label,
    label: l.label,
    leafSlug: l.leafSlug,
    variant: l.variant,
    flags: l.flags as ParsedLineDTO["flags"],
    quantity: l.quantity,
    unit: l.unit,
    packs: null,
    people: null,
    level: "equivalent",
    confidence: 1,
  }));
  const list = await ensureActiveList();
  await addLines(list.id, dto);
  return dto.length;
}

export async function addPantryItem(item: Omit<PantryItemLocal, "id">): Promise<void> {
  const row: PantryItemLocal = { ...item, id: newId() };
  await db.pantry.put(row);
  await enqueue("pantry_item", "upsert", row.id, row as unknown as Record<string, unknown>);
}

export async function removePantryItem(id: string): Promise<void> {
  await db.pantry.delete(id);
  await enqueue("pantry_item", "delete", id, null);
}
