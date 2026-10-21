import {
  detectFlags,
  detectVariant,
  LEAF_BY_SLUG,
  matchLeaf,
  normalize,
  parseNumber,
  type Flag,
} from "./listparse";
import type { BaseUnit } from "./units";

/**
 * Intérprete determinista de recetas en texto: ingredientes con cantidad y unidad, pasos,
 * raciones y tiempo. Es la alternativa sin IA (y sin conexión) a la extracción con IA.
 */

export interface ParsedIngredient {
  raw: string;
  name: string;
  leafSlug: string | null;
  variant: string | null;
  flags: Flag[];
  quantity: number | null;
  unit: BaseUnit | null;
  optional: boolean;
  confidence: number;
}

export interface ParsedRecipe {
  title: string | null;
  servings: number | null;
  minutes: number | null;
  ingredients: ParsedIngredient[];
  steps: string[];
}

// Medidas de cocina con equivalencia métrica normalizada (cucharada 15 ml, cucharadita 5 ml).
const UNIT_WORDS: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  grs: { unit: "g", factor: 1 },
  gramo: { unit: "g", factor: 1 },
  gramos: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  kilo: { unit: "g", factor: 1000 },
  kilos: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  dl: { unit: "ml", factor: 100 },
  l: { unit: "ml", factor: 1000 },
  litro: { unit: "ml", factor: 1000 },
  litros: { unit: "ml", factor: 1000 },
  cucharada: { unit: "ml", factor: 15 },
  cucharadas: { unit: "ml", factor: 15 },
  cda: { unit: "ml", factor: 15 },
  cdas: { unit: "ml", factor: 15 },
  cucharadita: { unit: "ml", factor: 5 },
  cucharaditas: { unit: "ml", factor: 5 },
  cdta: { unit: "ml", factor: 5 },
  cdtas: { unit: "ml", factor: 5 },
  unidad: { unit: "unit", factor: 1 },
  unidades: { unit: "unit", factor: 1 },
  ud: { unit: "unit", factor: 1 },
  uds: { unit: "unit", factor: 1 },
  diente: { unit: "unit", factor: 1 },
  dientes: { unit: "unit", factor: 1 },
  docena: { unit: "unit", factor: 12 },
};
// Recipientes: la cantidad real se lee del paréntesis si lo hay ("1 lata de tomate (400 g)").
const CONTAINERS =
  /^(lata|latas|bote|botes|brick|bricks|paquete|paquetes|sobre|sobres|tarro|tarros|vaso|vasos|taza|tazas|manojo|manojos|ramita|ramitas|pizca|chorro|chorrito)$/;

const SECTION_INGREDIENTS = /^\s*ingredientes\b/i;
const SECTION_STEPS =
  /^\s*(preparaci[oó]n|elaboraci[oó]n|pasos|instrucciones|modo de preparaci[oó]n)\b/i;
const OPTIONAL = /\b(al gusto|opcional|si se desea|para decorar|para servir)\b/;
const SERVINGS =
  /\b(\d+)\s*(raciones|personas|comensales|porciones)\b|\bpara\s+(\d+)\s*(personas)?\b/i;
const MINUTES = /\b(\d+)\s*(min|minutos)\b|\b(\d+(?:[.,]\d+)?)\s*(h|horas?)\b/i;

function grams(text: string): { quantity: number; unit: BaseUnit } | null {
  const m = /\((?:unos\s+)?(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|l|cl)\)/.exec(text);
  if (!m?.[1] || !m[2]) return null;
  const u = UNIT_WORDS[m[2]];
  if (!u) return null;
  return { quantity: Number(m[1].replace(",", ".")) * u.factor, unit: u.unit };
}

export function parseIngredientLine(raw: string): ParsedIngredient {
  // La cantidad entre paréntesis se lee antes de normalizar (que quita los paréntesis).
  const inParens = grams(raw.toLowerCase());
  let t = normalize(raw.replace(/^\s*[-*•·]\s*/, "").replace(/\([^)]*\)/g, " "));
  const optional = OPTIONAL.test(t);
  t = t.replace(OPTIONAL, " ").replace(/\s+/g, " ").trim();

  let quantity: number | null = null;
  let unit: BaseUnit | null = null;
  // "1 1/2", "1/2", "1,5", "dos", "medio"
  const m = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[a-z]+)\s+(?:([a-z]+)\s+)?(?:de\s+)?/.exec(
    `${t} `,
  );
  if (m?.[1]) {
    const token = m[1];
    let num: number | null;
    if (/^\d+\s+\d+\/\d+$/.test(token)) {
      const [whole = "0", frac = "0/1"] = token.split(/\s+/);
      const [a = "0", b = "1"] = frac.split("/");
      num = Number(whole) + Number(a) / Number(b);
    } else if (token.includes("/")) {
      const [a = "0", b = "1"] = token.split("/");
      num = Number(a) / Number(b);
    } else {
      num = parseNumber(token);
    }
    const word = m[2];
    if (num !== null) {
      const u = word ? UNIT_WORDS[word] : undefined;
      if (u) {
        quantity = num * u.factor;
        unit = u.unit;
        t = t.slice(m[0].length);
      } else if (word && CONTAINERS.test(word)) {
        t = t.slice(m[0].length);
        if (inParens) {
          quantity = num * inParens.quantity;
          unit = inParens.unit;
        }
      } else {
        // "2 cebollas", "4 huevos": unidades del propio ingrediente.
        quantity = num;
        unit = "unit";
        t = t
          .slice(m[1].length)
          .trim()
          .replace(/^de\s+/, "");
      }
    }
  }
  if (quantity === null && inParens) {
    quantity = inParens.quantity;
    unit = inParens.unit;
  }
  const name = t.replace(/[.,;:]+$/, "").trim();
  const match = matchLeaf(name);
  const leaf = match ? (LEAF_BY_SLUG.get(match.slug) ?? null) : null;
  return {
    raw: raw.trim(),
    name,
    leafSlug: leaf?.slug ?? null,
    variant: leaf ? detectVariant(leaf, name) : null,
    flags: detectFlags(name),
    quantity: quantity !== null && quantity > 0 ? quantity : null,
    unit: quantity !== null && quantity > 0 ? unit : null,
    optional,
    confidence: match?.confidence ?? 0,
  };
}

/** "sal y pimienta" son dos ingredientes; "aceite de oliva" no. */
function splitCompound(line: string): string[] {
  const n = normalize(line);
  if (/^\d/.test(n) || !/\s+y\s+/.test(n)) return [line];
  const parts = line.split(/\s+y\s+/i);
  return parts.every((p) => matchLeaf(p) !== null) ? parts : [line];
}

export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  let title: string | null = null;
  const ingredientLines: string[] = [];
  const steps: string[] = [];
  let section: "head" | "ingredients" | "steps" = "head";
  const hasHeaders = nonEmpty.some((l) => SECTION_INGREDIENTS.test(l));

  for (const line of nonEmpty) {
    if (SECTION_INGREDIENTS.test(line)) {
      section = "ingredients";
      const rest = line
        .replace(SECTION_INGREDIENTS, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/^[^a-z0-9]*/i, "");
      if (rest.length > 2 && !/^para\s+\d/i.test(rest)) ingredientLines.push(...rest.split(/,\s*/));
      continue;
    }
    if (SECTION_STEPS.test(line)) {
      section = "steps";
      continue;
    }
    if (section === "head") {
      if (!hasHeaders && /^\s*(?:[-*•·]|\d+(?:[.,/]\d+)?\s)/.test(line)) {
        ingredientLines.push(line);
        section = "ingredients";
      } else if (!title) {
        title = line.replace(/[.:]+$/, "");
      }
      continue;
    }
    if (section === "ingredients") {
      // Sin cabecera de pasos, una frase larga marca el inicio de la preparación.
      if (!hasHeaders && line.length > 60 && !/^\s*[-*•·\d]/.test(line)) {
        section = "steps";
        steps.push(line);
      } else {
        ingredientLines.push(line);
      }
      continue;
    }
    steps.push(line.replace(/^\s*(\d+[.)]|[-*•·])\s*/, ""));
  }

  const servingsMatch = SERVINGS.exec(text);
  const minutesMatch = MINUTES.exec(text);
  let minutes: number | null = null;
  if (minutesMatch?.[1]) minutes = Number(minutesMatch[1]);
  else if (minutesMatch?.[3]) minutes = Math.round(Number(minutesMatch[3].replace(",", ".")) * 60);

  return {
    title,
    servings: servingsMatch ? Number(servingsMatch[1] ?? servingsMatch[3]) : null,
    minutes,
    ingredients: ingredientLines
      .flatMap(splitCompound)
      .filter((l) => l.length > 1)
      .map(parseIngredientLine),
    steps,
  };
}
