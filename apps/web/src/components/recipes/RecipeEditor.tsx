"use client";

import { LEAF_BY_SLUG, LEAVES, matchLeaf, normalize } from "@comparacompra/core";
import { useId, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import type { IngredientDTO, RecipeDraft } from "@/lib/recipe-types";

const LEAF_BY_NAME = new Map(LEAVES.map((l) => [normalize(l.name), l.slug]));

/** Hoja para lo que escribe el usuario: nombre exacto de la lista o, si no, la más parecida. */
function leafFor(name: string): string | null {
  const exact = LEAF_BY_NAME.get(normalize(name));
  if (exact) return exact;
  const m = matchLeaf(name);
  return m && m.confidence >= 0.6 ? m.slug : null;
}

function parseQty(text: string): number | null {
  const n = Number(text.replace(",", "."));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

const emptyIngredient = (): IngredientDTO => ({
  raw: "",
  name: "",
  leafSlug: null,
  variant: null,
  flags: [],
  quantity: null,
  unit: null,
  optional: false,
});

function IngredientRow({
  ing,
  index,
  listId,
  onChange,
  onRemove,
}: {
  ing: IngredientDTO;
  index: number;
  listId: string;
  onChange: (next: IngredientDTO) => void;
  onRemove: () => void;
}) {
  const [qtyText, setQtyText] = useState(
    ing.quantity === null ? "" : String(ing.quantity).replace(".", ","),
  );
  const leaf = ing.leafSlug ? LEAF_BY_SLUG.get(ing.leafSlug) : undefined;
  const id = `ing-${index}`;
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3" data-testid="ingredient-row">
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-name`} className="sr-only">
          {t.recipes.ingredientName}
        </label>
        <input
          id={`${id}-name`}
          className={inputClass}
          list={listId}
          value={ing.name}
          placeholder={t.recipes.ingredientName}
          onChange={(e) => onChange({ ...ing, name: e.target.value })}
          onBlur={(e) => {
            const slug = leafFor(e.target.value);
            onChange({
              ...ing,
              name: e.target.value,
              raw: ing.raw || e.target.value,
              leafSlug: slug,
              variant: slug === ing.leafSlug ? ing.variant : null,
            });
          }}
        />
        <button
          type="button"
          className="tap px-2 text-muted"
          aria-label={t.recipes.removeIngredient(ing.name)}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-qty`} className="sr-only">
          {t.recipes.quantity}
        </label>
        <input
          id={`${id}-qty`}
          className={`${inputClass} w-24`}
          inputMode="decimal"
          value={qtyText}
          placeholder={t.recipes.quantity}
          onChange={(e) => {
            setQtyText(e.target.value);
            const q = parseQty(e.target.value);
            onChange({
              ...ing,
              quantity: q,
              unit: q === null ? null : (ing.unit ?? leaf?.unit ?? "g"),
            });
          }}
        />
        <label htmlFor={`${id}-unit`} className="sr-only">
          {t.recipes.unit}
        </label>
        <select
          id={`${id}-unit`}
          className={`${inputClass} w-24`}
          value={ing.unit ?? ""}
          disabled={ing.quantity === null}
          onChange={(e) =>
            onChange({ ...ing, unit: (e.target.value || null) as IngredientDTO["unit"] })
          }
        >
          <option value="">—</option>
          {(["g", "ml", "unit"] as const).map((u) => (
            <option key={u} value={u}>
              {t.recipes.units[u]}
            </option>
          ))}
        </select>
        <label className="tap flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ing.optional}
            onChange={(e) => onChange({ ...ing, optional: e.target.checked })}
          />
          {t.recipes.optional}
        </label>
      </div>
      {leaf ? (
        <p className="text-sm text-muted">
          → {leaf.name}
          {ing.variant ? ` ${ing.variant}` : ""}
          {ing.quantity === null && !ing.optional ? ` · ${t.recipes.noQuantity}` : ""}
        </p>
      ) : ing.name.trim() ? (
        <p className="text-sm text-warning-fg">{t.recipes.unmatched}</p>
      ) : null}
    </li>
  );
}

export function RecipeEditor({
  initial,
  onSave,
  saving,
}: {
  initial: RecipeDraft;
  onSave: (draft: RecipeDraft) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<RecipeDraft>(() =>
    initial.ingredients.length ? initial : { ...initial, ingredients: [emptyIngredient()] },
  );
  // Clave estable por fila para no perder el foco al editar.
  const [keys, setKeys] = useState(() => draft.ingredients.map((_, i) => `k${i}`));
  const [stepsText, setStepsText] = useState(initial.steps.join("\n"));
  const [servingsText, setServingsText] = useState(String(initial.servings));
  const [minutesText, setMinutesText] = useState(initial.minutes ? String(initial.minutes) : "");
  const listId = useId();

  function setIngredient(i: number, next: IngredientDTO) {
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((x, j) => (j === i ? next : x)) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const servings = Math.min(50, Math.max(1, Math.round(Number(servingsText)) || 4));
    const minutes = Math.round(Number(minutesText)) || null;
    onSave({
      ...draft,
      servings,
      minutes: minutes && minutes > 0 ? minutes : null,
      steps: stepsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      ingredients: draft.ingredients.filter((i) => i.name.trim()),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={t.recipes.editTitle}>
      <Field id="recipe-title" label={t.recipes.fieldTitle}>
        <input
          id="recipe-title"
          className={inputClass}
          value={draft.title}
          required
          maxLength={200}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </Field>
      <div className="flex gap-3">
        <Field id="recipe-servings" label={t.recipes.servings}>
          <input
            id="recipe-servings"
            className={inputClass}
            inputMode="numeric"
            value={servingsText}
            onChange={(e) => setServingsText(e.target.value)}
          />
        </Field>
        <Field id="recipe-minutes" label={t.recipes.minutes}>
          <input
            id="recipe-minutes"
            className={inputClass}
            inputMode="numeric"
            value={minutesText}
            onChange={(e) => setMinutesText(e.target.value)}
          />
        </Field>
      </div>
      <section aria-labelledby="ingredients-title">
        <h2 id="ingredients-title" className="font-semibold">
          {t.recipes.ingredients}
        </h2>
        <datalist id={listId}>
          {LEAVES.map((l) => (
            <option key={l.slug} value={l.name} />
          ))}
        </datalist>
        <ul>
          {draft.ingredients.map((ing, i) => (
            <IngredientRow
              key={keys[i] ?? `k${i}`}
              ing={ing}
              index={i}
              listId={listId}
              onChange={(next) => setIngredient(i, next)}
              onRemove={() => {
                setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, j) => j !== i) }));
                setKeys((k) => k.filter((_, j) => j !== i));
              }}
            />
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          onClick={() => {
            setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }));
            setKeys((k) => [...k, `n${Date.now()}`]);
          }}
        >
          {t.recipes.addIngredient}
        </Button>
      </section>
      {draft.sourceUrl ? (
        <p className="text-sm">
          {t.recipes.source}:{" "}
          <a
            href={draft.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brand underline"
          >
            {draft.sourceUrl}
          </a>
        </p>
      ) : (
        <Field id="recipe-steps" label={t.recipes.steps} help={t.recipes.stepsHelp}>
          <textarea
            id="recipe-steps"
            className={`${inputClass} min-h-32 py-2`}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
          />
        </Field>
      )}
      <Button type="submit" disabled={saving || !draft.title.trim()}>
        {t.recipes.save}
      </Button>
    </form>
  );
}
