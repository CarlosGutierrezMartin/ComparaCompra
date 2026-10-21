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
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// En el export estático cada página es una carpeta: /lista/ (con barra final).
const pageUrl = (route: string) => `${BASE}${route === "/" || !DEMO ? route : `${route}/`}`;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: APP_ROUTES.map((route) => ({ url: pageUrl(route), revision })),
    // HiGHS (optimizador del menú, 3,5 MB) también se guarda para calcular menús sin conexión.
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    // El service worker no ve process.env: se le pasan los valores al empaquetarlo.
    esbuildOptions: {
      define: {
        "process.env.NEXT_PUBLIC_DEMO": JSON.stringify(DEMO ? "1" : ""),
        "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(BASE),
      },
    },
  },
);
