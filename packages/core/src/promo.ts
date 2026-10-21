/**
 * Promociones como función de la cantidad (docs/SPEC.md, algoritmo de la cesta).
 * Solo se aplican las que se entienden sin ambigüedad; el resto se muestra como texto.
 */
export type Promo =
  | { type: "nxm"; n: number; m: number } // lleva n, paga m (3x2)
  | { type: "unit_discount"; nth: number; pct: number } // la n-ésima unidad con un % de descuento
  | { type: "none" };

const NXM = /\b(\d)\s*x\s*(\d)\b/i;
const NTH_UNIT = /\b(\d)\s*[ªa]?\s*(?:ud\.?|unidad)\b[^%]*?(?:al?\s*)?-?\s*(\d{1,3})\s*%/i;

export function parsePromoText(text: string | null | undefined): Promo {
  if (!text) return { type: "none" };
  const t = text.toLowerCase();
  const nxm = NXM.exec(t);
  if (nxm) {
    const n = Number(nxm[1]);
    const m = Number(nxm[2]);
    // "2 x 2 L" es un formato, no una promoción: en una promoción se paga menos de lo que se lleva.
    if (n > m && m > 0 && !/\d\s*x\s*\d+(?:[.,]\d+)?\s*(?:l|ml|cl|g|kg)\b/i.test(t)) {
      return { type: "nxm", n, m };
    }
  }
  const nth = NTH_UNIT.exec(t);
  if (nth) {
    const at = Number(nth[1]);
    const pct = Number(nth[2]);
    if (at >= 2 && pct > 0 && pct <= 100) return { type: "unit_discount", nth: at, pct };
  }
  return { type: "none" };
}

/** Coste de comprar `packs` envases de precio unitario `price` con la promoción dada. */
export function promoCost(price: number, packs: number, promo: Promo): number {
  if (packs <= 0) return 0;
  switch (promo.type) {
    case "nxm": {
      const groups = Math.floor(packs / promo.n);
      return (groups * promo.m + (packs % promo.n)) * price;
    }
    case "unit_discount": {
      const discounted = Math.floor(packs / promo.nth);
      return packs * price - discounted * price * (promo.pct / 100);
    }
    default:
      return packs * price;
  }
}
