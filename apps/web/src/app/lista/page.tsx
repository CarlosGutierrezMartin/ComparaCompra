"use client";

import { useState } from "react";
import { CompareResults } from "@/components/list/CompareResults";
import { ListInput } from "@/components/list/ListInput";
import { ListItemRow } from "@/components/list/ListItemRow";
import { Button, Page, PageHeader, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import { CompareError, requestCompare, type CompareResponse } from "@/lib/compare";
import { useHousehold } from "@/lib/household";
import { addLines, clearList, ensureActiveList, interpretList, useActiveList } from "@/lib/lists";

export default function Lista() {
  const household = useHousehold();
  const data = useActiveList();
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxStores, setMaxStores] = useState<1 | 2>(2);
  const [fixedCost, setFixedCost] = useState("0");
  const items = data?.items ?? [];

  async function add(text: string) {
    const list = await ensureActiveList();
    const { lines, source } = await interpretList(text);
    await addLines(list.id, lines);
    setNotice(source === "local" ? t.list.interpretedOffline : null);
    setResult(null);
  }

  async function compare() {
    if (!household || !items.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const fixed = Number(fixedCost.replace(",", ".")) || 0;
      setResult(await requestCompare(household, items, { maxStores, fixedCostPerStore: fixed }));
    } catch (err) {
      const kind = err instanceof CompareError ? err.kind : "server";
      setNotice(
        kind === "offline"
          ? t.list.compareOffline
          : kind === "catalog"
            ? t.list.noCatalog
            : t.common.error,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={data?.list?.name ?? t.list.title}>
        {items.length ? (
          <Button
            variant="ghost"
            onClick={() => data?.list && void clearList(data.list.id).then(() => setResult(null))}
          >
            {t.list.clear}
          </Button>
        ) : null}
      </PageHeader>
      <Page>
        <ListInput onSubmit={add} />
        {notice ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {notice}
          </p>
        ) : null}
        {items.length ? (
          <ul aria-label="Productos de la lista">
            {items.map((item) => (
              <ListItemRow key={item.id} item={item} />
            ))}
          </ul>
        ) : data ? (
          <p className="text-muted">{t.list.empty}</p>
        ) : null}
        {items.length ? (
          <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
            <label className="tap flex items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={maxStores === 2}
                onChange={(e) => setMaxStores(e.target.checked ? 2 : 1)}
              />
              {t.result.maxStores}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">{t.result.fixedCost}</span>
              <input
                inputMode="decimal"
                className={inputClass}
                value={fixedCost}
                onChange={(e) => setFixedCost(e.target.value)}
              />
            </label>
            <Button onClick={() => void compare()} disabled={busy}>
              {busy ? t.list.comparing : t.list.compare}
            </Button>
          </div>
        ) : null}
        {result ? <CompareResults result={result} items={items} /> : null}
      </Page>
    </>
  );
}
