"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MenuConfigForm } from "@/components/menu/MenuConfigForm";
import { MenuPlanView } from "@/components/menu/MenuPlanView";
import { PantryEditor } from "@/components/menu/PantryEditor";
import { Button, Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";
import { useHousehold } from "@/lib/household";
import {
  MenuApiError,
  menuToList,
  placeRecipe,
  proposeMenu,
  regenerate,
  swapSlot,
  toggleLock,
  useCurrentPlan,
  type MenuConfig,
  type PlanResponse,
} from "@/lib/menu";
import { useRecipe } from "@/lib/recipes";
import { DEMO } from "@/lib/demo";
import { useOnline } from "@/lib/useOnline";

function MenuPage() {
  const household = useHousehold();
  const plan = useCurrentPlan();
  // En la demo el menú se calcula en el móvil: no necesita conexión.
  const online = useOnline() || DEMO;
  const addId = useSearchParams().get("add");
  const pending = useRecipe(addId);
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const pendingTitle = pending && !placed ? pending.title : null;

  async function run(fn: () => Promise<{ response: PlanResponse }>) {
    setBusy(true);
    setNotice(null);
    try {
      const { response } = await fn();
      if (response.status !== "ok") setNotice(response.explanation);
      else {
        setConfiguring(false);
        if (!response.optimal) setNotice(t.menu.notOptimal);
      }
    } catch (err) {
      const kind = err instanceof MenuApiError ? err.kind : "server";
      setNotice(
        kind === "offline"
          ? t.menu.needsConnection
          : kind === "catalog"
            ? t.list.noCatalog
            : t.common.error,
      );
    } finally {
      setBusy(false);
    }
  }

  if (household === undefined || plan === undefined) {
    return (
      <Page>
        <p className="text-muted">{t.common.loading}</p>
      </Page>
    );
  }

  const initial: MenuConfig = {
    days: plan ? [...new Set(plan.slots.map((s) => s.day))] : [0, 1, 2, 3, 4, 5, 6],
    meals: plan ? [...new Set(plan.slots.map((s) => s.meal))] : ["comida", "cena"],
    people: plan?.people ?? household?.members ?? 2,
    budget: plan?.budget ?? household?.weeklyBudget ?? null,
    mode: plan?.optimizedFor ?? "aprovechamiento",
    includeBase: plan?.includeBase ?? true,
  };
  const showConfig = configuring || !plan?.summary;

  return (
    <>
      <PageHeader title={t.menu.title}>
        {plan?.summary && !showConfig ? (
          <Button variant="ghost" onClick={() => setConfiguring(true)}>
            {t.menu.newMenu}
          </Button>
        ) : null}
      </PageHeader>
      <Page>
        {!household ? <p className="text-muted">{t.menu.needsHousehold}</p> : null}
        {!online ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {t.menu.needsConnection}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg"
            data-testid="menu-notice"
          >
            {notice}
          </p>
        ) : null}
        <PantryEditor />
        {showConfig && pendingTitle ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {t.menu.pendingRecipe(pendingTitle)}
          </p>
        ) : null}
        {showConfig ? (
          <MenuConfigForm
            initial={initial}
            busy={busy}
            disabled={!household || !online}
            onSubmit={(config) => {
              if (!household) return;
              void run(() =>
                proposeMenu(household, config, pendingTitle ? (addId ?? null) : null),
              ).then(() => setPlaced(true));
            }}
          />
        ) : null}
        {plan?.summary && !showConfig && household ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void menuToList(plan).then((n) => setNotice(t.menu.addedToList(n)))}
              >
                {t.menu.toList}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !online}
                onClick={() => void run(() => regenerate(household, plan))}
                title={t.menu.regenerateHelp}
              >
                {busy ? t.menu.proposing : t.menu.regenerate}
              </Button>
            </div>
            <MenuPlanView
              plan={plan}
              busy={busy}
              online={online}
              pendingTitle={pendingTitle}
              onSwap={(id) => void run(() => swapSlot(household, plan, id))}
              onToggleLock={(id) => void toggleLock(plan, id)}
              onPlace={(id) => {
                if (!addId) return;
                void run(() => placeRecipe(household, plan, id, addId)).then(() => setPlaced(true));
              }}
            />
          </>
        ) : null}
      </Page>
    </>
  );
}

export default function Menu() {
  return (
    <Suspense>
      <MenuPage />
    </Suspense>
  );
}
