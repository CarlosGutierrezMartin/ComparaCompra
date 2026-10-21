import { z } from "zod";
import { UnitSchema } from "./api-types";

/** Contratos de /api/menu/plan. */

export const MealSchema = z.enum(["desayuno", "comida", "cena"]);
export const MenuModeSchema = z.enum(["ahorro", "variedad", "aprovechamiento"]);

const MenuIngredientSchema = z.object({
  name: z.string().max(200),
  leafSlug: z.string().nullable(),
  variant: z.string().nullable(),
  flags: z.array(z.string()).max(10),
  quantity: z.number().positive().nullable(),
  unit: UnitSchema.nullable(),
  optional: z.boolean(),
});

export const MenuRecipeSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(200),
  servings: z.number().int().min(1).max(50),
  minutes: z.number().int().positive().nullable(),
  meals: z.array(MealSchema).max(3),
  steps: z.array(z.string()).max(60),
  ingredients: z.array(MenuIngredientSchema).max(60),
});

export const MenuSlotSchema = z.object({
  id: z.string().min(1).max(40),
  day: z.number().int().min(0).max(6),
  meal: MealSchema,
  servings: z.number().int().min(1).max(20),
  fixedRecipeId: z.string().max(80).nullable(),
  avoidRecipeIds: z.array(z.string().max(80)).max(200).optional(),
});

export const PlanRequestSchema = z.object({
  postalCode: z.string().regex(/^\d{5}$/),
  chains: z.array(z.string()).min(1).max(10),
  mode: MenuModeSchema,
  budget: z.number().positive().max(5000).nullable(),
  slots: z.array(MenuSlotSchema).min(1).max(21),
  /** Platos del usuario; el recetario base se añade en el servidor si includeBase. */
  recipes: z.array(MenuRecipeSchema).max(200),
  includeBase: z.boolean(),
  pantry: z
    .array(
      z.object({
        leafSlug: z.string(),
        variant: z.string().nullable(),
        flags: z.array(z.string()).max(10),
        quantity: z.number().positive(),
        unit: UnitSchema,
      }),
    )
    .max(200),
  diet: z.array(z.string()).max(10),
  allergens: z.array(z.string()).max(20),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
