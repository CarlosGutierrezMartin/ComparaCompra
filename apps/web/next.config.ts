import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// Demo sin servidor para GitHub Pages (NEXT_PUBLIC_DEMO=1): export estático bajo un prefijo.
// Solo cuentan como rutas los .tsx, así que las rutas /api (route.ts, necesitan servidor)
// quedan fuera; la ruta del service worker y el manifiesto son .tsx a propósito.
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

// cacheComponents queda desactivado: @serwist/turbopack solo lo soporta sin él (docs/DECISIONS.md).
const nextConfig: NextConfig = {
  transpilePackages: ["@comparacompra/core", "@comparacompra/menu"],
  // HiGHS (optimizador del menú) carga su .wasm junto al módulo: se deja fuera del bundle.
  serverExternalPackages: ["highs"],
  ...(basePath ? { basePath } : {}),
  ...(DEMO
    ? {
        output: "export" as const,
        trailingSlash: true,
        pageExtensions: ["tsx"],
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
