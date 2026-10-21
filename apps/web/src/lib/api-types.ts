import { z } from "zod";

/** Contratos de las rutas /api, validados con Zod en el servidor y usados en el cliente. */

export const FlagSchema = z.enum([
  "sin_lactosa",
  "sin_gluten",
  "ecologico",
  "congelado",
  "sin_azucar",
  "integral",
]);
export const LevelSchema = z.enum(["identical", "equivalent", "generic"]);
export const UnitSchema = z.enum(["g", "ml", "unit"]);

export const ParsedLineSchema = z.object({
  raw: z.string(),
  label: z.string(),
  leafSlug: z.string().nullable(),
  variant: z.string().nullable(),
  flags: z.array(FlagSchema),
  quantity: z.number().positive().nullable(),
  unit: UnitSchema.nullable(),
  packs: z.number().positive().nullable(),
  people: z.number().positive().nullable(),
  level: LevelSchema,
  confidence: z.number().min(0).max(1),
  /** true si la cantidad la estimó la IA a partir de "para 4" (se muestra como estimada). */
  estimated: z.boolean().optional(),
});
export type ParsedLineDTO = z.infer<typeof ParsedLineSchema>;

export const ParseRequestSchema = z.object({ text: z.string().min(1).max(5000) });
export const ParseResponseSchema = z.object({
  lines: z.array(ParsedLineSchema),
  source: z.enum(["ia", "reglas"]),
  /** Si la IA falló y se usaron las reglas, por qué. */
  notice: z.string().nullable(),
});
export type ParseResponse = z.infer<typeof ParseResponseSchema>;

export const CompareLineSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(200),
  leafSlug: z.string().nullable(),
  variant: z.string().nullable(),
  flags: z.array(FlagSchema),
  level: LevelSchema,
  identicalCanonicalId: z.number().int().nullable().optional(),
  quantity: z.number().positive().nullable(),
  unit: UnitSchema.nullable(),
  packs: z.number().positive().nullable().optional(),
  preferredBrand: z.string().max(80).nullable().optional(),
});
export type CompareLine = z.infer<typeof CompareLineSchema>;

export const CompareRequestSchema = z.object({
  postalCode: z.string().regex(/^\d{5}$/),
  chains: z.array(z.string()).min(1).max(10),
  maxStores: z.union([z.literal(1), z.literal(2)]).default(2),
  fixedCostPerStore: z.number().min(0).max(100).default(0),
  lines: z.array(CompareLineSchema).min(1).max(100),
});
export type CompareRequest = z.infer<typeof CompareRequestSchema>;
