/**
 * Versión de demostración sin servidor (GitHub Pages). Se activa al compilar con
 * NEXT_PUBLIC_DEMO=1: el catálogo de la muestra viaja como JSON y la comparación, los
 * costes y el menú se calculan en el móvil. Sin IA, sin importar enlaces y sin cuenta.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** Prefijo de la web cuando no está en la raíz del dominio ("/ComparaCompra" en Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Ruta absoluta con el prefijo, para lo que no pasa por el router de Next. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** URL de una página para una navegación del navegador (el export estático usa barra final). */
export function pageUrl(path: string): string {
  return withBase(DEMO && !path.endsWith("/") ? `${path}/` : path);
}
