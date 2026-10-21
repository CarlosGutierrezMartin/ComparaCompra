import Dexie, { type EntityTable } from "dexie";
import type { BaseUnit } from "@comparacompra/core";
import type {
  IngredientBalance,
  MenuMetrics,
  Purchase,
  Unpriced,
} from "@comparacompra/menu/tolist";
import type { Meal, MenuMode, MenuRecipe } from "@comparacompra/menu/types";

/**
 * Datos del usuario en el dispositivo (IndexedDB). Son la fuente de verdad en el móvil:
 * la app funciona entera sin conexión y los cambios viajan al servidor por la cola de
 * sincronización (lib/sync.ts) cuando hay conexión y sesión.
 */

export type EquivalenceLevel = "identical" | "equivalent" | "generic";

export interface HouseholdLocal {
  id: "local";
  postalCode: string;
  members: number;
  weeklyBudget: number | null;
  chainSlugs: string[];
  diet: string[];
  allergens: string[];
  disliked: string[];
  /** id del hogar en el servidor, cuando hay cuenta. */
  remoteId: string | null;
  updatedAt: string;
}

export interface ShoppingListLocal {
  id: string;
  name: string;
  chainSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListItemLocal {
  id: string;
  listId: string;
  rawText: string;
  /** Texto del producto sin cantidades. */
  label: string;
  /** Canónico idéntico elegido ("este producto exactamente"). */
  canonicalId: number | null;
  canonicalName: string | null;
  leafSlug: string | null;
  variant: string | null;
  flags: string[];
  quantity: number | null;
  unit: BaseUnit | null;
  packs: number | null;
  people: number | null;
  estimated: boolean;
  level: EquivalenceLevel;
  preferredBrand: string | null;
  checked: boolean;
  position: number;
}

export interface RecipeIngredientLocal {
  name: string;
  leafSlug: string | null;
  variant: string | null;
  flags: string[];
  /** null si la receta no la da ("sal al gusto"): no se inventa. */
  quantity: number | null;
  unit: BaseUnit | null;
  optional: boolean;
  rawText: string | null;
}

export interface RecipeLocal {
  id: string;
  title: string;
  servings: number;
  minutes: number | null;
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  ingredients: RecipeIngredientLocal[];
  createdAt: string;
  updatedAt: string;
}

export interface MealSlotLocal {
  day: number;
  meal: Meal;
  /** id de un plato del usuario o "base:…" del recetario base. */
  recipeId: string | null;
  servings: number;
  locked: boolean;
}

/** Resultado del último cálculo del menú, guardado para verlo sin conexión. */
export interface MealPlanSummary {
  metrics: MenuMetrics;
  baseline: MenuMetrics | null;
  savings: number | null;
  purchases: Purchase[];
  balances: IngredientBalance[];
  unpriced: Unpriced[];
  excluded: { recipeId: string; title: string; reasons: string[] }[];
  /** Copia de los platos usados (los del recetario base no están en la tabla de platos). */
  recipes: MenuRecipe[];
  computedAt: string;
}

export interface MealPlanLocal {
  id: string;
  weekStart: string;
  budget: number | null;
  people: number;
  optimizedFor: MenuMode;
  includeBase: boolean;
  slots: MealSlotLocal[];
  summary: MealPlanSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface PantryItemLocal {
  id: string;
  leafSlug: string;
  variant: string | null;
  name: string;
  quantity: number;
  unit: BaseUnit;
  bestBefore: string | null;
}

/** Lista descargada para el modo tienda: todo lo necesario para usarla en modo avión. */
export interface StoreTripItem {
  id: string;
  name: string;
  productName: string | null;
  productUrl: string | null;
  productChainId: number | null;
  aisle: string;
  quantityText: string;
  packs: number;
  price: number | null;
  priceDate: string | null;
  observedPrice: number | null;
  checked: boolean;
}

export interface StoreTripLocal {
  id: string;
  listId: string;
  chainSlug: string;
  createdAt: string;
  updatedAt: string;
  items: StoreTripItem[];
}

export type SyncTable =
  | "household"
  | "shopping_list"
  | "list_item"
  | "recipe"
  | "meal_plan"
  | "pantry_item"
  | "price_observation";

export interface SyncOp {
  seq?: number;
  table: SyncTable;
  op: "upsert" | "delete";
  key: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export class AppDB extends Dexie {
  household!: EntityTable<HouseholdLocal, "id">;
  lists!: EntityTable<ShoppingListLocal, "id">;
  listItems!: EntityTable<ListItemLocal, "id">;
  recipes!: EntityTable<RecipeLocal, "id">;
  mealPlans!: EntityTable<MealPlanLocal, "id">;
  pantry!: EntityTable<PantryItemLocal, "id">;
  storeTrips!: EntityTable<StoreTripLocal, "id">;
  syncQueue!: EntityTable<SyncOp, "seq">;

  constructor(name = "comparacompra") {
    super(name);
    this.version(1).stores({
      household: "id",
      lists: "id, updatedAt",
      listItems: "id, listId, position",
      recipes: "id, updatedAt, title",
      mealPlans: "id, weekStart",
      pantry: "id, leafSlug",
      storeTrips: "id, listId, updatedAt",
      syncQueue: "++seq, table, key",
    });
  }
}

export const db = new AppDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
