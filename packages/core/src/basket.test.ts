import { describe, expect, it } from "vitest";
import { compareBasket, packsNeeded, type BasketLine, type Offer } from "./basket";
import { parsePromoText, promoCost } from "./promo";

function offer(
  chain: string,
  price: number,
  quantity: number | null,
  unit: Offer["unit"],
  extra: Partial<Offer> = {},
): Offer {
  return {
    productId: Math.floor(Math.random() * 1e6),
    chain,
    name: `${chain} ${price}`,
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
    ...extra,
  };
}

const opts = {
  chains: ["mercadona", "dia", "alcampo"],
  maxStores: 2 as const,
  fixedCostPerStore: 0,
};

describe("promociones", () => {
  it("interpreta 3x2 y segunda unidad con descuento", () => {
    expect(parsePromoText("3X2 LAY'S,S.ANA,DORITOS")).toEqual({ type: "nxm", n: 3, m: 2 });
    expect(parsePromoText("2ª unidad al 50%")).toEqual({ type: "unit_discount", nth: 2, pct: 50 });
    expect(parsePromoText("2ª ud. -70%")).toEqual({ type: "unit_discount", nth: 2, pct: 70 });
  });

  it("no confunde un formato con una promoción", () => {
    expect(parsePromoText("SOLO A 2,98 EUROS FANTA DE NARANJA 2 X 2 L")).toEqual({ type: "none" });
  });

  it("calcula el coste con la promoción", () => {
    expect(promoCost(1, 3, { type: "nxm", n: 3, m: 2 })).toBe(2);
    expect(promoCost(1, 4, { type: "nxm", n: 3, m: 2 })).toBe(3);
    expect(promoCost(2, 2, { type: "unit_discount", nth: 2, pct: 50 })).toBe(3);
  });
});

describe("envases", () => {
  it("redondea a envases enteros", () => {
    const line: BasketLine = { id: "a", label: "pechuga", quantity: 1500, unit: "g", offers: [] };
    expect(packsNeeded(line, offer("dia", 5, 1000, "g"))).toBe(2);
    expect(packsNeeded(line, offer("dia", 5, 500, "g", { unitsPerPack: 3 }))).toBe(1);
  });

  it("sin cantidad pedida, un envase", () => {
    const line: BasketLine = { id: "a", label: "sal", quantity: null, unit: null, offers: [] };
    expect(packsNeeded(line, offer("dia", 0.3, 1000, "g"))).toBe(1);
  });

  it("pedido por envases", () => {
    const line: BasketLine = {
      id: "a",
      label: "atún",
      quantity: null,
      unit: null,
      packs: 3,
      offers: [],
    };
    expect(packsNeeded(line, offer("dia", 1, 52, "g", { unitsPerPack: 3 }))).toBe(3);
  });

  it("formato no comparable no se usa", () => {
    const line: BasketLine = { id: "a", label: "lechuga", quantity: 500, unit: "g", offers: [] };
    expect(packsNeeded(line, offer("dia", 1, 1, "unit"))).toBeNull();
  });
});

describe("comparación", () => {
  const lines: BasketLine[] = [
    {
      id: "leche",
      label: "leche",
      quantity: 6000,
      unit: "ml",
      offers: [
        offer("mercadona", 0.95, 1000, "ml"),
        offer("dia", 5.4, 1000, "ml", { unitsPerPack: 6 }),
        offer("alcampo", 0.99, 1000, "ml"),
      ],
    },
    {
      id: "huevos",
      label: "2 docenas de huevos",
      quantity: 24,
      unit: "unit",
      offers: [
        offer("mercadona", 5.25, 24, "unit"),
        offer("dia", 2.2, 12, "unit"),
        offer("alcampo", 3.05, 12, "unit"),
      ],
    },
    {
      id: "patatas",
      label: "patatas fritas",
      quantity: null,
      unit: null,
      offers: [
        offer("dia", 1.5, 150, "g", { promoText: "3X2 LAY'S" }),
        offer("alcampo", 1.2, 150, "g"),
      ],
    },
    { id: "azafran", label: "azafrán", quantity: null, unit: null, offers: [] },
  ];

  it("totales por cadena con cobertura y líneas sin precio visibles", () => {
    const r = compareBasket(lines, opts);
    expect(r.unavailable).toEqual(["azafran"]);
    const merc = r.perChain.find((c) => c.chain === "mercadona")!;
    expect(merc.covered).toBe(2);
    expect(merc.missing).toEqual(["patatas", "azafran"]);
    expect(merc.total).toBe(10.95);
  });

  it("el total cuadra con la suma de las líneas", () => {
    const r = compareBasket(lines, opts);
    for (const plan of [r.bestSingle!, r.bestPair!, ...r.perChain]) {
      const sum = plan.lines.reduce((s, l) => s + l.cost, 0);
      expect(plan.total).toBeCloseTo(sum, 2);
    }
  });

  it("mejor tienda única: la que más cubre y, a igualdad, la más barata", () => {
    const r = compareBasket(lines, opts);
    expect(r.bestSingle?.chains).toEqual(["dia"]);
    expect(r.bestSingle?.total).toBe(5.4 + 4.4 + 1.5);
  });

  it("repartir en dos tiendas solo si ahorra más que el coste fijo", () => {
    const cheapSplit = compareBasket(lines, opts);
    expect(cheapSplit.bestPair?.chains.sort()).toEqual(["alcampo", "dia"]);
    expect(cheapSplit.pairSavings).toBeCloseTo(0.3, 2);
    const withFixed = compareBasket(lines, { ...opts, fixedCostPerStore: 2 });
    expect(withFixed.pairSavings).toBeNull();
    expect(withFixed.bestPair).toBeNull();
  });

  it("sin cantidad compara la cantidad de referencia, no el envase más pequeño", () => {
    const r = compareBasket(
      [
        {
          id: "aceite",
          label: "aceite",
          quantity: null,
          unit: null,
          offers: [
            offer("dia", 2.49, 250, "ml"),
            offer("dia", 8.5, 1000, "ml"),
            offer("mercadona", 8.2, 1000, "ml"),
            offer("alcampo", 39, 5000, "ml"),
          ],
        },
      ],
      opts,
    );
    expect(r.quantities.aceite).toEqual({ quantity: 1000, unit: "ml", reference: true });
    expect(r.bestSingle?.chains).toEqual(["mercadona"]);
  });

  it("sin ofertas no propone tiendas", () => {
    const r = compareBasket(
      [{ id: "x", label: "azafrán", quantity: null, unit: null, offers: [] }],
      opts,
    );
    expect(r.bestSingle).toBeNull();
    expect(r.bestPair).toBeNull();
    expect(r.unavailable).toEqual(["x"]);
  });

  it("avisa cuando la promoción regala envases", () => {
    const r = compareBasket(
      [
        {
          id: "p",
          label: "patatas",
          quantity: 300,
          unit: "g",
          offers: [offer("dia", 1.5, 150, "g", { promoText: "3x2" })],
        },
      ],
      { ...opts, chains: ["dia"] },
    );
    expect(r.bestSingle?.lines[0]?.cost).toBe(3);
    expect(r.bestSingle?.lines[0]?.promoHint).toContain("3 cuestan lo mismo que 2");
  });

  it("rápido con 20 líneas y muchas ofertas", () => {
    const many: BasketLine[] = Array.from({ length: 20 }, (_, i) => ({
      id: `l${i}`,
      label: `l${i}`,
      quantity: 1000,
      unit: "g",
      offers: Array.from({ length: 60 }, (_, j) =>
        offer(
          ["mercadona", "dia", "alcampo", "carrefour"][j % 4]!,
          1 + j / 10,
          250 * (1 + (j % 4)),
          "g",
        ),
      ),
    }));
    const t0 = performance.now();
    compareBasket(many, {
      chains: ["mercadona", "dia", "alcampo", "carrefour"],
      maxStores: 2,
      fixedCostPerStore: 1,
    });
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
