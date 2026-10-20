import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// cacheComponents queda desactivado: @serwist/turbopack solo lo soporta sin él (docs/DECISIONS.md).
const nextConfig: NextConfig = {
  transpilePackages: ["@comparacompra/core", "@comparacompra/menu"],
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
