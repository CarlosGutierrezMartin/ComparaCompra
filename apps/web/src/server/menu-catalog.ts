import "server-only";
import { ingredientKey, type MenuRecipe, type PackOption } from "@comparacompra/menu";
import { offersForIngredient, unitWeightsForLeaves } from "./catalog";

/** Envases disponibles para los ingredientes de los platos candidatos del menú. */
export async function packsForRecipes(
  recipes: MenuRecipe[],
  postalCode: string,
  chains: string[],
): Promise<{ packs: Record<string, PackOption[]>; unitWeights: Record<string, number> }> {
  const byKey = new Map<string, MenuRecipe["ingredients"][number]>();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const key = ingredientKey(ing);
      if (key && !ing.optional && !byKey.has(key)) byKey.set(key, ing);
    }
  }
  const entries = [...byKey.entries()];
  const packs: Record<string, PackOption[]> = {};
  // De 8 en 8 para no abrir demasiadas conexiones a la vez.
  for (let i = 0; i < entries.length; i += 8) {
    const chunk = entries.slice(i, i + 8);
    const results = await Promise.all(
      chunk.map(([, ing]) => offersForIngredient(ing, postalCode, chains)),
    );
    chunk.forEach(([key], j) => {
      packs[key] = (results[j] ?? [])
        .filter((o) => o.quantity !== null && o.quantity > 0 && o.unit !== null)
        .map((o) => ({
          productId: o.productId,
          chain: o.chain,
          name: o.name,
          price: o.price,
          content: (o.quantity ?? 0) * o.unitsPerPack,
          unit: o.unit ?? "g",
          url: o.url,
          priceDate: o.priceDate,
        }));
    });
  }
  const leaves = [
    ...new Set(entries.map(([, ing]) => ing.leafSlug).filter((s): s is string => Boolean(s))),
  ];
  const weights = await unitWeightsForLeaves(leaves);
  return {
    packs,
    unitWeights: Object.fromEntries([...weights].map(([leaf, w]) => [leaf, w.grams])),
  };
}
