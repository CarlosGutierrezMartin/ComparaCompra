import type { MetadataRoute } from "next";
import { withBase } from "@/lib/demo";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ComparaCompra",
    short_name: "ComparaCompra",
    description: "Tu lista de la compra, lo más barata posible.",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    theme_color: "#1d6b45",
    background_color: "#ffffff",
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: withBase("/icons/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
