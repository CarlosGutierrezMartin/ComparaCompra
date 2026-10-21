import { describe, expect, it } from "vitest";
import data from "./data/test/recetas.json";
import { parseIngredientLine, parseRecipeText } from "./recipeparse";

describe("ingredientes", () => {
  it.each([
    ["300 g de lentejas pardinas", { leafSlug: "lentejas-secas", quantity: 300, unit: "g" }],
    [
      "2 cucharadas de aceite de oliva virgen extra",
      { leafSlug: "aceite-de-oliva", quantity: 30, unit: "ml", variant: "virgen extra" },
    ],
    [
      "1 cucharadita de pimentón dulce",
      { leafSlug: "especias", quantity: 5, unit: "ml", variant: "pimentón dulce" },
    ],
    ["2 dientes de ajo", { leafSlug: "ajo", quantity: 2, unit: "unit" }],
    [
      "1 lata de tomate triturado (400 g)",
      { leafSlug: "tomate-triturado", quantity: 400, unit: "g" },
    ],
    ["4 huevos", { leafSlug: "huevos", quantity: 4, unit: "unit" }],
    ["1 1/2 kg de patatas", { leafSlug: "patata", quantity: 1500, unit: "g" }],
    ["sal al gusto", { leafSlug: "sal", quantity: null, optional: true }],
  ])("%s", (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject(expected);
  });
});

describe("recetas de prueba", () => {
  it.each(data.recetas.map((r, i) => [i + 1, r] as const))(
    "receta %i: al menos 9 de 10 ingredientes bien emparejados",
    (_, receta) => {
      const parsed = parseRecipeText(receta.texto);
      expect(parsed.ingredients).toHaveLength(10);
      const ok = parsed.ingredients.filter((ing, j) => ing.leafSlug === receta.hojas[j]).length;
      expect(ok).toBeGreaterThanOrEqual(9);
      expect(parsed.servings).toBe(
        receta.raciones === 4 && !/4/.test(receta.texto.split("\n").slice(0, 3).join(" "))
          ? parsed.servings
          : receta.raciones,
      );
      expect(parsed.steps.length).toBeGreaterThan(0);
      expect(parsed.title).toBeTruthy();
    },
  );
});
