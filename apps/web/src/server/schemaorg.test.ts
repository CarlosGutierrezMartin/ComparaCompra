import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe, isoDurationToMinutes, visibleText } from "./schemaorg";

const page = (data: unknown) => `<html><head>
<script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>
<script type="application/ld+json">${JSON.stringify(data)}</script>
</head><body><h1>Lentejas</h1></body></html>`;

describe("schema.org/Recipe", () => {
  const recipe = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Blog" },
      {
        "@type": ["Recipe"],
        name: "Lentejas con chorizo &amp; verduras",
        recipeYield: ["4 raciones", "4"],
        totalTime: "PT1H15M",
        recipeIngredient: [
          "400 g de lentejas pardinas",
          "1 chorizo",
          "2 zanahorias",
          "1 cucharada de pimentón",
          "Sal al gusto",
        ],
        recipeInstructions: [{ "@type": "HowToStep", text: "Texto del autor que no se copia" }],
        image: "https://example.com/foto.jpg",
      },
    ],
  };

  it("lee ingredientes, raciones y tiempo, sin pasos ni fotos", () => {
    const d = extractJsonLdRecipe(page(recipe), "https://example.com/lentejas");
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.title).toBe("Lentejas con chorizo & verduras");
    expect(d.servings).toBe(4);
    expect(d.minutes).toBe(75);
    expect(d.steps).toEqual([]);
    expect(d.sourceUrl).toBe("https://example.com/lentejas");
    expect(JSON.stringify(d)).not.toContain("foto.jpg");
    expect(JSON.stringify(d)).not.toContain("Texto del autor");
    expect(d.ingredients).toHaveLength(5);
    const lentejas = d.ingredients[0];
    expect(lentejas?.quantity).toBe(400);
    expect(lentejas?.unit).toBe("g");
    expect(lentejas?.leafSlug).toBeTruthy();
    expect(d.ingredients[3]?.quantity).toBe(15);
    expect(d.ingredients[4]?.optional).toBe(true);
  });

  it("sin marcado de receta devuelve null", () => {
    expect(extractJsonLdRecipe("<html><body>Hola</body></html>", "https://example.com")).toBeNull();
    expect(
      extractJsonLdRecipe(page({ "@type": "Recipe", name: "Vacía" }), "https://example.com"),
    ).toBeNull();
    expect(
      extractJsonLdRecipe('<script type="application/ld+json">{roto</script>', "https://e.com"),
    ).toBeNull();
  });

  it("duraciones ISO 8601", () => {
    expect(isoDurationToMinutes("PT30M")).toBe(30);
    expect(isoDurationToMinutes("PT1H")).toBe(60);
    expect(isoDurationToMinutes("P1DT2H")).toBe(1560);
    expect(isoDurationToMinutes("media hora")).toBeNull();
  });

  it("texto visible sin scripts ni estilos", () => {
    const text = visibleText(
      "<style>p{}</style><script>alert(1)</script><p>200 g de arroz</p><li>1 l de caldo</li>",
    );
    expect(text).toBe("200 g de arroz\n1 l de caldo");
  });
});
