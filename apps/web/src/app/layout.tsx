import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ComparaCompra",
  description: "Tu lista de la compra, lo más barata posible.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
