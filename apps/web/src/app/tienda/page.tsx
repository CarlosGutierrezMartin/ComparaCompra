"use client";

import { formatDate, formatEuro } from "@comparacompra/core";
import Link from "next/link";
import { useState } from "react";
import { Button, Page, PageHeader, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import type { StoreTripItem, StoreTripLocal } from "@/lib/db";
import { finishTrip, setObservedPrice, toggleTaken, useActiveTrip } from "@/lib/store";
import { useOnline } from "@/lib/useOnline";

function ItemRow({ trip, item }: { trip: StoreTripLocal; item: StoreTripItem }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    item.observedPrice !== null ? String(item.observedPrice).replace(".", ",") : "",
  );
  const inputId = `price-${item.id}`;
  return (
    <li className="flex flex-col gap-1 border-b border-border py-2" data-testid="store-item">
      <label className="tap flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-6 w-6 shrink-0"
          checked={item.checked}
          onChange={() => void toggleTaken(trip.id, item)}
        />
        <span className={`flex-1 ${item.checked ? "text-muted line-through" : ""}`}>
          <span className="font-medium">{item.name}</span>
          {item.quantityText ? <span className="text-muted"> · {item.quantityText}</span> : null}
          <span className="block text-sm text-muted">
            {item.productName
              ? `${item.packs > 1 ? `${item.packs} × ` : ""}${item.productName}`
              : t.store.notHere}
          </span>
        </span>
        {item.price !== null ? (
          <span className="tabular-nums">{formatEuro(item.price * Math.max(1, item.packs))}</span>
        ) : null}
      </label>
      {item.price !== null ? (
        <div className="flex flex-wrap items-center gap-x-4 pl-9 text-sm text-muted">
          <span>{t.result.priceOf(formatDate(item.priceDate ?? ""))}</span>
          {item.productUrl ? (
            <a
              href={item.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap inline-flex items-center text-brand underline"
            >
              {t.store.product}
            </a>
          ) : null}
          {item.observedPrice !== null && !editing ? (
            <span className="text-foreground" data-testid="observed-price">
              {t.store.observed(formatEuro(item.observedPrice))}
            </span>
          ) : null}
          {!editing ? (
            <button
              type="button"
              className="tap text-brand underline"
              onClick={() => setEditing(true)}
            >
              {t.store.realPrice}
            </button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <form
          className="flex items-end gap-2 pl-9"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value.replace(",", "."));
            void setObservedPrice(
              trip.id,
              item,
              value.trim() && n >= 0 ? Math.round(n * 100) / 100 : null,
            ).then(() => setEditing(false));
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {t.store.realPriceLabel(item.name)}
          </label>
          <input
            id={inputId}
            className={`${inputClass} w-28`}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <Button type="submit" variant="secondary">
            {t.store.save}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export default function Tienda() {
  const trip = useActiveTrip();
  const online = useOnline();

  if (trip === undefined) {
    return (
      <Page>
        <p className="text-muted">{t.common.loading}</p>
      </Page>
    );
  }
  if (!trip) {
    return (
      <>
        <PageHeader title={t.store.title} />
        <Page>
          <p className="text-muted">{t.store.empty}</p>
          <Link href="/lista" className="tap inline-flex items-center text-brand underline">
            {t.store.goToList}
          </Link>
        </Page>
      </>
    );
  }

  const sections = [...new Set(trip.items.map((i) => i.aisle))];
  const estimated = trip.items.reduce((s, i) => s + (i.price ?? 0) * Math.max(1, i.packs), 0);
  const taken = trip.items.filter((i) => i.checked).length;

  return (
    <>
      <PageHeader title={t.chains[trip.chainSlug] ?? trip.chainSlug}>
        <span className="text-sm text-muted" data-testid="store-progress">
          {t.store.taken(taken, trip.items.length)}
        </span>
      </PageHeader>
      <Page>
        {!online ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {t.store.savedOffline}
          </p>
        ) : null}
        <p>
          {t.store.estimated}:{" "}
          <span className="font-semibold tabular-nums">{formatEuro(estimated)}</span>
        </p>
        {sections.map((section) => (
          <section key={section} aria-labelledby={`sec-${section}`}>
            <h2 id={`sec-${section}`} className="mt-2 font-semibold">
              {section}
            </h2>
            <ul>
              {trip.items
                .filter((i) => i.aisle === section)
                .map((item) => (
                  <ItemRow key={item.id} trip={trip} item={item} />
                ))}
            </ul>
          </section>
        ))}
        <p className="text-sm text-muted">{t.store.observedHelp}</p>
        <Button
          variant="secondary"
          onClick={() => {
            if (window.confirm(t.store.confirmFinish)) void finishTrip(trip.id);
          }}
        >
          {t.store.finish}
        </Button>
      </Page>
    </>
  );
}
