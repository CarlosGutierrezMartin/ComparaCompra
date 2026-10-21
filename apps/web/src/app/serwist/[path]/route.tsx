import { createSerwistRoute } from "@serwist/turbopack";

// Las rutas del armazón se precargan para que la app abra en modo avión.
const APP_ROUTES = [
  "/",
  "/lista",
  "/platos",
  "/platos/nuevo",
  "/platos/plato",
  "/menu",
  "/tienda",
  "/perfil",
  "/bienvenida",
  "/instalar",
  "/~offline",
  "/metodologia",
  "/legal/aviso-legal",
  "/legal/privacidad",
  "/legal/cookies",
];
const revision = process.env.NEXT_PUBLIC_BUILD_ID ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
  },
);
