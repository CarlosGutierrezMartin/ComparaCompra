import {
  costRecipe,
  recipeNutrition,
  scaleIngredients,
  type ChainRecipeCost,
  type RecipeCostIngredient,
} from "@comparacompra/core";
import { CostRequestSchema } from "@/lib/recipe-types";
import {
  CatalogUnavailableError,
  eansForProducts,
  offersForIngredient,
  unitWeightsForLeaves,
} from "@/server/catalog";
import { nutritionForEan, type Nutrition } from "@/server/off";

/**
 * POST /api/recipes/cost: coste por ración y coste de compra del plato en cada cadena.
 */
/**
 * Nutrición por ración en cada cadena con los productos elegidos, solo si todos tienen EAN
 * con datos en Open Food Facts. Si no, null: la interfaz muestra "sin datos".
 */
async function nutritionByChain(chains: ChainRecipeCost[], servings: number) {
  const ids = [
    ...new Set(
      chains
        .flatMap((c) => c.ingredients.map((i) => i.offer?.productId))
        .filter((x): x is number => x !== undefined),
    ),
  ];
  const eans = await eansForProducts(ids);
  const cache = new Map<string, Promise<Nutrition | null>>();
  const lookup = (ean: string) => {
    let p = cache.get(ean);
    if (!p) {
      p = nutritionForEan(ean).catch(() => null);
      cache.set(ean, p);
    }
    return p;
  };
  const out: Record<string, { perServing: ReturnType<typeof recipeNutrition>; sources: string[] }> =
    {};
  for (const c of chains) {
    const used = c.ingredients.filter((i) => i.issue !== "opcional");
    const rows = await Promise.all(
      used.map(async (i) => {
        const ean = i.offer ? eans.get(i.offer.productId) : undefined;
        const n = ean ? await lookup(ean) : null;
        return {
          usedQuantity: i.usedQuantity,
          unit: i.offer?.unit ?? null,
          nutrients: n,
          source: n?.sourceUrl,
        };
      }),
    );
    out[c.chain] = {
      perServing: recipeNutrition(rows, servings),
      sources: rows.map((r) => r.source).filter((x): x is string => Boolean(x)),
    };
  }
  return out;
}

export async function POST(request: Request) {
  const parsed = CostRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const req = parsed.data;
  try {
    const scaled = scaleIngredients(req.ingredients, req.servings, req.targetServings);
    const leaves = [
      ...new Set(scaled.map((i) => i.leafSlug).filter((s): s is string => Boolean(s))),
    ];
    const [weights, offers] = await Promise.all([
      unitWeightsForLeaves(leaves),
      Promise.all(
        scaled.map((i) =>
          i.leafSlug ? offersForIngredient(i, req.postalCode, req.chains) : Promise.resolve([]),
        ),
      ),
    ]);
    const ingredients: RecipeCostIngredient[] = scaled.map((i, idx) => ({
      id: String(idx),
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
      offers: offers[idx] ?? [],
      unitWeightG: i.leafSlug ? (weights.get(i.leafSlug)?.grams ?? null) : null,
    }));
    const chains = costRecipe(ingredients, req.targetServings, req.chains);
    return Response.json({
      chains,
      unitWeights: Object.fromEntries(weights),
      nutrition: await nutritionByChain(chains, req.targetServings),
    });
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
