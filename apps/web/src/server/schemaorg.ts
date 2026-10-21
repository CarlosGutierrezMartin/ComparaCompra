import { parseIngredientLine } from "@comparacompra/core";
import type { RecipeDraft } from "@/lib/recipe-types";

/**
 * Lee el marcado schema.org/Recipe (JSON-LD) de una página. De una receta ajena solo se
 * guardan ingredientes, cantidades, raciones, tiempo y el enlace: ni los pasos ni las
 * fotos del autor (docs/SPEC.md, reglas legales).
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function isRecipe(node: Json): node is { [k: string]: Json } {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const type = node["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

function findRecipe(node: Json): { [k: string]: Json } | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  if (isRecipe(node)) return node;
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const child = node[key];
    if (child !== undefined) {
      const r = findRecipe(child);
      if (r) return r;
    }
  }
  return null;
}

/** "PT1H30M" -> 90 */
export function isoDurationToMinutes(value: Json | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

function yieldToServings(value: Json | undefined): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "number") return first > 0 ? Math.round(first) : null;
  if (typeof first === "string") {
    const m = /(\d+)/.exec(first);
    return m?.[1] ? Number(m[1]) : null;
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractJsonLdRecipe(html: string, url: string): RecipeDraft | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let data: Json;
    try {
      data = JSON.parse(block[1] ?? "") as Json;
    } catch {
      continue;
    }
    const recipe = findRecipe(data);
    if (!recipe) continue;
    const rawIngredients = recipe.recipeIngredient ?? recipe.ingredients;
    const lines = (Array.isArray(rawIngredients) ? rawIngredients : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => decodeEntities(x).trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const title =
      typeof recipe.name === "string" ? decodeEntities(recipe.name).trim() : "Receta importada";
    return {
      title: title.slice(0, 200),
      servings: yieldToServings(recipe.recipeYield) ?? 4,
      minutes: isoDurationToMinutes(recipe.totalTime) ?? isoDurationToMinutes(recipe.cookTime),
      ingredients: lines.slice(0, 60).map((l) => {
        const p = parseIngredientLine(l);
        return {
          raw: p.raw,
          name: p.name,
          leafSlug: p.leafSlug,
          variant: p.variant,
          flags: p.flags,
          quantity: p.quantity,
          unit: p.unit,
          optional: p.optional,
        };
      }),
      steps: [], // los pasos son texto del autor: solo se guarda el enlace
      sourceUrl: url,
      tags: [],
    };
  }
  return null;
}

/** Texto visible de una página, para la extracción con IA cuando no hay schema.org. */
export function visibleText(html: string, limit = 20000): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, limit);
}
