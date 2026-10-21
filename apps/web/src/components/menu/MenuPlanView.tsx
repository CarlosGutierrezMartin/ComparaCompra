"use client";

import { formatDate, formatEuro, formatQuantity } from "@comparacompra/core";
import Link from "next/link";
import { Button } from "@/components/ui";
import { t } from "@/i18n/es";
import type { MealPlanLocal } from "@/lib/db";
import { slotId } from "@/lib/menu";

const chainName = (slug: string) => t.chains[slug] ?? slug;

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

export function MenuPlanView({
  plan,
  busy,
  online,
  pendingTitle,
  onSwap,
  onToggleLock,
  onPlace,
}: {
  plan: MealPlanLocal;
  busy: boolean;
  online: boolean;
  pendingTitle: string | null;
  onSwap: (id: string) => void;
  onToggleLock: (id: string) => void;
  onPlace: (id: string) => void;
}) {
  const s = plan.summary;
  const recipes = new Map((s?.recipes ?? []).map((r) => [r.id, r]));
  const days = [...new Set(plan.slots.map((x) => x.day))].sort();
  const oldest = s?.purchases.map((p) => p.option.priceDate).sort()[0];

  return (
    <div className="flex flex-col gap-4">
      {s ? (
        <section aria-label="Resumen del menú" className="grid grid-cols-2 gap-2">
          <Metric
            label={t.menu.metrics.total}
            value={formatEuro(s.metrics.totalCost)}
            testId="menu-total"
          />
          <Metric
            label={t.menu.metrics.perPersonDay}
            value={formatEuro(s.metrics.costPerPersonDay)}
            testId="menu-per-person-day"
          />
          <Metric
            label={t.menu.metrics.products}
            value={String(s.metrics.distinctProducts)}
            testId="menu-products"
          />
          <Metric
            label={t.menu.metrics.waste}
            value={formatEuro(s.metrics.wasteCost)}
            testId="menu-waste"
          />
          {s.savings !== null ? (
            <div className="col-span-2 rounded-lg bg-surface p-3">
              <p className="text-sm text-muted">{t.menu.metrics.savings}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="menu-savings">
                {formatEuro(s.savings)}
              </p>
              <p className="text-sm text-muted">{t.menu.metrics.savingsHelp}</p>
            </div>
          ) : null}
          {oldest ? (
            <p className="col-span-2 text-sm text-muted">{t.menu.priceNote(formatDate(oldest))}</p>
          ) : null}
        </section>
      ) : null}

      {pendingTitle ? (
        <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
          {t.menu.pendingRecipe(pendingTitle)}
        </p>
      ) : null}

      {days.map((day) => (
        <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-2">
          <h2 id={`day-${day}`} className="font-semibold">
            {t.menu.dayNames[day]}
          </h2>
          {plan.slots
            .filter((x) => x.day === day)
            .map((slot) => {
              const id = slotId(slot);
              const r = slot.recipeId ? recipes.get(slot.recipeId) : undefined;
              const isBase = slot.recipeId?.startsWith("base:");
              return (
                <div
                  key={id}
                  className="rounded-lg border border-border p-3"
                  data-testid="menu-slot"
                >
                  <p className="text-sm text-muted">
                    {t.menu.mealNames[slot.meal]} · {slot.servings}{" "}
                    {t.recipes.servings.toLowerCase()}
                    {slot.locked ? ` · ${t.menu.locked}` : ""}
                  </p>
                  <p className="font-medium" data-testid="menu-slot-title">
                    {r ? (
                      isBase ? (
                        r.title
                      ) : (
                        <Link href={`/platos/plato?id=${r.id}`} className="underline">
                          {r.title}
                        </Link>
                      )
                    ) : (
                      t.menu.empty
                    )}
                  </p>
                  {isBase ? <p className="text-sm text-muted">{t.menu.baseRecipe}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-x-4">
                    {pendingTitle ? (
                      <Button variant="ghost" onClick={() => onPlace(id)} disabled={busy}>
                        {t.menu.placeHere}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => onSwap(id)}
                          disabled={busy || !online || slot.locked}
                        >
                          {t.menu.swap}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => onToggleLock(id)}
                          aria-pressed={slot.locked}
                        >
                          {slot.locked ? t.menu.unlock : t.menu.lock}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </section>
      ))}

      {s?.unpriced.length ? (
        <section aria-labelledby="unpriced-title" className="text-sm">
          <h2 id="unpriced-title" className="font-semibold">
            {t.menu.unpriced}
          </h2>
          <p className="text-muted">
            {[...new Set(s.unpriced.map((u) => u.ingredient))].join(", ")}
          </p>
        </section>
      ) : null}
      {s?.excluded.length ? (
        <p className="text-sm text-muted">{t.menu.excluded(s.excluded.length)}</p>
      ) : null}

      {s?.purchases.length ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="tap flex cursor-pointer items-center font-medium">
            {t.menu.purchases} ({s.purchases.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {s.purchases.map((p) => {
              const b = s.balances.find((x) => x.key === p.key);
              return (
                <li key={`${p.key}-${p.option.productId}`}>
                  <p className="flex justify-between gap-2">
                    <a
                      href={p.option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand underline"
                    >
                      {p.packs > 1 ? `${p.packs} × ` : ""}
                      {p.option.name}
                    </a>
                    <span className="tabular-nums">{formatEuro(p.cost)}</span>
                  </p>
                  <p className="text-muted">
                    {[
                      chainName(p.option.chain),
                      t.result.priceOf(formatDate(p.option.priceDate)),
                      b && b.leftover > 0.5
                        ? t.menu.leftover(formatQuantity(b.leftover, b.unit))
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
      {s ? (
        <p className="text-sm text-muted">{t.menu.computedAt(formatDate(s.computedAt))}</p>
      ) : null}
    </div>
  );
}
