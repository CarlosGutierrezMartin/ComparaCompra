import type { BaseUnit } from "@comparacompra/core";

export const MENU_MODES = ["ahorro", "variedad", "aprovechamiento"] as const;
export type MenuMode = (typeof MENU_MODES)[number];

export const MEALS = ["desayuno", "comida", "cena"] as const;
export type Meal = (typeof MEALS)[number];

export interface MenuIngredient {
  name: string;
  leafSlug: string | null;
  variant: string | null;
  flags: string[];
  quantity: number | null;
  unit: BaseUnit | null;
  optional: boolean;
}

export interface MenuRecipe {
  id: string;
  title: string;
  servings: number;
  minutes: number | null;
  /** Comidas para las que sirve; vacío = comida y cena. */
  meals: Meal[];
  steps: string[];
  ingredients: MenuIngredient[];
}

export interface MenuSlot {
  id: string;
  day: number;
  meal: Meal;
  servings: number;
  /** Plato fijado por el usuario ("sí o sí") o bloqueado. */
  fixedRecipeId: string | null;
  /** Platos que no se quieren en este hueco (para "cambiar"). */
  avoidRecipeIds?: string[];
}

/** Un envase que se puede comprar para cubrir un ingrediente. */
export interface PackOption {
  productId: number;
  chain: string;
  name: string;
  price: number;
  /** Contenido total del envase en `unit`. */
  content: number;
  unit: BaseUnit;
  url: string;
  priceDate: string;
}

export interface PantryEntry {
  key: string;
  quantity: number;
  unit: BaseUnit;
}
