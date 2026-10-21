"use client";

import type { Meal, MenuMode } from "@comparacompra/menu/types";
import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import { MEAL_ORDER, type MenuConfig } from "@/lib/menu";

const MODES: MenuMode[] = ["ahorro", "variedad", "aprovechamiento"];

function Chip({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  name: string;
}) {
  return (
    <label
      className={`tap inline-flex min-w-11 items-center justify-center rounded-full border px-3 text-sm ${checked ? "border-brand bg-brand text-white" : "border-border"}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        aria-label={name}
      />
      {label}
    </label>
  );
}

export function MenuConfigForm({
  initial,
  busy,
  disabled,
  onSubmit,
}: {
  initial: MenuConfig;
  busy: boolean;
  disabled: boolean;
  onSubmit: (c: MenuConfig) => void;
}) {
  const [days, setDays] = useState<number[]>(initial.days);
  const [meals, setMeals] = useState<Meal[]>(initial.meals);
  const [people, setPeople] = useState(String(initial.people));
  const [budget, setBudget] = useState(
    initial.budget ? String(initial.budget).replace(".", ",") : "",
  );
  const [mode, setMode] = useState<MenuMode>(initial.mode);
  const [includeBase, setIncludeBase] = useState(initial.includeBase);

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <form
      className="flex flex-col gap-4"
      aria-label={t.menu.configTitle}
      onSubmit={(e) => {
        e.preventDefault();
        const b = Number(budget.replace(",", "."));
        onSubmit({
          days,
          meals,
          people: Math.min(20, Math.max(1, Math.round(Number(people)) || 1)),
          budget: budget.trim() && b > 0 ? b : null,
          mode,
          includeBase,
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.menu.days}</legend>
        <div className="flex flex-wrap gap-2">
          {t.menu.dayShort.map((d, i) => (
            <Chip
              key={d}
              label={d}
              name={t.menu.dayNames[i] ?? d}
              checked={days.includes(i)}
              onChange={() => setDays(toggle(days, i))}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.menu.meals}</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_ORDER.map((m) => (
            <Chip
              key={m}
              label={t.menu.mealNames[m] ?? m}
              name={t.menu.mealNames[m] ?? m}
              checked={meals.includes(m)}
              onChange={() => setMeals(toggle(meals, m))}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex gap-3">
        <Field id="menu-people" label={t.menu.people}>
          <input
            id="menu-people"
            className={inputClass}
            inputMode="numeric"
            value={people}
            onChange={(e) => setPeople(e.target.value)}
          />
        </Field>
        <Field id="menu-budget" label={t.menu.budget}>
          <input
            id="menu-budget"
            className={inputClass}
            inputMode="decimal"
            value={budget}
            aria-describedby="menu-budget-help"
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
      </div>
      <p id="menu-budget-help" className="-mt-2 text-sm text-muted">
        {t.menu.budgetHelp}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{t.menu.mode}</legend>
        {MODES.map((m) => (
          <label key={m} className="tap flex items-start gap-3 rounded-lg border border-border p-3">
            <input
              type="radio"
              name="menu-mode"
              className="mt-1"
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            <span>
              <span className="font-medium">{t.menu.modes[m]}</span>
              <span className="block text-sm text-muted">{t.menu.modeHelp[m]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="tap flex items-center gap-3">
        <input
          type="checkbox"
          checked={includeBase}
          onChange={(e) => setIncludeBase(e.target.checked)}
        />
        {t.menu.includeBase}
      </label>
      <Button type="submit" disabled={busy || disabled || !days.length || !meals.length}>
        {busy ? t.menu.proposing : t.menu.propose}
      </Button>
    </form>
  );
}
