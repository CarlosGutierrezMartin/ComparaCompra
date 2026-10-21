"use client";

import { t } from "@/i18n/es";
import { DEMO } from "@/lib/demo";
import { useOnline } from "@/lib/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) {
    return DEMO ? (
      <div role="note" className="bg-surface px-4 py-1.5 text-center text-xs text-muted">
        {t.demo.banner}
      </div>
    ) : null;
  }
  return (
    <div role="status" className="bg-warning-bg px-4 py-2 text-sm text-warning-fg">
      {t.offline.banner}
    </div>
  );
}
