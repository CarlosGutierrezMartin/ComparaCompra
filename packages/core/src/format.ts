/**
 * Formato numérico español con separador de miles siempre (1.234,56).
 * Intl con "es-ES" no agrupa los números de cuatro cifras, por eso se formatea a mano.
 */
export function formatNumber(value: number, decimals = 2): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart = "0", decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${decPart ? `,${decPart}` : ""}`;
}

/** Importe en euros con formato español: 1.234,56 €. */
export function formatEuro(value: number): string {
  return `${formatNumber(value, 2)} €`;
}

/** Fecha corta en español (20/10/2026). */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Cantidad legible: 500 g, 1,5 kg, 750 ml, 2 l, 24 ud. */
export function formatQuantity(quantity: number | null, unit: "g" | "ml" | "unit" | null): string {
  if (quantity === null || unit === null) return "";
  // Sin ceros decimales sobrantes: 1,50 -> 1,5 y 2,00 -> 2 (los enteros no se tocan).
  const trim = (x: number) =>
    formatNumber(x, Number.isInteger(x) ? 0 : x < 10 ? 2 : 1)
      .replace(/(,\d*?)0+$/, "$1")
      .replace(/,$/, "");
  if (unit === "unit") return `${trim(quantity)} ud.`;
  if (quantity >= 1000) return `${trim(quantity / 1000)} ${unit === "g" ? "kg" : "l"}`;
  return `${trim(quantity)} ${unit}`;
}

/** Precio por unidad de medida: 3,45 €/kg. */
export function formatUnitPrice(value: number | null, unit: "g" | "ml" | "unit" | null): string {
  if (value === null || unit === null) return "";
  return `${formatNumber(value, 2)} €/${unit === "g" ? "kg" : unit === "ml" ? "l" : "ud."}`;
}
