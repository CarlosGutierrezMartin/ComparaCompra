"use client";

import { formatQuantity } from "@comparacompra/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RecipeCost } from "@/components/recipes/RecipeCost";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { Button, Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";
import { useHousehold } from "@/lib/household";
import {
  RecipeApiError,
  addRecipeToList,
  deleteRecipe,
  draftFromRecipe,
  requestRecipeCost,
  saveRecipe,
  useRecipe,
  type CostResponse,
} from "@/lib/recipes";

function Plato() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const recipe = useRecipe(id);
  const household = useHousehold();
  const [servings, setServings] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [cost, setCost] = useState<CostResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (recipe === undefined) {
    return (
      <Page>
        <p className="text-muted">{t.common.loading}</p>
      </Page>
    );
  }
  if (recipe === null) {
    return (
      <>
        <PageHeader title={t.recipes.title} />
        <Page>
          <p>{t.recipes.notFound}</p>
          <Link href="/platos" className="text-brand underline">
            {t.recipes.title}
          </Link>
        </Page>
      </>
    );
  }

  const n = servings ?? recipe.servings;
  const f = n / recipe.servings;

  async function calculate() {
    if (!recipe || !household) return;
    setBusy(true);
    setNotice(null);
    try {
      setCost(await requestRecipeCost(household, recipe, n));
    } catch (err) {
      const kind = err instanceof RecipeApiError ? err.kind : "server";
      setNotice(
        kind === "offline"
          ? t.recipes.costOffline
          : kind === "catalog"
            ? t.list.noCatalog
            : t.common.error,
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <>
        <PageHeader title={t.recipes.editTitle} />
        <Page>
          <RecipeEditor
            initial={draftFromRecipe(recipe)}
            saving={busy}
            onSave={(d) =>
              void saveRecipe(d, recipe.id).then(() => {
                setEditing(false);
                setCost(null);
              })
            }
          />
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader title={recipe.title}>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          {t.recipes.edit}
        </Button>
      </PageHeader>
      <Page>
        <div className="flex items-center gap-3">
          <span className="font-medium">{t.recipes.servings}</span>
          <button
            type="button"
            className="tap rounded-lg border border-border px-3"
            aria-label="Menos raciones"
            onClick={() => {
              setServings(Math.max(1, n - 1));
              setCost(null);
            }}
          >
            −
          </button>
          <span className="tabular-nums" data-testid="servings">
            {n}
          </span>
          <button
            type="button"
            className="tap rounded-lg border border-border px-3"
            aria-label="Más raciones"
            onClick={() => {
              setServings(Math.min(50, n + 1));
              setCost(null);
            }}
          >
            +
          </button>
          {recipe.minutes ? (
            <span className="ml-auto text-sm text-muted">{recipe.minutes} min</span>
          ) : null}
        </div>

        <section aria-labelledby="ing-title">
          <h2 id="ing-title" className="font-semibold">
            {t.recipes.ingredients}
          </h2>
          <ul className="mt-1 flex flex-col gap-1">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span>
                  {i.name}
                  {i.optional ? (
                    <span className="text-sm text-muted">
                      {" "}
                      ({t.recipes.optional.toLowerCase()})
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-muted">
                  {i.quantity !== null
                    ? formatQuantity(i.quantity * f, i.unit)
                    : t.recipes.noQuantity}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              void addRecipeToList(recipe, n).then((count) =>
                setNotice(t.recipes.addedToList(count)),
              )
            }
          >
            {t.recipes.addToList}
          </Button>
          <Link
            href={`/menu?add=${recipe.id}`}
            className="tap inline-flex items-center rounded-lg border border-border bg-surface px-4 font-medium"
          >
            {t.recipes.addToMenu}
          </Link>
        </div>

        {notice ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {notice}
          </p>
        ) : null}

        <section aria-labelledby="cost-title" className="flex flex-col gap-2">
          <h2 id="cost-title" className="font-semibold">
            {t.recipes.costTitle} · {t.recipes.costFor(n)}
          </h2>
          {!household ? (
            <p className="text-muted">{t.recipes.needsHousehold}</p>
          ) : cost ? (
            <RecipeCost cost={cost} recipe={recipe} />
          ) : (
            <Button onClick={() => void calculate()} disabled={busy}>
              {busy ? t.recipes.calculating : t.recipes.calculate}
            </Button>
          )}
        </section>

        {recipe.steps.length ? (
          <section aria-labelledby="steps-title">
            <h2 id="steps-title" className="font-semibold">
              {t.recipes.steps}
            </h2>
            <ol className="mt-1 list-decimal pl-5">
              {recipe.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>
        ) : null}
        {recipe.sourceUrl ? (
          <p className="text-sm">
            {t.recipes.source}:{" "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-brand underline"
            >
              {recipe.sourceUrl}
            </a>
          </p>
        ) : null}

        <Button
          variant="ghost"
          className="self-start text-danger"
          onClick={() => {
            if (window.confirm(t.recipes.confirmDelete))
              void deleteRecipe(recipe.id).then(() => router.push("/platos"));
          }}
        >
          {t.recipes.delete}
        </Button>
      </Page>
    </>
  );
}

export default function PlatoPage() {
  return (
    <Suspense>
      <Plato />
    </Suspense>
  );
}
