"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useHousehold } from "@/lib/household";
import { DEMO, withBase } from "@/lib/demo";
import { getSupabase } from "@/lib/supabase";
import { setRemote, startAutoSync } from "@/lib/sync";
import { SupabaseRemote } from "@/lib/sync-remote";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "./OfflineBanner";

// Constante: SerwistProvider vuelve a registrar el service worker si cambian las opciones.
const SW_OPTIONS = DEMO ? { scope: withBase("/") } : undefined;

// Páginas que se pueden ver sin haber configurado el hogar.
const PUBLIC_PREFIXES = [
  "/bienvenida",
  "/instalar",
  "/auth",
  "/legal",
  "/metodologia",
  "/~offline",
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const household = useHousehold();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const sb = getSupabase();
    setRemote(sb ? new SupabaseRemote(sb) : null);
    return startAutoSync();
  }, []);

  useEffect(() => {
    if (household === null && !isPublic) router.replace("/bienvenida");
  }, [household, isPublic, router]);

  return (
    <SerwistProvider
      // En GitHub Pages no se puede enviar Service-Worker-Allowed: el service worker se copia
      // a la raíz de la web para que su alcance la cubra entera.
      swUrl={DEMO ? withBase("/sw.js") : "/serwist/sw.js"}
      options={SW_OPTIONS}
      // Sin recarga al volver la conexión: borraría lo que se está escribiendo y, en Chromium
      // reciente, cancelaba la navegación en curso volviendo a la página anterior. Los
      // cambios ya se envían solos al volver la conexión (lib/sync.ts).
      reloadOnOnline={false}
      disable={process.env.NODE_ENV !== "production"}
    >
      <OfflineBanner />
      <div className="flex flex-1 flex-col pb-20">{children}</div>
      {household && !pathname.startsWith("/bienvenida") ? <BottomNav /> : null}
    </SerwistProvider>
  );
}
