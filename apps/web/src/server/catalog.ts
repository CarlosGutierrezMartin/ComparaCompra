import "server-only";
import type { BaseUnit, Offer } from "@comparacompra/core";
import type { CompareLine } from "@/lib/api-types";
import { getSql } from "./db";

export class CatalogUnavailableError extends Error {
  constructor() {
    super("El catálogo no está disponible en este servidor (falta DATABASE_URL)");
  }
}

function sqlOrThrow() {
  const sql = getSql();
  if (!sql) throw new CatalogUnavailableError();
  return sql;
}

export interface ZoneInfo {
  chain: string;
  name: string;
  zone: string;
  zoneName: string | null;
  products: number;
  lastCheckedAt: string | null;
}

/** Zonas de precio de cada cadena para un código postal y cuántos precios vigentes tienen. */
export async function zonesForPostalCode(postalCode: string): Promise<ZoneInfo[]> {
  const sql = sqlOrThrow();
  const rows = await sql<
    {
      slug: string;
      name: string;
      external_ref: string;
      zone_name: string | null;
      products: number;
      last: Date | null;
    }[]
  >`
    select c.slug, c.name, z.external_ref, z.name as zone_name,
           count(p.id)::int as products, max(p.checked_at) as last
    from public.postal_code_zone pcz
    join public.chain c on c.id = pcz.chain_id
    join public.price_zone z on z.id = pcz.price_zone_id
    left join public.price p on p.price_zone_id = z.id and p.valid_to is null
    where pcz.postal_code = ${postalCode}
    group by c.slug, c.name, z.external_ref, z.name
    order by c.slug`;
  return rows.map((r) => ({
    chain: r.slug,
    name: r.name,
    zone: r.external_ref,
    zoneName: r.zone_name,
    products: r.products,
    lastCheckedAt: r.last ? r.last.toISOString() : null,
  }));
}

// Los bigint de Postgres llegan como texto: se convierten a número al mapear.
interface OfferRow {
  product_id: string;
  chain: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  unit: BaseUnit | null;
  units_per_pack: number;
  url: string;
  price: string;
  unit_price: string | null;
  promo: { type?: string; text?: string; previous_price?: string } | null;
  checked_at: Date;
  source: string;
  identical_canonical_id: string | null;
}

function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Productos que sirven para una línea en las cadenas pedidas, con su precio vigente en la
 * zona del código postal. El nivel decide qué productos valen:
 * - idéntico: los enlazados al canónico idéntico elegido;
 * - equivalente: misma hoja, variante (si se pidió) y marcas, sin rasgos diferenciadores;
 * - genérico: cualquier producto de la hoja.
 */
export async function offersForLine(
  line: CompareLine,
  postalCode: string,
  chains: string[],
): Promise<Offer[]> {
  const sql = sqlOrThrow();
  if (!line.leafSlug && !(line.level === "identical" && line.identicalCanonicalId)) return [];
  const flags = sql.json([...line.flags].sort());

  const canonicalFilter =
    line.level === "identical" && line.identicalCanonicalId
      ? sql`cn.id = ${line.identicalCanonicalId} and e.level = 'identical'`
      : line.level === "generic"
        ? sql`cn.key = ${"g:" + line.leafSlug} and e.level = 'generic'`
        : sql`cat.slug = ${line.leafSlug} and cn.level = 'equivalent' and e.level = 'equivalent'
              and coalesce(cn.attributes->'flags', '[]'::jsonb) = ${flags}
              and coalesce(cn.attributes->'traits', '[]'::jsonb) = '[]'::jsonb
              ${line.variant ? sql`and cn.attributes->>'variant' = ${line.variant}` : sql``}`;

  const rows = await sql<OfferRow[]>`
    select distinct on (p.id)
      p.id as product_id, ch.slug as chain, p.name, p.brand, p.quantity, p.unit, p.units_per_pack,
      p.url, pr.price, pr.unit_price, pr.promo, pr.checked_at, pr.source,
      (select e2.product_canonical_id from public.equivalence e2
         where e2.product_chain_id = p.id and e2.level = 'identical' limit 1) as identical_canonical_id
    from public.product_canonical cn
    join public.category cat on cat.id = cn.category_id
    join public.equivalence e on e.product_canonical_id = cn.id
    join public.product_chain p on p.id = e.product_chain_id and p.active
    join public.chain ch on ch.id = p.chain_id
    join public.postal_code_zone pcz on pcz.chain_id = p.chain_id and pcz.postal_code = ${postalCode}
    join public.price pr on pr.product_chain_id = p.id and pr.price_zone_id = pcz.price_zone_id
                        and pr.valid_to is null
    where ch.slug = any(${chains}) and ${canonicalFilter}
    order by p.id
    limit 400`;

  const brand = line.preferredBrand ? norm(line.preferredBrand) : null;
  return rows
    .filter((r) => !brand || norm(`${r.brand ?? ""} ${r.name}`).includes(brand))
    .map((r) => ({
      productId: Number(r.product_id),
      chain: r.chain,
      name: r.name,
      brand: r.brand,
      quantity: r.quantity === null ? null : Number(r.quantity),
      unit: r.unit,
      unitsPerPack: r.units_per_pack,
      price: Number(r.price),
      unitPrice: r.unit_price === null ? null : Number(r.unit_price),
      promoText: r.promo?.text ?? null,
      priceDate: r.checked_at.toISOString(),
      source: r.source,
      url: r.url,
      level: line.level,
      identicalCanonicalId:
        r.identical_canonical_id === null ? null : Number(r.identical_canonical_id),
    }));
}

/**
 * Peso de una pieza de una hoja ("Patata" 230 g, "Pimiento rojo unidad 350 g aprox.") según
 * los productos que las cadenas venden por pieza. Mediana de esos productos; null si no hay.
 */
export async function unitWeightsForLeaves(
  leaves: string[],
): Promise<Map<string, { grams: number; chains: string[] }>> {
  const sql = sqlOrThrow();
  if (!leaves.length) return new Map();
  const rows = await sql<{ leaf: string; grams: string; chains: string[] }[]>`
    select cat.slug as leaf,
           percentile_cont(0.5) within group (order by p.quantity) as grams,
           array_agg(distinct ch.slug) as chains
    from public.product_canonical cn
    join public.category cat on cat.id = cn.category_id
    join public.equivalence e on e.product_canonical_id = cn.id and e.level = 'generic'
    join public.product_chain p on p.id = e.product_chain_id and p.active
    join public.chain ch on ch.id = p.chain_id
    where cn.level = 'generic' and cat.slug = any(${leaves})
      -- Solo fruta y verdura se venden por pieza.
      and cat.aisle in ('Fruta', 'Verdura')
      and p.unit = 'g' and p.units_per_pack = 1 and p.quantity > 0 and p.quantity < 600
      and (
        p.name ~* '\\m(unidad|pieza)\\M'
        -- Mercadona nombra en singular y sin formato lo que vende por pieza ("Patata", "Limón").
        or (ch.slug = 'mercadona' and p.name !~ '\\d' and p.name !~* 's$'
            and array_length(regexp_split_to_array(p.name, '\\s+'), 1) <= 3)
      )
    group by cat.slug`;
  return new Map(rows.map((r) => [r.leaf, { grams: Number(r.grams), chains: r.chains }]));
}

/** Hojas con promociones esta semana en la zona del código postal (para generar platos baratos). */
export async function leavesOnPromotion(postalCode: string, limit = 40): Promise<string[]> {
  const sql = sqlOrThrow();
  const rows = await sql<{ slug: string }[]>`
    select cat.slug
    from public.price pr
    join public.postal_code_zone pcz on pcz.price_zone_id = pr.price_zone_id and pcz.postal_code = ${postalCode}
    join public.equivalence e on e.product_chain_id = pr.product_chain_id and e.level = 'generic'
    join public.product_canonical cn on cn.id = e.product_canonical_id
    join public.category cat on cat.id = cn.category_id
    where pr.valid_to is null and pr.promo is not null
    group by cat.slug
    order by count(*) desc
    limit ${limit}`;
  return rows.map((r) => r.slug);
}

/** EAN de los productos de cadena que lo tengan. */
export async function eansForProducts(ids: number[]): Promise<Map<number, string>> {
  const sql = sqlOrThrow();
  if (!ids.length) return new Map();
  const rows = await sql<{ id: number; ean: string }[]>`
    select id, ean from public.product_chain where id = any(${ids}) and ean is not null`;
  return new Map(rows.map((r) => [Number(r.id), r.ean]));
}

/**
 * Productos para un ingrediente de un plato: primero los equivalentes (hoja, variante y
 * marcas) y, en las cadenas que no tengan, cualquiera de la hoja.
 */
export async function offersForIngredient(
  ing: { name: string; leafSlug: string | null; variant: string | null; flags: string[] },
  postalCode: string,
  chains: string[],
): Promise<Offer[]> {
  if (!ing.leafSlug) return [];
  const base = {
    id: "x",
    label: ing.name,
    leafSlug: ing.leafSlug,
    variant: ing.variant,
    flags: ing.flags as CompareLine["flags"],
    quantity: null,
    unit: null,
  };
  const eq = await offersForLine({ ...base, level: "equivalent" }, postalCode, chains);
  const missing = chains.filter((c) => !eq.some((o) => o.chain === c));
  if (!missing.length) return eq;
  const gen = await offersForLine(
    { ...base, variant: null, flags: [], level: "generic" },
    postalCode,
    missing,
  );
  return [...eq, ...gen];
}
