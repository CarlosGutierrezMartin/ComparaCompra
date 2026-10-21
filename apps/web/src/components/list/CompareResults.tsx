"use client";

import {
  formatDate,
  formatEuro,
  formatQuantity,
  formatUnitPrice,
  type LineChoice,
  type Plan,
} from "@comparacompra/core";
import { useState } from "react";
import { t } from "@/i18n/es";
import type { CompareResponse } from "@/lib/compare";
import type { ListItemLocal } from "@/lib/db";
import { updateItem } from "@/lib/lists";
import { useOnline } from "@/lib/useOnline";

const chainName = (slug: string) => t.chains[slug] ?? slug;

function LineDetail({ choice, item }: { choice: LineChoice; item: ListItemLocal | undefined }) {
  const o = choice.offer;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{item?.label ?? choice.lineId}</p>
        <p className="font-semibold tabular-nums" data-testid="line-cost">
          {formatEuro(choice.cost)}
        </p>
      </div>
      <p className="text-sm">
        {o.name}
        {choice.packs > 1 ? (
          <span className="text-muted">
            {" "}
            · {t.result.packsTimes(choice.packs, formatEuro(o.price))}
          </span>
        ) : null}
      </p>
      <p className="text-sm text-muted">
        {[
          formatUnitPrice(o.unitPrice, o.unit),
          t.result.priceOf(formatDate(o.priceDate)),
          t.list.levelShort[o.level],
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {choice.promoHint ? <p className="text-sm text-brand">{choice.promoHint}</p> : null}
      <div className="flex flex-wrap gap-x-4">
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center text-sm text-brand underline"
        >
          {t.result.viewProduct}
        </a>
        {o.identicalCanonicalId && item && item.canonicalId !== o.identicalCanonicalId ? (
          <button
            type="button"
            className="tap text-left text-sm text-brand underline"
            onClick={() =>
              void updateItem(item.id, {
                canonicalId: o.identicalCanonicalId ?? null,
                canonicalName: o.name,
                level: "identical",
              })
            }
          >
            {t.result.exact}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PlanView({
  plan,
  items,
  result,
}: {
  plan: Plan;
  items: ListItemLocal[];
  result: CompareResponse;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (
    <ul className="flex flex-col divide-y divide-border">
      {plan.lines.map((choice) => {
        const q = result.quantities[choice.lineId];
        return (
          <li key={choice.lineId} className="py-3" data-testid="result-line">
            {plan.chains.length > 1 ? (
              <p className="text-xs font-semibold uppercase text-muted">
                {chainName(choice.chain)}
              </p>
            ) : null}
            <LineDetail choice={choice} item={byId.get(choice.lineId)} />
            {q?.reference ? (
              <p className="text-xs text-muted">
                {t.result.reference(formatQuantity(q.quantity, q.unit))}
              </p>
            ) : null}
          </li>
        );
      })}
      {plan.missing.map((id) => (
        <li key={id} className="py-3 text-muted" data-testid="result-missing">
          <span className="font-medium text-foreground">{byId.get(id)?.label ?? id}</span> ·{" "}
          {t.result.missingHere}
        </li>
      ))}
    </ul>
  );
}

export function CompareResults({
  result,
  items,
  onGoToStore,
}: {
  result: CompareResponse;
  items: ListItemLocal[];
  onGoToStore?: (chain: string) => void;
}) {
  const online = useOnline();
  const [selected, setSelected] = useState<string>("best");
  const total = result.lineCount;
  const byId = new Map(items.map((i) => [i.id, i]));
  const chainPlans: Record<string, Plan> = Object.fromEntries(
    result.perChain.map((c) => [
      c.chain,
      {
        chains: [c.chain],
        total: c.total,
        totalWithFixed: c.total,
        covered: c.covered,
        missing: c.missing,
        lines: c.lines,
      },
    ]),
  );
  const plan =
    selected === "best"
      ? result.bestSingle
      : selected === "pair"
        ? result.bestPair
        : chainPlans[selected];
  const ranked = [...result.perChain].sort((a, b) => b.covered - a.covered || a.total - b.total);

  return (
    <section aria-labelledby="result-title" className="flex flex-col gap-4">
      <h2 id="result-title" className="text-lg font-semibold">
        {t.result.title}
      </h2>
      {!online ? (
        <p className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
          {t.result.staleWarning}
        </p>
      ) : null}

      {result.bestSingle ? (
        <button
          type="button"
          onClick={() => setSelected("best")}
          aria-pressed={selected === "best"}
          className="rounded-xl border-2 border-brand p-4 text-left"
          data-testid="best-single"
        >
          <p className="text-sm text-muted">{t.result.bestSingle}</p>
          <p className="text-xl font-semibold">
            {chainName(result.bestSingle.chains[0] ?? "")} · {formatEuro(result.bestSingle.total)}
          </p>
          <p className="text-sm text-muted">
            {t.result.coverage(result.bestSingle.covered, total)}
          </p>
        </button>
      ) : null}

      {result.bestPair && result.pairSavings ? (
        <button
          type="button"
          onClick={() => setSelected("pair")}
          aria-pressed={selected === "pair"}
          className="rounded-xl border border-border p-4 text-left"
          data-testid="best-pair"
        >
          <p className="text-sm text-muted">{t.result.bestPair}</p>
          <p className="text-lg font-semibold">
            {result.bestPair.chains.map(chainName).join(" + ")} ·{" "}
            {formatEuro(result.bestPair.total)}
          </p>
          <p className="text-sm text-brand">{t.result.saves(formatEuro(result.pairSavings))}</p>
        </button>
      ) : (
        <p className="text-sm text-muted">{t.result.noSplit}</p>
      )}

      <div>
        <h3 className="mb-2 font-semibold">{t.result.perChain}</h3>
        <ul className="flex flex-col gap-1">
          {ranked.map((c) => (
            <li key={c.chain}>
              <button
                type="button"
                onClick={() => setSelected(c.chain)}
                aria-pressed={selected === c.chain}
                className="tap flex w-full items-center justify-between rounded-lg px-3 text-left aria-pressed:bg-surface"
                data-testid={`chain-${c.chain}`}
              >
                <span>{chainName(c.chain)}</span>
                <span className="tabular-nums">
                  {c.covered
                    ? `${formatEuro(c.total)} · ${t.result.coverage(c.covered, total)}`
                    : t.result.noPrices}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {result.unavailable.length ? (
        <div className="rounded-lg bg-surface p-3" data-testid="unavailable">
          <p className="font-medium">{t.result.unavailable}</p>
          <ul className="list-disc pl-5 text-sm">
            {result.unavailable.map((id) => (
              <li key={id}>{byId.get(id)?.label ?? id}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan ? (
        <div className="flex flex-col gap-2">
          <PlanView plan={plan} items={items} result={result} />
          {onGoToStore
            ? plan.chains.map((chain) => (
                <button
                  key={chain}
                  type="button"
                  className="tap rounded-lg bg-brand px-4 font-medium text-white"
                  onClick={() => onGoToStore(chain)}
                >
                  {t.result.goToStore(chainName(chain))}
                </button>
              ))
            : null}
        </div>
      ) : null}
      <p className="text-xs text-muted">{t.result.elapsed(result.elapsedMs)}</p>
    </section>
  );
}
