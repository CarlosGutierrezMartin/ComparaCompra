"use client";

import { useState, type FormEvent } from "react";
import { t } from "@/i18n/es";
import { ALLERGENS, CHAINS, DIETS, isCoveredPostalCode } from "@/lib/catalog-meta";
import type { HouseholdInput } from "@/lib/household";
import { Button, Field, inputClass } from "./ui";

const EMPTY: HouseholdInput = {
  postalCode: "",
  members: 2,
  weeklyBudget: null,
  chainSlugs: CHAINS.filter((c) => c.hasPrices).map((c) => c.slug),
  diet: [],
  allergens: [],
  disliked: [],
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function HouseholdForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: HouseholdInput | null;
  submitLabel: string;
  onSubmit: (value: HouseholdInput) => Promise<void> | void;
}) {
  const [value, setValue] = useState<HouseholdInput>(initial ?? EMPTY);
  const [budgetText, setBudgetText] = useState(
    initial?.weeklyBudget != null ? String(initial.weeklyBudget).replace(".", ",") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const covered = isCoveredPostalCode(value.postalCode);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(value.postalCode)) {
      setError(t.onboarding.postalCodeInvalid);
      return;
    }
    const budget = budgetText.trim()
      ? Number(budgetText.replace(/\./g, "").replace(",", "."))
      : null;
    setBusy(true);
    try {
      await onSubmit({ ...value, weeklyBudget: budget && budget > 0 ? budget : null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field
        id="postal-code"
        label={t.onboarding.postalCode}
        help={t.onboarding.postalCodeHelp}
        error={error}
      >
        <input
          id="postal-code"
          name="postal-code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          aria-describedby="postal-code-help"
          className={inputClass}
          value={value.postalCode}
          onChange={(e) => {
            setError(null);
            setValue({ ...value, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) });
          }}
        />
      </Field>
      {value.postalCode.length === 5 && !covered ? (
        <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
          {t.onboarding.postalCodeNotCovered}
        </p>
      ) : null}

      <Field id="members" label={t.onboarding.members}>
        <input
          id="members"
          type="number"
          min={1}
          max={20}
          className={inputClass}
          value={value.members}
          onChange={(e) =>
            setValue({ ...value, members: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })
          }
        />
      </Field>

      <Field id="budget" label={t.onboarding.budget} help={t.onboarding.budgetHelp}>
        <input
          id="budget"
          inputMode="decimal"
          aria-describedby="budget-help"
          className={inputClass}
          value={budgetText}
          placeholder="80"
          onChange={(e) => setBudgetText(e.target.value.replace(/[^\d.,]/g, ""))}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.onboarding.chains}</legend>
        {CHAINS.map((c) => (
          <label key={c.slug} className="tap flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={value.chainSlugs.includes(c.slug)}
              onChange={() => setValue({ ...value, chainSlugs: toggle(value.chainSlugs, c.slug) })}
            />
            <span>
              {t.chains[c.slug]}
              {c.hasPrices ? null : (
                <span className="text-sm text-muted"> ({t.onboarding.chainNoPrices})</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.onboarding.diet}</legend>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <label
              key={d}
              className="tap flex items-center gap-2 rounded-lg border border-border px-3"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={value.diet.includes(d)}
                onChange={() => setValue({ ...value, diet: toggle(value.diet, d) })}
              />
              {t.diets[d]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.onboarding.allergens}</legend>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((a) => (
            <label
              key={a}
              className="tap flex items-center gap-2 rounded-lg border border-border px-3"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={value.allergens.includes(a)}
                onChange={() => setValue({ ...value, allergens: toggle(value.allergens, a) })}
              />
              {t.allergens[a]}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
