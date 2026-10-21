"use client";

import { useRouter } from "next/navigation";
import { HouseholdForm } from "@/components/HouseholdForm";
import { Page } from "@/components/ui";
import { t } from "@/i18n/es";
import { saveHousehold } from "@/lib/household";

export default function Bienvenida() {
  const router = useRouter();
  return (
    <Page>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">{t.app.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t.onboarding.title}</h1>
        <p className="mt-2 text-muted">{t.onboarding.intro}</p>
      </div>
      <HouseholdForm
        submitLabel={t.onboarding.submit}
        onSubmit={async (value) => {
          await saveHousehold(value);
          router.replace("/lista");
        }}
      />
    </Page>
  );
}
