import { z } from "zod";
import { FlagSchema, UnitSchema } from "./api-types";

/** Contratos de las rutas /api/recipes. */

export const IngredientSchema = z.object({
  raw: z.string().max(300),
  name: z.string().max(200),
  leafSlug: z.string().nullable(),
  variant: z.string().nullable(),
  flags: z.array(FlagSchema),
  quantity: z.number().positive().nullable(),
  unit: UnitSchema.nullable(),
  optional: z.boolean(),
});
export type IngredientDTO = z.infer<typeof IngredientSchema>;

export const RecipeDraftSchema = z.object({
  title: z.string().max(200),
  servings: z.number().int().min(1).max(50),
  minutes: z.number().int().positive().nullable(),
  ingredients: z.array(IngredientSchema).max(60),
  steps: z.array(z.string().max(2000)).max(60),
  sourceUrl: z.string().url().nullable(),
  tags: z.array(z.string().max(40)).max(20),
});
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

export const ExtractRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(10).max(20000) }),
  z.object({ kind: z.literal("url"), url: z.string().url().max(2000) }),
  z.object({
    kind: z.literal("image"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data: z.string().max(8_000_000), // base64, unos 6 MB
  }),
]);
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.object({
  draft: RecipeDraftSchema,
  source: z.enum(["schema.org", "ia", "reglas"]),
  usedAi: z.boolean(),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

export const GenerateRequestSchema = z.object({
  request: z.string().min(3).max(500),
  servings: z.number().int().min(1).max(20),
  maxMinutes: z.number().int().positive().max(600).nullable(),
  diet: z.array(z.string()).max(10),
  allergens: z.array(z.string()).max(20),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .nullable(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const CostRequestSchema = z.object({
  ingredients: z.array(IngredientSchema).min(1).max(60),
  servings: z.number().int().min(1).max(50),
  targetServings: z.number().int().min(1).max(50),
  postalCode: z.string().regex(/^\d{5}$/),
  chains: z.array(z.string()).min(1).max(10),
});
export type CostRequest = z.infer<typeof CostRequestSchema>;
