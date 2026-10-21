"use client";

import { parseRecipeText, type ChainRecipeCost, type RecipeNutrition } from "@comparacompra/core";
import { useLiveQuery } from "dexie-react-hooks";
import type { ParsedLineDTO } from "./api-types";
import { db, newId, nowIso, type HouseholdLocal, type RecipeLocal } from "./db";
import { addLines, ensureActiveList } from "./lists";
import type {
  CostRequest,
  ExtractRequest,
  ExtractResponse,
  GenerateRequest,
  IngredientDTO,
  RecipeDraft,
} from "./recipe-types";
import { enqueue } from "./sync";

export function useRecipes(): RecipeLocal[] | undefined {
  return useLiveQuery(() => db.recipes.orderBy("title").toArray(), []);
}

/** undefined mientras carga; null si no existe. */
export function useRecipe(id: string | null): RecipeLocal | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id]);
}

export function draftFromRecipe(r: RecipeLocal): RecipeDraft {
  return {
    title: r.title,
    servings: r.servings,
    minutes: r.minutes,
    steps: r.steps,
    tags: r.tags,
    sourceUrl: r.sourceUrl,
    ingredients: r.ingredients.map((i) => ({
      raw: i.rawText ?? i.name,
      name: i.name,
      leafSlug: i.leafSlug,
      variant: i.variant,
      flags: i.flags as IngredientDTO["flags"],
      quantity: i.quantity,
      unit: i.quantity === null ? null : i.unit,
      optional: i.optional,
    })),
  };
}

export async function saveRecipe(draft: RecipeDraft, id?: string): Promise<RecipeLocal> {
  const now = nowIso();
  const current = id ? await db.recipes.get(id) : undefined;
  const recipe: RecipeLocal = {
    id: current?.id ?? newId(),
    title: draft.title.trim() || "Plato sin título",
    servings: draft.servings,
    minutes: draft.minutes,
    steps: draft.steps.filter((s) => s.trim()),
    tags: draft.tags,
    sourceUrl: draft.sourceUrl,
    ingredients: draft.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        leafSlug: i.leafSlug,
        variant: i.variant,
        flags: i.flags,
        quantity: i.quantity,
        unit: i.quantity === null ? null : i.unit,
        optional: i.optional,
        rawText: i.raw || null,
      })),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  await db.recipes.put(recipe);
  await enqueue("recipe", "upsert", recipe.id, recipe as unknown as Record<string, unknown>);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
  await enqueue("recipe", "delete", id, null);
}

export class RecipeApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "offline" | "catalog" | "rejected" | "server",
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  if (!navigator.onLine) throw new RecipeApiError("Sin conexión", "offline");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RecipeApiError("Sin conexión", "offline");
  }
  if (res.ok) return (await res.json()) as T;
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    violations?: { ingredient: string; reason: string }[];
  };
  const details = (data.violations ?? []).map((v) => `${v.ingredient}: ${v.reason}`);
  if (res.status === 503) throw new RecipeApiError(data.error ?? "Sin catálogo", "catalog");
  if (res.status === 422) throw new RecipeApiError(data.error ?? "No válido", "rejected", details);
  throw new RecipeApiError(data.error ?? "Error del servidor", "server");
}

/** Texto pegado: en el servidor (IA si la hay) o, sin conexión, con las reglas del móvil. */
export async function extractRecipe(
  req: ExtractRequest,
): Promise<ExtractResponse | { draft: RecipeDraft; source: "local"; usedAi: false }> {
  if (req.kind === "text" && !navigator.onLine) {
    const p = parseRecipeText(req.text);
    return {
      source: "local",
      usedAi: false,
      draft: {
        title: p.title ?? "",
        servings: p.servings ?? 4,
        minutes: p.minutes,
        steps: p.steps,
        tags: [],
        sourceUrl: null,
        ingredients: p.ingredients.map((i) => ({
          raw: i.raw,
          name: i.name,
          leafSlug: i.leafSlug,
          variant: i.variant,
          flags: i.flags,
          quantity: i.quantity,
          unit: i.unit,
          optional: i.optional,
        })),
      },
    };
  }
  return post<ExtractResponse>("/api/recipes/extract", req);
}

export function generateRecipe(req: GenerateRequest): Promise<ExtractResponse> {
  return post<ExtractResponse>("/api/recipes/generate", req);
}

export interface CostResponse {
  chains: ChainRecipeCost[];
  unitWeights: Record<string, { grams: number; chains: string[] }>;
  nutrition: Record<string, { perServing: RecipeNutrition | null; sources: string[] }>;
}

export function requestRecipeCost(
  household: HouseholdLocal,
  recipe: RecipeLocal,
  targetServings: number,
): Promise<CostResponse> {
  const body: CostRequest = {
    postalCode: household.postalCode,
    chains: household.chainSlugs,
    servings: recipe.servings,
    targetServings,
    ingredients: draftFromRecipe(recipe).ingredients,
  };
  return post<CostResponse>("/api/recipes/cost", body);
}

/** Ingredientes del plato para las raciones pedidas como líneas de la lista. */
export function recipeToLines(recipe: RecipeLocal, servings: number): ParsedLineDTO[] {
  const f = servings / recipe.servings;
  return recipe.ingredients
    .filter((i) => !i.optional)
    .map((i) => ({
      raw: i.rawText ?? i.name,
      label: i.name,
      leafSlug: i.leafSlug,
      variant: i.variant,
      flags: i.flags as ParsedLineDTO["flags"],
      quantity: i.quantity === null ? null : Math.round(i.quantity * f * 100) / 100,
      unit: i.quantity === null ? null : i.unit,
      packs: null,
      people: null,
      level: "equivalent" as const,
      confidence: 1,
    }));
}

export async function addRecipeToList(recipe: RecipeLocal, servings: number): Promise<number> {
  const list = await ensureActiveList();
  const lines = recipeToLines(recipe, servings);
  await addLines(list.id, lines);
  return lines.length;
}
