import taxonomy from "./data/taxonomy.json";
import type { BaseUnit } from "./units";

/**
 * Intérprete determinista de listas escritas ("2 docenas de huevos, leche sin lactosa,
 * pechuga para 4"). Usa las mismas palabras clave que el clasificador de productos de la
 * ingesta (ingest/matching/classify_rules.py), exportadas en data/taxonomy.json.
 * La IA lo mejora en el servidor, pero la app funciona sin ella y sin conexión.
 */

export interface TaxonomyLeaf {
  slug: string;
  name: string;
  section: string;
  subsection: string;
  unit: BaseUnit;
  variants: string[];
  aliases: string[];
  keywords: string[];
  allergens: string[];
  notFor: string[];
}

export const LEAVES = taxonomy.leaves as TaxonomyLeaf[];
export const LEAF_BY_SLUG = new Map(LEAVES.map((l) => [l.slug, l]));

export type Flag =
  "sin_lactosa" | "sin_gluten" | "ecologico" | "congelado" | "sin_azucar" | "integral";

export interface ParsedLine {
  raw: string;
  /** Texto del producto sin cantidades. */
  label: string;
  leafSlug: string | null;
  variant: string | null;
  flags: Flag[];
  /** Cantidad en unidad base (g, ml, unidades), si la lista la indica. */
  quantity: number | null;
  unit: BaseUnit | null;
  /** Número de envases pedidos ("6 latas de atún"). */
  packs: number | null;
  /** "para 4": personas, sin convertir a cantidad (no se inventa). */
  people: number | null;
  level: "equivalent";
  confidence: number;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  veinte: 20,
  medio: 0.5,
  media: 0.5,
};

const UNITS: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  gramo: { unit: "g", factor: 1 },
  gramos: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  kilo: { unit: "g", factor: 1000 },
  kilos: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  l: { unit: "ml", factor: 1000 },
  litro: { unit: "ml", factor: 1000 },
  litros: { unit: "ml", factor: 1000 },
  docena: { unit: "unit", factor: 12 },
  docenas: { unit: "unit", factor: 12 },
};

const CONTAINERS = new Set([
  "paquete",
  "paquetes",
  "bolsa",
  "bolsas",
  "botella",
  "botellas",
  "lata",
  "latas",
  "brick",
  "bricks",
  "tarro",
  "tarros",
  "bote",
  "botes",
  "caja",
  "cajas",
  "pack",
  "packs",
  "barra",
  "barras",
  "malla",
  "mallas",
  "bandeja",
  "bandejas",
  "unidad",
  "unidades",
  "ud",
  "uds",
]);

const FLAG_PATTERNS: [Flag, RegExp][] = [
  ["sin_lactosa", /\bsin lactosa\b/],
  ["sin_gluten", /\bsin gluten\b/],
  ["ecologico", /\becologic[oa]s?\b|\bbio\b|\beco\b/],
  ["congelado", /\bcongelad[oa]s?\b/],
  ["sin_azucar", /\bsin azucar\b|\bzero\b/],
  ["integral", /\bintegral(es)?\b/],
];

const MODIFIERS = new Set(["con", "en", "al", "sabor", "estilo"]);

export function detectFlags(text: string): Flag[] {
  const t = normalize(text);
  return FLAG_PATTERNS.filter(([, rx]) => rx.test(t)).map(([f]) => f);
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ%.,/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(word: string): string {
  const c3 = word.at(-3) ?? "";
  const c4 = word.at(-4) ?? "";
  // "melones" -> "melon", pero "noodles" -> "noodle" y "verdes" -> "verde".
  if (
    word.length > 4 &&
    word.endsWith("es") &&
    c3 &&
    "lnrd".includes(c3) &&
    c4 &&
    "aeiou".includes(c4)
  ) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9ñ%]+/)
    .filter(Boolean)
    .map(singular);
}

function find(phrase: string[], ws: string[]): number | null {
  outer: for (let i = 0; i + phrase.length <= ws.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (ws[i + j] !== phrase[j]) continue outer;
    return i;
  }
  return null;
}

const PHRASES = new Map(
  LEAVES.map((l) => [l.slug, (l.keywords.length ? l.keywords : [l.name]).map(words)]),
);

/** Hoja de la taxonomía que mejor describe un texto libre. */
export function matchLeaf(text: string): { slug: string; confidence: number } | null {
  const ws = words(text);
  let head = ws.length;
  ws.forEach((w, i) => {
    if (i > 0 && head === ws.length && MODIFIERS.has(w)) head = i;
  });
  const scored: [number, string][] = [];
  for (const [slug, phrases] of PHRASES) {
    let best = 0;
    for (const phrase of phrases) {
      const pos = find(phrase, ws);
      if (pos === null) {
        if (phrase.length > 1 && phrase.every((w) => ws.slice(0, head).includes(w)))
          best = Math.max(best, 2.5 * phrase.length + 2);
        continue;
      }
      let score = 3 * phrase.length + Math.max(0, 3 - pos);
      if (pos + phrase.length <= head) score += 5;
      best = Math.max(best, score);
    }
    if (best) scored.push([best, slug]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const first = scored[0];
  if (!first) return null;
  const [top, slug] = first;
  const second = scored[1]?.[0] ?? 0;
  return { slug, confidence: Math.min(1, 0.6 + ((top - second) / top) * 0.5) };
}

export function detectVariant(leaf: TaxonomyLeaf, text: string): string | null {
  const ws = words(text);
  let best: [number, string] | null = null;
  for (const v of leaf.variants) {
    const pos = find(words(v), ws);
    if (pos !== null && (best === null || pos < best[0])) best = [pos, v];
  }
  return best?.[1] ?? null;
}

export function parseNumber(token: string | undefined): number | null {
  if (!token) return null;
  const word = NUMBER_WORDS[token];
  if (word !== undefined) return word;
  const n = Number(token.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Separa una lista escrita en líneas: saltos de línea, punto y coma y comas (no decimales). */
export function splitList(text: string): string[] {
  return text
    .split(/\n|;|,(?!\d)|\s+y\s+(?=\d|un[oa]?\s|dos\s|tres\s)/i)
    .map((s) => s.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim())
    .filter((s) => s.length > 1);
}

export function parseLine(raw: string): ParsedLine {
  let t = normalize(raw);
  let quantity: number | null = null;
  let unit: BaseUnit | null = null;
  let packs: number | null = null;
  let people: number | null = null;

  const NUM = `\\d+|${Object.keys(NUMBER_WORDS).join("|")}`;
  const peopleRx = new RegExp(`\\bpara (${NUM})( personas?)?\\b`);
  const para = peopleRx.exec(t);
  if (para) {
    people = parseNumber(para[1]);
    t = t.replace(para[0], " ");
  }

  // "1/2 kg", "medio kilo", "2 docenas", "1,5 l", "3 latas", "un cuarto de kilo"
  const quarter = /\b(un )?cuarto( de)? (kg|kilo)\b/.exec(t);
  if (quarter) {
    quantity = 250;
    unit = "g";
    t = t.replace(quarter[0], " ");
  } else {
    const m =
      /^(\d+(?:[.,]\d+)?|\d+\/\d+|[a-z]+)\s*(kg|kilos?|gr?|gramos?|ml|cl|l|litros?|docenas?)?\b\s*(?:de\s+)?/.exec(
        t,
      );
    const token = m?.[1];
    if (m && token) {
      const [numerator, denominator] = token.split("/");
      const num = denominator ? Number(numerator) / Number(denominator) : parseNumber(token);
      if (num !== null && (m[2] || /^\d/.test(token) || token in NUMBER_WORDS)) {
        if (m[2]) {
          const u = UNITS[m[2]] ?? null;
          if (u) {
            quantity = num * u.factor;
            unit = u.unit;
          }
          t = t.slice(m[0].length);
        } else {
          // Número suelto: recuento de envases ("3 latas de atún") o de unidades ("6 huevos").
          const rest = t.slice(m[0].length).split(" ");
          if (CONTAINERS.has(rest[0] ?? "")) {
            packs = num;
            t = rest
              .slice(1)
              .join(" ")
              .replace(/^de\s+/, "");
          } else {
            const leaf = matchLeaf(t.slice(m[0].length));
            if (leaf && LEAF_BY_SLUG.get(leaf.slug)?.unit === "unit") {
              quantity = num;
              unit = "unit";
            } else {
              packs = num;
            }
            t = t.slice(m[0].length);
          }
        }
      }
    }
  }

  const label = t.replace(/\s+/g, " ").trim();
  const match = matchLeaf(label);
  const display = displayLabel(raw, label);
  const leaf = match ? (LEAF_BY_SLUG.get(match.slug) ?? null) : null;
  const flags = detectFlags(label);
  return {
    raw,
    label: display,
    leafSlug: leaf?.slug ?? null,
    variant: leaf ? detectVariant(leaf, label) : null,
    flags,
    quantity,
    unit,
    packs,
    people,
    level: "equivalent",
    confidence: match?.confidence ?? 0,
  };
}

/**
 * Etiqueta para mostrar: el texto original (con tildes y mayúsculas) sin la cantidad.
 * Se buscan en el original las palabras que quedaron tras quitar la cantidad.
 */
function displayLabel(raw: string, normalizedLabel: string): string {
  const original = raw.trim().replace(/\s+/g, " ");
  const firstWord = normalizedLabel.split(" ")[0];
  if (!firstWord) return original;
  const tokens = original.split(" ");
  const start = tokens.findIndex((tok) => normalize(tok) === firstWord);
  if (start < 0) return original;
  const kept = tokens.slice(start).join(" ");
  // Quita "para 4 (personas)" del final si se interpretó como personas.
  return kept
    .replace(/\s+para\s+\S+(\s+personas?)?$/i, (m) =>
      /\d|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez/i.test(m) ? "" : m,
    )
    .trim();
}

export function parseList(text: string): ParsedLine[] {
  return splitList(text).map(parseLine);
}
