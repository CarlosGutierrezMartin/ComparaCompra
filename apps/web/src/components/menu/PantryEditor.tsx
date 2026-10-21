"use client";

import {
  LEAVES,
  LEAF_BY_SLUG,
  formatQuantity,
  matchLeaf,
  normalize,
  type BaseUnit,
} from "@comparacompra/core";
import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import { addPantryItem, removePantryItem, usePantry } from "@/lib/menu";

const BY_NAME = new Map(LEAVES.map((l) => [normalize(l.name), l.slug]));

export function PantryEditor() {
  const items = usePantry() ?? [];
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<BaseUnit>("g");
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="tap flex cursor-pointer items-center font-medium">
        {t.menu.pantry} {items.length ? `(${items.length})` : ""}
      </summary>
      <p className="text-sm text-muted">{t.menu.pantryHelp}</p>
      <ul className="my-2 flex flex-col gap-1">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span>
              {p.name} · {formatQuantity(p.quantity, p.unit)}
            </span>
            <button
              type="button"
              className="tap px-2 text-muted"
              aria-label={t.menu.pantryRemove(p.name)}
              onClick={() => void removePantryItem(p.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const slug = BY_NAME.get(normalize(name)) ?? matchLeaf(name)?.slug ?? null;
          const q = Number(qty.replace(",", "."));
          const leaf = slug ? LEAF_BY_SLUG.get(slug) : undefined;
          if (!leaf || !(q > 0)) {
            setError(t.menu.pantryUnknown);
            return;
          }
          setError(null);
          void addPantryItem({
            leafSlug: leaf.slug,
            variant: null,
            name: leaf.name,
            quantity: q,
            unit,
            bestBefore: null,
          }).then(() => {
            setName("");
            setQty("");
          });
        }}
      >
        <label className="flex flex-1 flex-col text-sm">
          {t.menu.pantryName}
          <input
            className={inputClass}
            list="pantry-leaves"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              const slug = BY_NAME.get(normalize(e.target.value));
              const leaf = slug ? LEAF_BY_SLUG.get(slug) : undefined;
              if (leaf) setUnit(leaf.unit);
            }}
          />
        </label>
        <datalist id="pantry-leaves">
          {LEAVES.map((l) => (
            <option key={l.slug} value={l.name} />
          ))}
        </datalist>
        <label className="flex w-20 flex-col text-sm">
          {t.menu.pantryQuantity}
          <input
            className={inputClass}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <label className="flex w-20 flex-col text-sm">
          {t.recipes.unit}
          <select
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value as BaseUnit)}
          >
            {(["g", "ml", "unit"] as const).map((u) => (
              <option key={u} value={u}>
                {t.recipes.units[u]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          {t.menu.pantryAdd}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </details>
  );
}
