import { describe, expect, it } from "vitest";
import { convert, parseUnit, toBase, unitPrice } from "./units";
import { formatEuro, formatNumber, formatQuantity, formatUnitPrice } from "./format";

describe("unidades", () => {
  it("normaliza kg, l, cl y docenas", () => {
    expect(toBase(1.5, "kg")).toEqual({ amount: 1500, unit: "g" });
    expect(toBase(33, "cl")).toEqual({ amount: 330, unit: "ml" });
    expect(toBase(2, "docenas")).toEqual({ amount: 24, unit: "unit" });
    expect(toBase(1, "Litros")).toEqual({ amount: 1000, unit: "ml" });
  });

  it("no reconoce unidades inventadas", () => {
    expect(parseUnit("puñado")).toBeNull();
  });

  it("convierte con densidad o peso por unidad, y si faltan devuelve null", () => {
    expect(convert({ amount: 500, unit: "ml" }, "g", { densityGml: 1.03 })).toEqual({
      amount: 515,
      unit: "g",
    });
    expect(convert({ amount: 2, unit: "unit" }, "g", { unitWeightG: 60 })).toEqual({
      amount: 120,
      unit: "g",
    });
    expect(convert({ amount: 2, unit: "unit" }, "g")).toBeNull();
  });

  it("calcula precio por kg y por unidad", () => {
    expect(unitPrice(1.5, { amount: 500, unit: "g" })).toBeCloseTo(3);
    expect(unitPrice(3, { amount: 12, unit: "unit" })).toBeCloseTo(0.25);
  });
});

describe("formato", () => {
  it("usa separador de miles y coma decimal", () => {
    expect(formatEuro(1234.56)).toBe("1.234,56 €");
    expect(formatEuro(0.5)).toBe("0,50 €");
    expect(formatNumber(1234567.891, 1)).toBe("1.234.567,9");
    expect(formatEuro(-12)).toBe("-12,00 €");
  });
});

describe("cantidades", () => {
  it("se muestran en la unidad más legible", () => {
    expect(formatQuantity(500, "g")).toBe("500 g");
    expect(formatQuantity(1500, "g")).toBe("1,5 kg");
    expect(formatQuantity(2000, "ml")).toBe("2 l");
    expect(formatQuantity(24, "unit")).toBe("24 ud.");
    expect(formatUnitPrice(3.4512, "g")).toBe("3,45 €/kg");
  });
});
