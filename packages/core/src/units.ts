/** Unidades base del sistema: todo se normaliza a gramos, mililitros o unidades. */
export type BaseUnit = "g" | "ml" | "unit";

export interface Quantity {
  amount: number;
  unit: BaseUnit;
}

/** Datos de un ingrediente que permiten pasar de una unidad base a otra. */
export interface ConversionHints {
  /** Gramos por mililitro. */
  densityGml?: number | null;
  /** Gramos que pesa una unidad (un huevo, una cebolla). */
  unitWeightG?: number | null;
}

const UNIT_ALIASES: Record<string, { base: BaseUnit; factor: number }> = {
  mg: { base: "g", factor: 0.001 },
  g: { base: "g", factor: 1 },
  gr: { base: "g", factor: 1 },
  grs: { base: "g", factor: 1 },
  gramo: { base: "g", factor: 1 },
  gramos: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  kilo: { base: "g", factor: 1000 },
  kilos: { base: "g", factor: 1000 },
  kilogramo: { base: "g", factor: 1000 },
  kilogramos: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  mililitro: { base: "ml", factor: 1 },
  mililitros: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  dl: { base: "ml", factor: 100 },
  l: { base: "ml", factor: 1000 },
  lt: { base: "ml", factor: 1000 },
  litro: { base: "ml", factor: 1000 },
  litros: { base: "ml", factor: 1000 },
  u: { base: "unit", factor: 1 },
  ud: { base: "unit", factor: 1 },
  uds: { base: "unit", factor: 1 },
  unidad: { base: "unit", factor: 1 },
  unidades: { base: "unit", factor: 1 },
  pieza: { base: "unit", factor: 1 },
  piezas: { base: "unit", factor: 1 },
  docena: { base: "unit", factor: 12 },
  docenas: { base: "unit", factor: 12 },
  unit: { base: "unit", factor: 1 },
};

/** Devuelve la unidad base y el factor de una unidad escrita, o null si no se reconoce. */
export function parseUnit(raw: string): { base: BaseUnit; factor: number } | null {
  const key = raw.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? null;
}

/** Convierte una cantidad escrita en cualquier unidad conocida a su unidad base. */
export function toBase(amount: number, rawUnit: string): Quantity | null {
  const parsed = parseUnit(rawUnit);
  if (!parsed) return null;
  return { amount: amount * parsed.factor, unit: parsed.base };
}

/**
 * Convierte entre unidades base. Devuelve null si faltan datos para la conversión
 * (nunca se inventa una densidad o un peso por unidad).
 */
export function convert(q: Quantity, to: BaseUnit, hints: ConversionHints = {}): Quantity | null {
  if (q.unit === to) return { ...q };
  const grams = toGrams(q, hints);
  if (grams === null) return null;
  if (to === "g") return { amount: grams, unit: "g" };
  if (to === "ml") {
    return hints.densityGml ? { amount: grams / hints.densityGml, unit: "ml" } : null;
  }
  return hints.unitWeightG ? { amount: grams / hints.unitWeightG, unit: "unit" } : null;
}

function toGrams(q: Quantity, hints: ConversionHints): number | null {
  switch (q.unit) {
    case "g":
      return q.amount;
    case "ml":
      return hints.densityGml ? q.amount * hints.densityGml : null;
    case "unit":
      return hints.unitWeightG ? q.amount * hints.unitWeightG : null;
  }
}

/** Unidad en la que se expresa el precio por unidad de medida (RD 3423/2000): kg, l o unidad. */
export function unitPriceLabel(unit: BaseUnit): "kg" | "l" | "ud" {
  return unit === "g" ? "kg" : unit === "ml" ? "l" : "ud";
}

/** Precio por kg, litro o unidad a partir de un precio y una cantidad en unidad base. */
export function unitPrice(price: number, q: Quantity): number | null {
  if (q.amount <= 0) return null;
  const perBase = price / q.amount;
  return q.unit === "unit" ? perBase : perBase * 1000;
}
