/** Datos fijos de las cadenas del MVP (docs/DECISIONS.md, H1). */
export const CHAINS = [
  { slug: "mercadona", hasPrices: true },
  { slug: "carrefour", hasPrices: false },
  { slug: "dia", hasPrices: true },
  { slug: "alcampo", hasPrices: true },
] as const;

export type ChainSlug = (typeof CHAINS)[number]["slug"];

/** Códigos postales con precios: Madrid capital. */
export function isCoveredPostalCode(pc: string): boolean {
  if (!/^\d{5}$/.test(pc)) return false;
  const n = Number(pc);
  return n >= 28001 && n <= 28055;
}

export const DIETS = ["vegetariana", "vegana", "sin_gluten", "sin_lactosa"] as const;
export const ALLERGENS = [
  "gluten",
  "crustaceos",
  "huevo",
  "pescado",
  "cacahuete",
  "soja",
  "lacteos",
  "frutos_de_cascara",
  "apio",
  "mostaza",
  "sesamo",
  "sulfitos",
  "altramuces",
  "moluscos",
] as const;
