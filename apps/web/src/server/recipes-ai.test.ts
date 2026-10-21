import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeDraft } from "@/lib/recipe-types";

vi.mock("server-only", () => ({}));
const parseStructured = vi.fn();
vi.mock("./ai", () => ({
  aiAvailable: () => true,
  parseStructured: (...args: unknown[]) => parseStructured(...args),
}));

const { checkConstraints, generateRecipe, GenerationError } = await import("./recipes-ai");

type AiIng = {
  texto: string;
  nombre: string;
  hoja: string | null;
  cantidad: number | null;
  unidad: "g" | "ml" | "unit" | null;
};
const ai = (titulo: string, ingredientes: AiIng[]) => ({
  titulo,
  raciones: 2,
  minutos: 30,
  pasos: ["Cocinar."],
  ingredientes: ingredientes.map((i) => ({ ...i, variante: null, opcional: false })),
});
const ing = (texto: string, hoja: string | null, cantidad = 100): AiIng => ({
  texto,
  nombre: texto,
  hoja,
  cantidad,
  unidad: "g",
});

const draft = (ingredients: [string, string | null, string[]?][]): RecipeDraft => ({
  title: "x",
  servings: 2,
  minutes: null,
  steps: [],
  sourceUrl: null,
  tags: [],
  ingredients: ingredients.map(([name, leafSlug, flags]) => ({
    raw: name,
    name,
    leafSlug,
    variant: null,
    flags: (flags ?? []) as RecipeDraft["ingredients"][number]["flags"],
    quantity: 100,
    unit: "g",
    optional: false,
  })),
});

const request = (diet: string[], allergens: string[]) => ({
  request: "algo rápido",
  servings: 2,
  maxMinutes: null,
  diet,
  allergens,
  postalCode: null,
});

describe("comprobación de alérgenos y dietas", () => {
  // Casos de prueba del criterio de aceptación de F2: el 100 % se cumple porque se comprueba
  // cada ingrediente con la taxonomía, no porque se confíe en el modelo.
  const cases: {
    name: string;
    d: RecipeDraft;
    diet: string[];
    allergens: string[];
    ok: boolean;
  }[] = [
    {
      name: "vegetariana con pollo",
      d: draft([["pechuga de pollo", "pechuga-de-pollo"]]),
      diet: ["vegetariana"],
      allergens: [],
      ok: false,
    },
    {
      name: "vegetariana con lentejas",
      d: draft([["lentejas", "lentejas-cocidas"]]),
      diet: ["vegetariana"],
      allergens: [],
      ok: true,
    },
    {
      name: "vegana con huevos",
      d: draft([["huevos", "huevos"]]),
      diet: ["vegana"],
      allergens: [],
      ok: false,
    },
    {
      name: "vegana con queso",
      d: draft([["queso", "queso-curado"]]),
      diet: ["vegana"],
      allergens: [],
      ok: false,
    },
    {
      name: "alergia al gluten con pan",
      d: draft([["pan", "pan-de-molde"]]),
      diet: [],
      allergens: ["gluten"],
      ok: false,
    },
    {
      name: "alergia al gluten con pan sin gluten",
      d: draft([["pan sin gluten", "pan-de-molde", ["sin_gluten"]]]),
      diet: [],
      allergens: ["gluten"],
      ok: true,
    },
    {
      name: "alergia a lácteos con leche sin lactosa",
      d: draft([["leche sin lactosa", "leche", ["sin_lactosa"]]]),
      diet: [],
      allergens: ["lacteos"],
      ok: false,
    },
    {
      name: "dieta sin lactosa con leche sin lactosa",
      d: draft([["leche sin lactosa", "leche", ["sin_lactosa"]]]),
      diet: ["sin_lactosa"],
      allergens: [],
      ok: true,
    },
    {
      name: "alergia al pescado con merluza",
      d: draft([["merluza", "merluza"]]),
      diet: [],
      allergens: ["pescado"],
      ok: false,
    },
    {
      name: "ingrediente sin identificar",
      d: draft([["ras el hanout", null]]),
      diet: [],
      allergens: ["sesamo"],
      ok: false,
    },
  ];
  it.each(cases)("$name", ({ d, diet, allergens, ok }) => {
    for (const i of d.ingredients) {
      if (i.leafSlug) expect(i.leafSlug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(checkConstraints(d, diet, allergens).length === 0).toBe(ok);
  });
});

describe("generación de platos", () => {
  beforeEach(() => parseStructured.mockReset());

  it("reintenta una vez si incumple el perfil y devuelve el plato válido", async () => {
    parseStructured
      .mockResolvedValueOnce(
        ai("Pollo al ajillo", [ing("pechuga de pollo", "pechuga-de-pollo", 400)]),
      )
      .mockResolvedValueOnce(ai("Lentejas estofadas", [ing("lentejas", "lentejas-cocidas", 300)]));
    const d = await generateRecipe(request(["vegetariana"], []), ["lentejas-cocidas"]);
    expect(d.title).toBe("Lentejas estofadas");
    expect(d.tags).toContain("generado");
    expect(parseStructured).toHaveBeenCalledTimes(2);
    const secondPrompt = String(parseStructured.mock.calls[1]?.[0]?.content);
    expect(secondPrompt).toContain("no valía");
    expect(String(parseStructured.mock.calls[0]?.[0]?.content)).toContain("Lentejas");
  });

  it("si vuelve a incumplir, rechaza en lugar de mostrarlo", async () => {
    parseStructured.mockResolvedValue(ai("Tortilla", [ing("huevos", "huevos", 4)]));
    await expect(generateRecipe(request(["vegana"], []), [])).rejects.toBeInstanceOf(
      GenerationError,
    );
    expect(parseStructured).toHaveBeenCalledTimes(2);
  });

  it("una hoja inventada por el modelo no pasa", async () => {
    parseStructured.mockResolvedValue(ai("Raro", [ing("ingrediente raro", "no-existe")]));
    await expect(generateRecipe(request([], ["gluten"]), [])).rejects.toBeInstanceOf(
      GenerationError,
    );
  });
});
