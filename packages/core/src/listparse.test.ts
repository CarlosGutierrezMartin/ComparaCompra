import { describe, expect, it } from "vitest";
import { parseLine, parseList, splitList } from "./listparse";

describe("lista en lenguaje natural", () => {
  it("separa por comas y saltos de línea sin romper decimales", () => {
    expect(splitList("2 docenas de huevos, leche sin lactosa, pechuga para 4")).toEqual([
      "2 docenas de huevos",
      "leche sin lactosa",
      "pechuga para 4",
    ]);
    expect(splitList("1,5 l de aceite\n- pan de molde")).toEqual([
      "1,5 l de aceite",
      "pan de molde",
    ]);
  });

  it("ejemplo de la especificación", () => {
    const [huevos, leche, pechuga] = parseList(
      "2 docenas de huevos, leche sin lactosa, pechuga para 4",
    );
    expect(huevos).toMatchObject({ leafSlug: "huevos", quantity: 24, unit: "unit" });
    expect(leche).toMatchObject({ leafSlug: "leche", flags: ["sin_lactosa"], quantity: null });
    expect(pechuga).toMatchObject({ leafSlug: "pechuga-de-pollo", people: 4, quantity: null });
  });

  it.each([
    ["1 kg de patatas", { leafSlug: "patata", quantity: 1000, unit: "g" }],
    [
      "medio kilo de carne picada de vacuno",
      { leafSlug: "carne-picada", quantity: 500, variant: "vacuno" },
    ],
    ["3 latas de atún", { leafSlug: "atun-en-conserva", packs: 3 }],
    ["6 huevos", { leafSlug: "huevos", quantity: 6, unit: "unit" }],
    ["leche semidesnatada", { leafSlug: "leche", variant: "semidesnatada" }],
    ["aceite de oliva virgen extra", { leafSlug: "aceite-de-oliva", variant: "virgen extra" }],
    ["tomate frito", { leafSlug: "tomate-frito" }],
    ["papel higiénico", { leafSlug: "papel-higienico" }],
    ["un cuarto de kilo de queso rallado", { leafSlug: "queso-rallado", quantity: 250 }],
    ["2 l de leche entera", { leafSlug: "leche", quantity: 2000, unit: "ml", variant: "entera" }],
    ["yogures naturales", { leafSlug: "yogur-natural" }],
    ["garbanzos cocidos", { leafSlug: "garbanzos-cocidos" }],
    ["pan de molde integral", { leafSlug: "pan-de-molde", flags: ["integral"] }],
    ["plátanos", { leafSlug: "platano" }],
    ["detergente", { leafSlug: "detergente-para-ropa" }],
  ])("%s", (text, expected) => {
    expect(parseLine(text)).toMatchObject(expected);
  });

  it("conserva el texto original para mostrarlo", () => {
    expect(parseLine("1 kg de Patatas nuevas").label).toBe("Patatas nuevas");
    expect(parseLine("azafrán en hebras de La Mancha").label).toBe(
      "azafrán en hebras de La Mancha",
    );
    expect(parseLine("pechuga para 4").label).toBe("pechuga");
  });

  it("«para cocinar» no son personas", () => {
    expect(parseLine("nata para cocinar")).toMatchObject({
      leafSlug: "nata-para-cocinar",
      people: null,
    });
  });

  it("lo que no reconoce queda sin hoja, nunca inventado", () => {
    expect(parseLine("regalo para Ana").leafSlug).toBeNull();
  });

  it("una lista de 20 líneas se interpreta al instante", () => {
    const text = Array.from({ length: 20 }, (_, i) => `${i + 1} kg de patatas`).join("\n");
    const t0 = performance.now();
    expect(parseList(text)).toHaveLength(20);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
