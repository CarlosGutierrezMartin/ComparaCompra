"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { t } from "@/i18n/es";
import { useHousehold } from "@/lib/household";

export default function Home() {
  const household = useHousehold();
  const router = useRouter();
  useEffect(() => {
    if (household !== undefined) router.replace(household ? "/lista" : "/bienvenida");
  }, [household, router]);
  return <p className="p-4 text-muted">{t.common.loading}</p>;
}
