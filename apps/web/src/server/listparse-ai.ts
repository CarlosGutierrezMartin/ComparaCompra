import "server-only";
import { LEAF_BY_SLUG, LEAVES, parseList, type ParsedLine } from "@comparacompra/core";
import { z } from "zod";
import type { ParsedLineDTO } from "@/lib/api-types";
import { parseStructured } from "./ai";

const SLUGS = LEAVES.map((l) => l.slug) as [string, ...string[]];

const AiLineSchema = z.object({
  texto: z.string().describe("la línea tal como la escribió el usuario"),
  producto: z.string().describe("nombre del producto sin cantidades"),
  hoja: z.enum(SLUGS).nullable().describe("slug de la taxonomía o null si ninguno encaja"),
  variante: z.string().nullable(),
  marcas: z.array(
    z.enum(["sin_lactosa", "sin_gluten", "ecologico", "congelado", "sin_azucar", "integral"]),
  ),
  cantidad: z.number().nullable().describe("en g, ml o unidades"),
  unidad: z.enum(["g", "ml", "unit"]).nullable(),
  envases: z.number().nullable().describe("número de envases si la línea los cuenta (3 latas)"),
  personas: z.number().nullable(),
  cantidad_estimada: z
    .boolean()
    .describe("true si la cantidad sale de 'para N personas' y es una estimación"),
});
const AiListSchema = z.object({ lineas: z.array(AiLineSchema) });

const SYSTEM = `Conviertes listas de la compra escritas en español en líneas estructuradas.
Para cada producto: hoja de la taxonomía (slug exacto), variante si la hoja la tiene y el
usuario la dice, marcas que el usuario pide (nunca las supongas), cantidad en g, ml o unidades
si la indica ("2 docenas" = 24 unidades, "medio kilo" = 500 g), envases si cuenta envases.
Si dice "para N personas" sin cantidad, puedes estimar una cantidad razonable y marcar
cantidad_estimada=true. No inventes productos que no estén en la lista.
Hojas disponibles (slug: nombre [variantes]):
${LEAVES.map((l) => `${l.slug}: ${l.name}${l.variants.length ? ` [${l.variants.join(", ")}]` : ""}`).join("\n")}`;

function fromRules(line: ParsedLine): ParsedLineDTO {
  return { ...line };
}

/** Interpreta una lista con IA; si no hay IA o falla, con las reglas deterministas. */
export async function parseListWithAi(
  text: string,
): Promise<{ lines: ParsedLineDTO[]; source: "ia" | "reglas"; notice: string | null }> {
  const rules = parseList(text);
  const ai = await parseStructured({
    schema: AiListSchema,
    system: SYSTEM,
    content: text,
    maxTokens: 6000,
  });
  if (!ai) {
    return { lines: rules.map(fromRules), source: "reglas", notice: null };
  }
  const lines: ParsedLineDTO[] = ai.lineas.map((l) => {
    const leaf = l.hoja ? LEAF_BY_SLUG.get(l.hoja) : undefined;
    return {
      raw: l.texto,
      label: l.producto,
      leafSlug: leaf?.slug ?? null,
      // Solo variantes que existen en la hoja: no se aceptan inventos de la IA.
      variant: leaf && l.variante && leaf.variants.includes(l.variante) ? l.variante : null,
      flags: [...new Set(l.marcas)],
      quantity: l.cantidad && l.cantidad > 0 ? l.cantidad : null,
      unit: l.cantidad && l.cantidad > 0 ? l.unidad : null,
      packs: l.envases && l.envases > 0 ? l.envases : null,
      people: l.personas && l.personas > 0 ? l.personas : null,
      level: "equivalent",
      confidence: leaf ? 0.9 : 0,
      estimated: l.cantidad_estimada,
    };
  });
  return { lines, source: "ia", notice: null };
}
