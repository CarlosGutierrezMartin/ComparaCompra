import { parsePromoText, promoCost, type Promo } from "./promo";
import type { BaseUnit } from "./units";

/**
 * Motor de la cesta (docs/SPEC.md, F1, y documento de viabilidad, "Algoritmo de la cesta").
 *
 * Para cada línea y cadena se elige el producto que cubre la cantidad pedida al menor coste,
 * con envases enteros y promociones. Después se enumeran todas las tiendas únicas y todas
 * las parejas de tiendas: con 4 cadenas son 4 + 6 combinaciones, solución exacta en
 * microsegundos. Funciones puras, sin red.
 */

export type EquivalenceLevel = "identical" | "equivalent" | "generic";

export interface Offer {
  productId: number;
  chain: string;
  name: string;
  brand: string | null;
  /** Contenido de una unidad del envase, en unidad base. */
  quantity: number | null;
  unit: BaseUnit | null;
  unitsPerPack: number;
  price: number;
  /** Precio por kg, litro o unidad publicado o calculado. */
  unitPrice: number | null;
  promoText: string | null;
  promo?: Promo;
  /** Fecha de la última captura que confirmó el precio. */
  priceDate: string;
  source: string;
  url: string;
  level: EquivalenceLevel;
  /** Canónico idéntico del producto, para pedir "este producto exactamente". */
  identicalCanonicalId?: number | null;
}

export interface BasketLine {
  id: string;
  label: string;
  /** Cantidad pedida en unidad base; null = un envase del producto elegido. */
  quantity: number | null;
  unit: BaseUnit | null;
  /** Número de envases pedido ("3 latas de atún"); manda sobre quantity. */
  packs?: number | null;
  offers: Offer[];
}

export interface CompareOptions {
  chains: string[];
  maxStores: 1 | 2;
  /** Coste fijo por tienda (envío, desplazamiento), en euros. */
  fixedCostPerStore: number;
}

export interface LineChoice {
  lineId: string;
  chain: string;
  offer: Offer;
  packs: number;
  cost: number;
  /** Envases que conviene llevar por la promoción si cuestan lo mismo que los necesarios. */
  promoHint: string | null;
}

export interface ChainTotal {
  chain: string;
  total: number;
  covered: number;
  missing: string[];
  lines: LineChoice[];
}

export interface Plan {
  chains: string[];
  /** Suma de las líneas, sin coste fijo. */
  total: number;
  /** total + coste fijo por tienda. */
  totalWithFixed: number;
  covered: number;
  missing: string[];
  lines: LineChoice[];
}

export interface LineQuantity {
  quantity: number | null;
  unit: BaseUnit | null;
  /** true si la lista no daba cantidad y se usa la de referencia (mediana de los formatos). */
  reference: boolean;
}

export interface CompareResult {
  perChain: ChainTotal[];
  bestSingle: Plan | null;
  bestPair: Plan | null;
  /** Ahorro de repartir la compra frente a la mejor tienda única, ya con costes fijos. */
  pairSavings: number | null;
  /** Líneas sin precio en ninguna de las cadenas elegidas. */
  unavailable: string[];
  lineCount: number;
  quantities: Record<string, LineQuantity>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function packContent(o: Offer): number | null {
  return o.quantity !== null && o.quantity > 0 ? o.quantity * o.unitsPerPack : null;
}

/** Envases necesarios de una oferta para cubrir la cantidad pedida (null si no es comparable). */
export function packsNeeded(line: BasketLine, offer: Offer): number | null {
  if (line.packs && line.packs > 0) return Math.ceil(line.packs);
  if (line.quantity === null || line.quantity <= 0) return 1;
  const content = packContent(offer);
  if (content === null || offer.unit !== line.unit) {
    // Sin formato comparable solo se puede comprar un envase, y solo si no se pidió cantidad.
    return null;
  }
  // Tolerancia del 1 % para no comprar un envase de más por redondeos (999 g frente a 1 kg).
  return Math.max(1, Math.ceil(line.quantity / content - 0.01));
}

export function bestOfferInChain(line: BasketLine, chain: string): LineChoice | null {
  let best: LineChoice | null = null;
  for (const offer of line.offers) {
    if (offer.chain !== chain) continue;
    const packs = packsNeeded(line, offer);
    if (packs === null) continue;
    const promo = offer.promo ?? parsePromoText(offer.promoText);
    let cost = promoCost(offer.price, packs, promo);
    let promoHint: string | null = null;
    if (promo.type === "nxm" && packs % promo.n !== 0) {
      const more = Math.ceil(packs / promo.n) * promo.n;
      if (promoCost(offer.price, more, promo) <= cost + 1e-9) {
        promoHint = `Con la promoción ${promo.n}x${promo.m}, ${more} cuestan lo mismo que ${packs}.`;
      }
    }
    cost = round2(cost);
    if (
      best === null ||
      cost < best.cost - 1e-9 ||
      // Empate: el de menor precio por unidad, y luego el de menos envases.
      (Math.abs(cost - best.cost) < 1e-9 && packs < best.packs)
    ) {
      best = { lineId: line.id, chain, offer, packs, cost, promoHint };
    }
  }
  return best;
}

function planFor(
  chains: string[],
  lines: BasketLine[],
  table: Map<string, Map<string, LineChoice>>,
  fixed: number,
): Plan {
  const choices: LineChoice[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    let best: LineChoice | null = null;
    for (const chain of chains) {
      const c = table.get(line.id)?.get(chain);
      if (c && (best === null || c.cost < best.cost)) best = c;
    }
    if (best) choices.push(best);
    else missing.push(line.id);
  }
  // Una tienda que no aporta ninguna línea no se visita.
  const used = chains.filter((ch) => choices.some((c) => c.chain === ch));
  const total = round2(choices.reduce((s, c) => s + c.cost, 0));
  return {
    chains: used.length ? used : chains,
    total,
    totalWithFixed: round2(total + fixed * Math.max(1, used.length)),
    covered: choices.length,
    missing,
    lines: choices,
  };
}

/** Mejor plan: primero el que cubre más líneas, después el más barato con costes fijos. */
function better(a: Plan, b: Plan | null): boolean {
  if (b === null) return true;
  if (a.covered !== b.covered) return a.covered > b.covered;
  return a.totalWithFixed < b.totalWithFixed - 1e-9;
}

/**
 * Sin cantidad en la lista, comparar "un envase" premia al envase más pequeño. Se compara
 * una cantidad de referencia: la mediana del contenido de los envases disponibles.
 */
export function withReferenceQuantity(line: BasketLine): {
  line: BasketLine;
  quantity: LineQuantity;
} {
  if (line.quantity !== null || (line.packs ?? 0) > 0) {
    return { line, quantity: { quantity: line.quantity, unit: line.unit, reference: false } };
  }
  const byUnit = new Map<BaseUnit, number[]>();
  for (const o of line.offers) {
    const content = packContent(o);
    if (content !== null && o.unit) byUnit.set(o.unit, [...(byUnit.get(o.unit) ?? []), content]);
  }
  let best: [BaseUnit, number[]] | null = null;
  for (const entry of byUnit) if (!best || entry[1].length > best[1].length) best = entry;
  if (!best) return { line, quantity: { quantity: null, unit: null, reference: false } };
  const sorted = [...best[1]].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
  return {
    line: { ...line, quantity: median, unit: best[0] },
    quantity: { quantity: median, unit: best[0], reference: true },
  };
}

export function compareBasket(input: BasketLine[], options: CompareOptions): CompareResult {
  const chains = [...new Set(options.chains)];
  const quantities: Record<string, LineQuantity> = {};
  const lines = input.map((l) => {
    const { line, quantity } = withReferenceQuantity(l);
    quantities[l.id] = quantity;
    return line;
  });
  const table = new Map<string, Map<string, LineChoice>>();
  for (const line of lines) {
    const row = new Map<string, LineChoice>();
    for (const chain of chains) {
      const c = bestOfferInChain(line, chain);
      if (c) row.set(chain, c);
    }
    table.set(line.id, row);
  }
  const unavailable = lines.filter((l) => (table.get(l.id)?.size ?? 0) === 0).map((l) => l.id);

  const perChain: ChainTotal[] = chains.map((chain) => {
    const plan = planFor([chain], lines, table, options.fixedCostPerStore);
    return {
      chain,
      total: plan.total,
      covered: plan.covered,
      missing: plan.missing,
      lines: plan.lines,
    };
  });

  let bestSingle: Plan | null = null;
  for (const chain of chains) {
    const plan = planFor([chain], lines, table, options.fixedCostPerStore);
    if (plan.covered > 0 && better(plan, bestSingle)) bestSingle = plan;
  }

  let bestPair: Plan | null = null;
  if (options.maxStores >= 2) {
    for (const [i, a] of chains.entries()) {
      for (const b of chains.slice(i + 1)) {
        const plan = planFor([a, b], lines, table, options.fixedCostPerStore);
        if (plan.covered > 0 && plan.chains.length === 2 && better(plan, bestPair)) bestPair = plan;
      }
    }
  }

  let pairSavings: number | null = null;
  if (bestSingle && bestPair) {
    const savings = round2(bestSingle.totalWithFixed - bestPair.totalWithFixed);
    // Solo se sugiere repartir si cubre lo mismo o más y ahorra de verdad.
    if (bestPair.covered >= bestSingle.covered && savings > 0) pairSavings = savings;
    else if (bestPair.covered <= bestSingle.covered) bestPair = null;
  }

  return {
    perChain,
    bestSingle,
    bestPair,
    pairSavings,
    unavailable,
    lineCount: lines.length,
    quantities,
  };
}
