"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useHousehold } from "@/lib/household";
import { getSupabase } from "@/lib/supabase";
import { setRemote, startAutoSync } from "@/lib/sync";
import { SupabaseRemote } from "@/lib/sync-remote";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "./OfflineBanner";

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
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"}>
      <OfflineBanner />
      <div className="flex flex-1 flex-col pb-20">{children}</div>
      {household && !pathname.startsWith("/bienvenida") ? <BottomNav /> : null}
    </SerwistProvider>
  );
}
