import { LEAF_BY_SLUG } from "./listparse";

/**
 * Alérgenos y dietas de un plato comprobados ingrediente a ingrediente con la taxonomía.
 * Un ingrediente sin hoja no se puede comprobar y cuenta como incumplimiento.
 * "Sin gluten" quita el gluten; "sin lactosa" no quita el alérgeno lácteos (la proteína de
 * la leche sigue ahí), pero sí vale para la dieta sin lactosa.
 */

export interface ConstraintViolation {
  ingredient: string;
  reason: string;
}

export function recipeViolations(
  ingredients: { name: string; leafSlug: string | null; flags: string[]; optional?: boolean }[],
  diet: string[],
  allergens: string[],
): ConstraintViolation[] {
  if (!diet.length && !allergens.length) return [];
  const out: ConstraintViolation[] = [];
  for (const ing of ingredients) {
    const leaf = ing.leafSlug ? LEAF_BY_SLUG.get(ing.leafSlug) : undefined;
    if (!leaf) {
      out.push({ ingredient: ing.name, reason: "no se puede comprobar" });
      continue;
    }
    const flags = new Set(ing.flags);
    for (const a of leaf.allergens) {
      if (!allergens.includes(a)) continue;
      if (a === "gluten" && flags.has("sin_gluten")) continue;
      out.push({ ingredient: ing.name, reason: `contiene ${a}` });
    }
    for (const d of diet) {
      if (!leaf.notFor.includes(d)) continue;
      if (
        (d === "sin_gluten" && flags.has("sin_gluten")) ||
        (d === "sin_lactosa" && flags.has("sin_lactosa"))
      )
        continue;
      out.push({ ingredient: ing.name, reason: `no apto para dieta ${d}` });
    }
  }
  return out;
}
