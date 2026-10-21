import "server-only";
import { getSql } from "./db";

/**
 * Datos nutricionales de Open Food Facts (licencia ODbL) por EAN, con caché en la tabla
 * product_nutrition. Las cadenas no publican el EAN en sus listados, así que de momento
 * solo hay datos para los productos cuyo EAN se conoce.
 */

export interface Nutrition {
  ean: string;
  productName: string | null;
  energyKcal100: number | null;
  proteins100: number | null;
  carbohydrates100: number | null;
  fat100: number | null;
  salt100: number | null;
  sourceUrl: string;
}

interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    nutriments?: Record<string, number | string>;
    image_front_url?: string;
  };
}

const num = (v: unknown) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))
      ? Number(v)
      : null;

function toNutrition(
  ean: string,
  name: string | null,
  n: Record<string, unknown>,
  sourceUrl: string,
): Nutrition {
  return {
    ean,
    productName: name,
    energyKcal100: num(n["energy-kcal_100g"]),
    proteins100: num(n["proteins_100g"]),
    carbohydrates100: num(n["carbohydrates_100g"]),
    fat100: num(n["fat_100g"]),
    salt100: num(n["salt_100g"]),
    sourceUrl,
  };
}

export async function nutritionForEan(
  ean: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Nutrition | null> {
  if (!/^\d{8,14}$/.test(ean)) return null;
  const sql = getSql();
  if (sql) {
    const rows = await sql<
      {
        product_name: string | null;
        nutriments: Record<string, unknown>;
        source_url: string;
        found: boolean;
      }[]
    >`
      select product_name, nutriments, source_url, found from public.product_nutrition
      where ean = ${ean} and fetched_at > now() - interval '30 days'`;
    const row = rows[0];
    if (row)
      return row.found ? toNutrition(ean, row.product_name, row.nutriments, row.source_url) : null;
  }
  const sourceUrl = `https://world.openfoodfacts.org/product/${ean}`;
  const res = await fetchImpl(
    `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,nutriments,image_front_url`,
    {
      headers: {
        "user-agent": "ComparaCompra/0.1 (+https://github.com/carlosgutierrezmartin/comparacompra)",
      },
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!res.ok && res.status !== 404) return null;
  const data = (await res.json().catch(() => ({}))) as OffResponse;
  const found = data.status === 1 && Boolean(data.product);
  const nutriments = (data.product?.nutriments ?? {}) as Record<string, unknown>;
  if (sql) {
    await sql`
      insert into public.product_nutrition (ean, product_name, nutriments, image_url, source_url, found)
      values (${ean}, ${data.product?.product_name ?? null}, ${sql.json(nutriments as never)}, ${data.product?.image_front_url ?? null}, ${sourceUrl}, ${found})
      on conflict (ean) do update set product_name = excluded.product_name, nutriments = excluded.nutriments,
        image_url = excluded.image_url, found = excluded.found, fetched_at = now()`;
  }
  return found ? toNutrition(ean, data.product?.product_name ?? null, nutriments, sourceUrl) : null;
}
