import { LEAF_BY_SLUG, LEAVES, type BaseUnit } from "@comparacompra/core";
export type { IngredientBalance, MenuMetrics, PlanResult, Purchase, Unpriced } from "./plan";
import { ingredientKey, type IngredientBalance } from "./plan";
import type { MenuRecipe, MenuSlot } from "./types";

/** Línea de la lista generada desde el menú, en el orden de los pasillos. */
export interface MenuListLine {
  label: string;
  leafSlug: string | null;
  variant: string | null;
  flags: string[];
  quantity: number | null;
  unit: BaseUnit | null;
  section: string;
}

const SECTION_ORDER = [...new Set(LEAVES.map((l) => l.section))];

/**
 * Convierte el menú en líneas de la lista agrupadas por sección: lo que hace falta menos lo
 * que ya hay en la despensa. Los ingredientes sin cantidad de los platos elegidos ("sal")
 * se añaden sin cantidad para no olvidarlos; los opcionales no.
 */
export function menuToListLines(
  balances: IngredientBalance[],
  slots: MenuSlot[],
  assignments: Record<string, string>,
  recipes: MenuRecipe[],
): MenuListLine[] {
  const lines: MenuListLine[] = [];
  const seen = new Set<string>();
  for (const b of balances) {
    seen.add(b.key);
    const qty = b.needed - b.fromPantry;
    if (qty <= 0) continue;
    lines.push({
      label: b.label,
      leafSlug: b.leafSlug,
      variant: b.variant,
      flags: b.flags,
      quantity: b.unit === "unit" ? Math.ceil(qty) : Math.round(qty),
      unit: b.unit,
      section: LEAF_BY_SLUG.get(b.leafSlug)?.section ?? "Otros",
    });
  }
  // Ingredientes de los platos elegidos que no entraron en el cálculo (sin precio o sin cantidad).
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const extra = new Map<string, MenuListLine>();
  for (const slot of slots) {
    const r = byId.get(assignments[slot.id] ?? "");
    if (!r) continue;
    for (const ing of r.ingredients) {
      const key = ingredientKey(ing) ?? `?${ing.name.toLowerCase()}`;
      if (ing.optional || seen.has(key)) continue;
      const q = ing.quantity === null ? null : (ing.quantity * slot.servings) / r.servings;
      const prev = extra.get(key);
      if (!prev) {
        extra.set(key, {
          label: ing.name,
          leafSlug: ing.leafSlug,
          variant: ing.variant,
          flags: ing.flags,
          quantity: q,
          unit: q === null ? null : ing.unit,
          section: (ing.leafSlug && LEAF_BY_SLUG.get(ing.leafSlug)?.section) || "Otros",
        });
      } else if (prev.quantity !== null && q !== null && prev.unit === ing.unit) {
        prev.quantity += q;
      } else {
        // Unidades distintas o alguna sin cantidad: no se suma, se deja sin cantidad.
        prev.quantity = null;
        prev.unit = null;
      }
    }
  }
  for (const line of extra.values()) {
    if (line.quantity !== null)
      line.quantity = line.unit === "unit" ? Math.ceil(line.quantity) : Math.round(line.quantity);
    lines.push(line);
  }
  const rank = (s: string) => {
    const i = SECTION_ORDER.indexOf(s);
    return i < 0 ? SECTION_ORDER.length : i;
  };
  return lines.sort(
    (a, b) => rank(a.section) - rank(b.section) || a.label.localeCompare(b.label, "es"),
  );
}
