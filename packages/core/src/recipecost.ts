import { bestOfferInChain, type BasketLine, type Offer } from "./basket";
import type { BaseUnit } from "./units";

/**
 * Coste de un plato por cadena (docs/SPEC.md, F2):
 * - coste por ración: con la cantidad realmente usada, al precio por unidad de medida;
 * - coste de compra: envases completos necesarios ("no es lo mismo usar 200 g que comprar 1 kg").
 * Funciones puras, sin red.
 */

export interface RecipeCostIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: BaseUnit | null;
  optional: boolean;
  offers: Offer[];
  /** Peso de una pieza según la propia cadena (para "2 tomates"), si se conoce. */
  unitWeightG: number | null;
}

export type CostIssue = "sin_cantidad" | "sin_precio" | "unidad_no_convertible" | "opcional";

export interface IngredientCost {
  ingredientId: string;
  chain: string;
  offer: Offer | null;
  /** Cantidad usada en la unidad de la oferta. */
  usedQuantity: number | null;
  usedCost: number | null;
  packs: number | null;
  purchaseCost: number | null;
  issue: CostIssue | null;
}

export interface ChainRecipeCost {
  chain: string;
  usedTotal: number;
  perServing: number;
  purchaseTotal: number;
  /** Ingredientes con coste calculado sobre los que tienen cantidad. */
  costed: number;
  costable: number;
  ingredients: IngredientCost[];
  /** Fecha del precio más antiguo usado. */
  oldestPriceDate: string | null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Pasa la cantidad del ingrediente a la unidad de la oferta (null si no se puede). */
export function toOfferUnit(ing: RecipeCostIngredient, offerUnit: BaseUnit | null): number | null {
  if (ing.quantity === null || ing.unit === null || offerUnit === null) return null;
  if (ing.unit === offerUnit) return ing.quantity;
  if (ing.unit === "unit" && offerUnit === "g" && ing.unitWeightG)
    return ing.quantity * ing.unitWeightG;
  if (ing.unit === "g" && offerUnit === "unit" && ing.unitWeightG)
    return ing.quantity / ing.unitWeightG;
  return null; // ml <-> g sin densidad conocida: no se inventa
}

function pricePerBase(o: Offer): number | null {
  if (o.quantity === null || o.quantity <= 0) return null;
  return o.price / (o.quantity * o.unitsPerPack);
}

export function costIngredientInChain(ing: RecipeCostIngredient, chain: string): IngredientCost {
  const base: IngredientCost = {
    ingredientId: ing.id,
    chain,
    offer: null,
    usedQuantity: null,
    usedCost: null,
    packs: null,
    purchaseCost: null,
    issue: null,
  };
  const inChain = ing.offers.filter((o) => o.chain === chain);
  if (ing.optional) return { ...base, issue: "opcional" };
  if (ing.quantity === null)
    return { ...base, issue: inChain.length ? "sin_cantidad" : "sin_precio" };
  if (!inChain.length) return { ...base, issue: "sin_precio" };

  // Coste de uso: la oferta con menor precio por unidad de medida convertible.
  let bestUse: { offer: Offer; qty: number; cost: number } | null = null;
  for (const o of inChain) {
    const qty = toOfferUnit(ing, o.unit);
    const ppb = pricePerBase(o);
    if (qty === null || ppb === null) continue;
    const cost = qty * ppb;
    if (!bestUse || cost < bestUse.cost) bestUse = { offer: o, qty, cost };
  }
  if (!bestUse) return { ...base, issue: "unidad_no_convertible" };

  // Coste de compra: envases enteros con el motor de cesta, en la unidad de la oferta.
  const line: BasketLine = {
    id: ing.id,
    label: ing.name,
    quantity: bestUse.qty,
    unit: bestUse.offer.unit,
    offers: inChain.filter((o) => o.unit === bestUse.offer.unit),
  };
  const purchase = bestOfferInChain(line, chain);
  return {
    ...base,
    offer: bestUse.offer,
    usedQuantity: bestUse.qty,
    usedCost: round2(bestUse.cost),
    packs: purchase?.packs ?? null,
    purchaseCost: purchase?.cost ?? null,
    issue: null,
  };
}

/** Escala las cantidades de las raciones del plato a las pedidas. */
export function scaleIngredients<T extends { quantity: number | null }>(
  items: T[],
  from: number,
  to: number,
): T[] {
  const f = to / from;
  return items.map((i) => ({ ...i, quantity: i.quantity === null ? null : i.quantity * f }));
}

export function costRecipe(
  ingredients: RecipeCostIngredient[],
  servings: number,
  chains: string[],
): ChainRecipeCost[] {
  return chains.map((chain) => {
    const rows = ingredients.map((ing) => costIngredientInChain(ing, chain));
    const costed = rows.filter((r) => r.usedCost !== null);
    const usedTotal = round2(costed.reduce((s, r) => s + (r.usedCost ?? 0), 0));
    const purchaseTotal = round2(rows.reduce((s, r) => s + (r.purchaseCost ?? 0), 0));
    const dates = costed
      .map((r) => r.offer?.priceDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    return {
      chain,
      usedTotal,
      perServing: round2(usedTotal / servings),
      purchaseTotal,
      costed: costed.length,
      costable: ingredients.filter((i) => !i.optional && i.quantity !== null).length,
      ingredients: rows,
      oldestPriceDate: dates[0] ?? null,
    };
  });
}

export interface Nutrients100 {
  energyKcal100: number | null;
  proteins100: number | null;
  carbohydrates100: number | null;
  fat100: number | null;
  salt100: number | null;
}

export interface RecipeNutrition {
  energyKcal: number;
  proteins: number;
  carbohydrates: number;
  fat: number;
  salt: number;
}

/**
 * Nutrición por ración a partir de los valores por 100 g/ml de cada producto usado.
 * Solo se da si todos los ingredientes con cantidad la tienen: un total parcial engañaría.
 * Se suma g y ml como si 1 ml pesara 1 g (aproximación habitual en las etiquetas).
 */
export function recipeNutrition(
  rows: { usedQuantity: number | null; unit: BaseUnit | null; nutrients: Nutrients100 | null }[],
  servings: number,
): RecipeNutrition | null {
  const total: RecipeNutrition = { energyKcal: 0, proteins: 0, carbohydrates: 0, fat: 0, salt: 0 };
  const keys: [keyof RecipeNutrition, keyof Nutrients100][] = [
    ["energyKcal", "energyKcal100"],
    ["proteins", "proteins100"],
    ["carbohydrates", "carbohydrates100"],
    ["fat", "fat100"],
    ["salt", "salt100"],
  ];
  if (!rows.length) return null;
  for (const r of rows) {
    if (r.usedQuantity === null || r.unit === null || r.unit === "unit" || !r.nutrients)
      return null;
    for (const [k, k100] of keys) {
      const v = r.nutrients[k100];
      if (v === null) return null;
      total[k] += (v * r.usedQuantity) / 100;
    }
  }
  const round1 = (x: number) => Math.round((x / servings) * 10) / 10;
  return {
    energyKcal: Math.round(total.energyKcal / servings),
    proteins: round1(total.proteins),
    carbohydrates: round1(total.carbohydrates),
    fat: round1(total.fat),
    salt: round1(total.salt),
  };
}
