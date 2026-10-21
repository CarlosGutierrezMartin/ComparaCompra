import type { Offer } from "@comparacompra/core";
import type { CompareLine } from "./api-types";
import { withBase } from "./demo";

/**
 * Catálogo de la demo: lo que exporta `ingest/export_demo.py`, filtrado en el móvil con las
 * mismas reglas que las consultas SQL de `src/server/catalog.ts` (offersForLine,
 * offersForIngredient y unitWeightsForLeaves). Si cambian unas, cambian las otras.
 */

/** [nivel g|e|i, canónico, hoja, variante, marcas, rasgos] */
export type DemoLink = ["g" | "e" | "i", number, string, string | null, string[], string[]];
/** [precio, precio por unidad, texto de promoción, fecha, fuente] */
export type DemoPrice = [number, number | null, string | null, string, string];

export interface DemoProduct {
  id: number;
  chain: string;
  name: string;
  brand: string | null;
  quantity: number | null;
  unit: Offer["unit"];
  unitsPerPack: number;
  url: string;
  links: DemoLink[];
  /** zona -> precio vigente */
  prices: Record<string, DemoPrice>;
}

export interface DemoCatalog {
  version: number;
  pricesUpTo: string | null;
  products: DemoProduct[];
  /** código postal -> cadena -> zona */
  zones: Record<string, Record<string, number>>;
  /** hoja -> gramos por pieza */
  unitWeights: Record<string, number>;
}

let loading: Promise<DemoCatalog> | null = null;

export function loadDemoCatalog(): Promise<DemoCatalog> {
  loading ??= fetch(withBase("/demo/catalogo.json")).then((res) => {
    if (!res.ok) throw new Error(`catálogo de la demo: HTTP ${res.status}`);
    return res.json() as Promise<DemoCatalog>;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

type LineQuery = Pick<
  CompareLine,
  "leafSlug" | "variant" | "flags" | "level" | "identicalCanonicalId" | "preferredBrand"
>;

function linkMatches(link: DemoLink, line: LineQuery): boolean {
  const [level, canonical, leaf, variant, flags, traits] = link;
  if (line.level === "identical" && line.identicalCanonicalId) {
    return level === "i" && canonical === line.identicalCanonicalId;
  }
  if (line.level === "generic") return level === "g" && leaf === line.leafSlug;
  return (
    level === "e" &&
    leaf === line.leafSlug &&
    sameList(flags, [...line.flags].sort()) &&
    traits.length === 0 &&
    (!line.variant || variant === line.variant)
  );
}

/** Igual que offersForLine en el servidor. */
export function demoOffersForLine(
  cat: DemoCatalog,
  line: LineQuery,
  postalCode: string,
  chains: string[],
): Offer[] {
  if (!line.leafSlug && !(line.level === "identical" && line.identicalCanonicalId)) return [];
  const zones = cat.zones[postalCode] ?? {};
  const brand = line.preferredBrand ? norm(line.preferredBrand) : null;
  const out: Offer[] = [];
  for (const p of cat.products) {
    if (!chains.includes(p.chain)) continue;
    const zone = zones[p.chain];
    const price = zone === undefined ? undefined : p.prices[String(zone)];
    if (!price || !p.links.some((l) => linkMatches(l, line))) continue;
    if (brand && !norm(`${p.brand ?? ""} ${p.name}`).includes(brand)) continue;
    const [amount, unitPrice, promoText, checkedAt, source] = price;
    out.push({
      productId: p.id,
      chain: p.chain,
      name: p.name,
      brand: p.brand,
      quantity: p.quantity,
      unit: p.unit,
      unitsPerPack: p.unitsPerPack,
      price: amount,
      unitPrice,
      promoText,
      priceDate: checkedAt,
      source,
      url: p.url,
      level: line.level,
      identicalCanonicalId: p.links.find((l) => l[0] === "i")?.[1] ?? null,
    });
    if (out.length >= 400) break;
  }
  return out;
}

/** Igual que offersForIngredient: equivalentes y, donde no hay, cualquiera de la hoja. */
export function demoOffersForIngredient(
  cat: DemoCatalog,
  ing: { leafSlug: string | null; variant: string | null; flags: string[] },
  postalCode: string,
  chains: string[],
): Offer[] {
  if (!ing.leafSlug) return [];
  const base = { leafSlug: ing.leafSlug, identicalCanonicalId: null, preferredBrand: null };
  const eq = demoOffersForLine(
    cat,
    {
      ...base,
      variant: ing.variant,
      flags: ing.flags as CompareLine["flags"],
      level: "equivalent",
    },
    postalCode,
    chains,
  );
  const missing = chains.filter((c) => !eq.some((o) => o.chain === c));
  if (!missing.length) return eq;
  return [
    ...eq,
    ...demoOffersForLine(
      cat,
      { ...base, variant: null, flags: [], level: "generic" },
      postalCode,
      missing,
    ),
  ];
}

export function demoUnitWeights(cat: DemoCatalog, leaves: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const leaf of leaves) {
    const g = cat.unitWeights[leaf];
    if (g !== undefined) out[leaf] = g;
  }
  return out;
}
