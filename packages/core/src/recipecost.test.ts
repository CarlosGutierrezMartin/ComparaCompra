import { describe, expect, it } from "vitest";
import type { Offer } from "./basket";
import {
  costRecipe,
  recipeNutrition,
  scaleIngredients,
  toOfferUnit,
  type RecipeCostIngredient,
} from "./recipecost";

const offer = (chain: string, price: number, quantity: number, unit: Offer["unit"]): Offer => ({
  productId: 1,
  chain,
  name: `${chain}`,
  brand: null,
  quantity,
  unit,
  unitsPerPack: 1,
  price,
  unitPrice: null,
  promoText: null,
  priceDate: "2026-10-20T00:00:00Z",
  source: "test",
  url: "https://example.com",
  level: "equivalent",
});

const ing = (
  id: string,
  quantity: number | null,
  unit: RecipeCostIngredient["unit"],
  offers: Offer[],
  extra: Partial<RecipeCostIngredient> = {},
): RecipeCostIngredient => ({
  id,
  name: id,
  quantity,
  unit,
  optional: false,
  offers,
  unitWeightG: null,
  ...extra,
});

describe("coste del plato", () => {
  const recipe = [
    ing("garbanzos", 400, "g", [offer("dia", 0.8, 400, "g"), offer("dia", 1.5, 1000, "g")]),
    ing("tomate", 2, "unit", [offer("dia", 2, 1000, "g")], { unitWeightG: 150 }),
    ing("pimenton", 5, "ml", [offer("dia", 1.2, 75, "g")]),
    ing("sal", null, null, [offer("dia", 0.3, 1000, "g")]),
    ing("azafran", 1, "g", []),
  ];

  it("separa coste de uso y coste de compra", () => {
    const [dia] = costRecipe(recipe, 4, ["dia"]);
    const g = dia!.ingredients.find((r) => r.ingredientId === "garbanzos")!;
    expect(g.usedCost).toBe(0.6); // 400 g al precio por kg del paquete de 1 kg
    expect(g.purchaseCost).toBe(0.8); // pero se compra el bote de 400 g
    const t = dia!.ingredients.find((r) => r.ingredientId === "tomate")!;
    expect(t.usedQuantity).toBe(300);
    expect(t.usedCost).toBe(0.6);
    expect(t.purchaseCost).toBe(2);
    expect(dia!.usedTotal).toBe(1.2);
    expect(dia!.perServing).toBe(0.3);
  });

  it("marca lo que no puede costear, sin inventar", () => {
    const [dia] = costRecipe(recipe, 4, ["dia"]);
    const issues = Object.fromEntries(dia!.ingredients.map((r) => [r.ingredientId, r.issue]));
    expect(issues).toEqual({
      garbanzos: null,
      tomate: null,
      pimenton: "unidad_no_convertible",
      sal: "sin_cantidad",
      azafran: "sin_precio",
    });
    expect(dia!.costed).toBe(2);
    expect(dia!.costable).toBe(4);
  });

  it("sin peso por pieza no convierte unidades a gramos", () => {
    expect(toOfferUnit(ing("x", 2, "unit", []), "g")).toBeNull();
  });

  it("escala las raciones", () => {
    expect(scaleIngredients([{ quantity: 400 }, { quantity: null }], 4, 2)).toEqual([
      { quantity: 200 },
      { quantity: null },
    ]);
  });
});

describe("nutrición del plato", () => {
  const n = { energyKcal100: 100, proteins100: 10, carbohydrates100: 20, fat100: 5, salt100: 1 };
  it("suma por ración con los valores por 100 g", () => {
    const r = recipeNutrition(
      [
        { usedQuantity: 200, unit: "g", nutrients: n },
        { usedQuantity: 200, unit: "ml", nutrients: n },
      ],
      2,
    );
    expect(r).toEqual({ energyKcal: 200, proteins: 20, carbohydrates: 40, fat: 10, salt: 2 });
  });
  it("sin datos de un ingrediente no da un total parcial", () => {
    expect(
      recipeNutrition(
        [
          { usedQuantity: 200, unit: "g", nutrients: n },
          { usedQuantity: 100, unit: "g", nutrients: null },
        ],
        2,
      ),
    ).toBeNull();
    expect(recipeNutrition([{ usedQuantity: 2, unit: "unit", nutrients: n }], 1)).toBeNull();
  });
});
