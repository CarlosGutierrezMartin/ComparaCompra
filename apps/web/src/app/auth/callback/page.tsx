"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page } from "@/components/ui";
import { t } from "@/i18n/es";
import { getSupabase } from "@/lib/supabase";
import { flush } from "@/lib/sync";

/** Vuelta del enlace de acceso: canjea el código por una sesión y sincroniza. */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    const code = new URLSearchParams(window.location.search).get("code");
    if (!sb || !code) {
      router.replace("/perfil");
      return;
    }
    void sb.auth.exchangeCodeForSession(code).then(async ({ error: err }) => {
      if (err) {
        setError(t.common.error);
        return;
      }
      await flush();
      router.replace("/perfil");
    });
  }, [router]);

  return (
    <Page>
      <p role="status">{error ?? t.common.loading}</p>
    </Page>
  );
}
