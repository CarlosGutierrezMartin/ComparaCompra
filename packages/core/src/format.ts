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
