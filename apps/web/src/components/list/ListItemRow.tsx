"use client";

import { formatQuantity, LEAF_BY_SLUG } from "@comparacompra/core";
import { t } from "@/i18n/es";
import type { EquivalenceLevel, ListItemLocal } from "@/lib/db";
import { removeItem, updateItem } from "@/lib/lists";

export function describeItem(item: ListItemLocal): string {
  const leaf = item.leafSlug ? LEAF_BY_SLUG.get(item.leafSlug) : undefined;
  if (!leaf) return "";
  const parts = [leaf.name];
  if (item.variant) parts.push(item.variant);
  for (const f of item.flags) parts.push(f.replace("_", " "));
  return parts.join(" · ");
}

export function quantityText(
  item: Pick<ListItemLocal, "quantity" | "unit" | "packs" | "people" | "estimated">,
): string {
  const parts: string[] = [];
  if (item.packs) parts.push(t.list.packs(item.packs));
  else if (item.quantity) parts.push(formatQuantity(item.quantity, item.unit));
  if (item.estimated && item.quantity) parts.push(`(${t.list.estimated})`);
  if (item.people) parts.push(t.list.people(item.people));
  return parts.join(" ");
}

export function ListItemRow({ item }: { item: ListItemLocal }) {
  const described = describeItem(item);
  const levels: EquivalenceLevel[] = item.canonicalId
    ? ["identical", "equivalent", "generic"]
    : ["equivalent", "generic"];
  return (
    <li className="flex items-start gap-3 border-b border-border py-3" data-testid="list-item">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">
          {item.label}
          {quantityText(item) ? (
            <span className="font-normal text-muted"> · {quantityText(item)}</span>
          ) : null}
        </p>
        {described ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted">{item.canonicalName ?? described}</span>
            <label className="flex items-center">
              <span className="sr-only">{t.list.level}</span>
              <select
                className="tap rounded-lg border border-border bg-background px-2 text-sm"
                value={item.level}
                onChange={(e) =>
                  void updateItem(item.id, { level: e.target.value as EquivalenceLevel })
                }
              >
                {levels.map((lv) => (
                  <option key={lv} value={lv}>
                    {t.list.levelShort[lv]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="text-sm text-danger">{t.list.unknown}</p>
        )}
      </div>
      <button
        type="button"
        className="tap rounded-lg text-xl text-muted"
        aria-label={t.list.remove(item.label)}
        onClick={() => void removeItem(item.id)}
      >
        ×
      </button>
    </li>
  );
}
