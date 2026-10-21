import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ComparaCompra", template: "%s · ComparaCompra" },
  description: "Tu lista de la compra, lo más barata posible.",
  applicationName: "ComparaCompra",
  appleWebApp: { capable: true, title: "ComparaCompra", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  // Next emite mobile-web-app-capable; iOS antiguos leen la etiqueta con prefijo de Apple.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#1d6b45",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
