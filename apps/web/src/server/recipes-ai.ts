import "server-only";
import { LEAF_BY_SLUG, LEAVES, parseIngredientLine, parseRecipeText } from "@comparacompra/core";
import { z } from "zod";
import type { GenerateRequest, IngredientDTO, RecipeDraft } from "@/lib/recipe-types";
import { aiAvailable, parseStructured, type UserContent } from "./ai";

const SLUGS = LEAVES.map((l) => l.slug) as [string, ...string[]];
const LEAF_LIST = LEAVES.map(
  (l) => `${l.slug}: ${l.name}${l.variants.length ? ` [${l.variants.join(", ")}]` : ""}`,
).join("\n");

const AiIngredientSchema = z.object({
  texto: z.string().describe("la línea del ingrediente tal como aparece"),
  nombre: z.string(),
  hoja: z.enum(SLUGS).nullable().describe("slug exacto de la taxonomía o null"),
  variante: z.string().nullable(),
  cantidad: z
    .number()
    .nullable()
    .describe("en g, ml o unidades; cucharada = 15 ml, cucharadita = 5 ml"),
  unidad: z.enum(["g", "ml", "unit"]).nullable(),
  opcional: z.boolean(),
});
const AiRecipeSchema = z.object({
  titulo: z.string(),
  raciones: z.number().int().nullable(),
  minutos: z.number().int().nullable(),
  ingredientes: z.array(AiIngredientSchema),
  pasos: z.array(z.string()),
});
type AiRecipe = z.infer<typeof AiRecipeSchema>;

const EXTRACT_SYSTEM = `Extraes recetas de cocina en español a una estructura fija.
Para cada ingrediente: hoja de la taxonomía (slug exacto o null), variante solo si la hoja
la tiene, cantidad en g, ml o unidades (cucharada = 15 ml, cucharadita = 5 ml) o null si la
receta no la da, y si es opcional ("al gusto"). No inventes ingredientes ni cantidades.
Hojas (slug: nombre [variantes]):
${LEAF_LIST}`;

function toIngredient(i: AiRecipe["ingredientes"][number]): IngredientDTO {
  const leaf = i.hoja ? LEAF_BY_SLUG.get(i.hoja) : undefined;
  const qty = i.cantidad && i.cantidad > 0 ? i.cantidad : null;
  return {
    raw: i.texto.slice(0, 300),
    name: i.nombre.slice(0, 200),
    leafSlug: leaf?.slug ?? null,
    variant: leaf && i.variante && leaf.variants.includes(i.variante) ? i.variante : null,
    flags: [],
    quantity: qty,
    unit: qty ? i.unidad : null,
    optional: i.opcional,
  };
}

function toDraft(r: AiRecipe, opts: { sourceUrl: string | null; keepSteps: boolean }): RecipeDraft {
  return {
    title: r.titulo.slice(0, 200) || "Plato sin título",
    servings: r.raciones && r.raciones > 0 && r.raciones <= 50 ? r.raciones : 4,
    minutes: r.minutos && r.minutos > 0 ? r.minutos : null,
    ingredients: r.ingredientes.slice(0, 60).map(toIngredient),
    steps: opts.keepSteps ? r.pasos.slice(0, 60).map((s) => s.slice(0, 2000)) : [],
    sourceUrl: opts.sourceUrl,
    tags: [],
  };
}

export function draftFromRules(text: string, sourceUrl: string | null = null): RecipeDraft {
  const p = parseRecipeText(text);
  return {
    title: p.title ?? "Plato sin título",
    servings: p.servings ?? 4,
    minutes: p.minutes,
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
    steps: sourceUrl ? [] : p.steps,
    sourceUrl,
    tags: [],
  };
}

/** Texto pegado: IA si está disponible; si no o si falla, reglas. */
export async function extractFromText(
  text: string,
): Promise<{ draft: RecipeDraft; usedAi: boolean }> {
  const ai = await parseStructured({
    schema: AiRecipeSchema,
    system: EXTRACT_SYSTEM,
    content: text,
    maxTokens: 8000,
  });
  if (ai) return { draft: toDraft(ai, { sourceUrl: null, keepSteps: true }), usedAi: true };
  return { draft: draftFromRules(text), usedAi: false };
}

/** Página sin schema.org: solo ingredientes con IA (los pasos del autor no se guardan). */
export async function extractFromPageText(text: string, url: string): Promise<RecipeDraft | null> {
  const ai = await parseStructured({
    schema: AiRecipeSchema,
    system: `${EXTRACT_SYSTEM}\nDe una página web ajena devuelve los pasos vacíos: solo se guardan los ingredientes.`,
    content: text,
    maxTokens: 6000,
  });
  return ai ? toDraft(ai, { sourceUrl: url, keepSteps: false }) : null;
}

/** Foto de una receta en papel, con el modelo de visión. */
export async function extractFromImage(
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  data: string,
): Promise<RecipeDraft | null> {
  const content: UserContent = [
    { type: "image", source: { type: "base64", media_type: mediaType, data } },
    { type: "text", text: "Extrae la receta de esta foto." },
  ];
  const ai = await parseStructured({
    schema: AiRecipeSchema,
    system: EXTRACT_SYSTEM,
    content,
    maxTokens: 8000,
  });
  return ai ? toDraft(ai, { sourceUrl: null, keepSteps: true }) : null;
}

export interface ConstraintViolation {
  ingredient: string;
  reason: string;
}

/**
 * Comprueba un plato contra alérgenos y dietas del perfil. Es lo que garantiza que un plato
 * generado los respete: no se confía en el modelo, se verifica cada ingrediente con la
 * taxonomía. Un ingrediente sin hoja no se puede verificar y cuenta como incumplimiento.
 */
export function checkConstraints(
  draft: RecipeDraft,
  diet: string[],
  allergens: string[],
): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  for (const ing of draft.ingredients) {
    const leaf = ing.leafSlug ? LEAF_BY_SLUG.get(ing.leafSlug) : undefined;
    if (!leaf) {
      out.push({ ingredient: ing.name, reason: "no se puede comprobar" });
      continue;
    }
    const flags = new Set(ing.flags);
    for (const a of leaf.allergens) {
      if (!allergens.includes(a)) continue;
      // "Pan sin gluten" no tiene gluten aunque la hoja lo tenga. "Sin lactosa" no quita el
      // alérgeno: la proteína de la leche sigue ahí.
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

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly violations: ConstraintViolation[] = [],
  ) {
    super(message);
  }
}

/** Plato generado con IA, priorizando lo barato esta semana y verificado contra el perfil. */
export async function generateRecipe(
  req: GenerateRequest,
  cheapLeaves: string[],
): Promise<RecipeDraft> {
  if (!aiAvailable())
    throw new GenerationError("La generación con IA no está disponible en este servidor");
  const cheap = cheapLeaves.map((s) => LEAF_BY_SLUG.get(s)?.name).filter(Boolean);
  const forbidden = [
    ...req.allergens.map((a) => `sin alérgeno ${a}`),
    ...req.diet.map((d) => `apto para dieta ${d}`),
  ];
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = [
      `Propón un plato: ${req.request}`,
      `Raciones: ${req.servings}.`,
      req.maxMinutes ? `Tiempo máximo: ${req.maxMinutes} minutos.` : "",
      forbidden.length ? `Obligatorio: ${forbidden.join(", ")}.` : "",
      cheap.length ? `Esta semana están en oferta: ${cheap.join(", ")}. Úsalos si encajan.` : "",
      "Usa cantidades concretas para todos los ingredientes salvo sal y especias al gusto.",
      feedback,
    ]
      .filter(Boolean)
      .join("\n");
    const ai = await parseStructured({
      schema: AiRecipeSchema,
      system: `${EXTRACT_SYSTEM}\nEres un cocinero que propone platos sencillos y económicos de cocina de casa.`,
      content: user,
      maxTokens: 8000,
      effort: "medium",
    });
    if (!ai) break;
    const draft = {
      ...toDraft(ai, { sourceUrl: null, keepSteps: true }),
      servings: req.servings,
      tags: ["generado"],
    };
    // Marcas del texto ("pan sin gluten") para no rechazar sustitutos válidos.
    draft.ingredients = draft.ingredients.map((i) => ({
      ...i,
      flags: parseIngredientLine(i.raw).flags,
    }));
    const violations = checkConstraints(draft, req.diet, req.allergens);
    if (!violations.length) return draft;
    feedback = `El intento anterior no valía: ${violations.map((v) => `${v.ingredient} (${v.reason})`).join("; ")}. Cámbialo.`;
    if (attempt === 2)
      throw new GenerationError(
        "No se ha podido proponer un plato que respete tu perfil",
        violations,
      );
  }
  throw new GenerationError("La IA no ha devuelto un plato válido");
}
