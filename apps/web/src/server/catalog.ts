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

interface OfferRow {
  product_id: number;
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
  identical_canonical_id: number | null;
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
      productId: r.product_id,
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
      identicalCanonicalId: r.identical_canonical_id,
    }));
}
