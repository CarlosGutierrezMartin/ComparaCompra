"use client";

import { t } from "@/i18n/es";
import { useOnline } from "@/lib/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-warning-bg px-4 py-2 text-sm text-warning-fg">
      {t.offline.banner}
    </div>
  );
}
