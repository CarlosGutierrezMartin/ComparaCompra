"use client";

import Link from "next/link";
import { Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";
import { useRecipes } from "@/lib/recipes";

export default function Platos() {
  const recipes = useRecipes();
  return (
    <>
      <PageHeader title={t.recipes.title}>
        <Link
          href="/platos/nuevo"
          className="tap inline-flex items-center rounded-lg bg-brand px-4 font-medium text-white"
        >
          {t.recipes.add}
        </Link>
      </PageHeader>
      <Page>
        {recipes === undefined ? (
          <p className="text-muted">{t.common.loading}</p>
        ) : recipes.length ? (
          <ul aria-label={t.recipes.title} className="flex flex-col">
            {recipes.map((r) => (
              <li key={r.id} className="border-b border-border">
                <Link
                  href={`/platos/plato?id=${r.id}`}
                  className="tap flex flex-col justify-center py-2"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="text-sm text-muted">
                    {[
                      t.recipes.costFor(r.servings),
                      r.minutes ? `${r.minutes} min` : null,
                      `${r.ingredients.length} ${t.recipes.ingredients.toLowerCase()}`,
                      r.tags.includes("generado") ? t.recipes.generated : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t.recipes.empty}</p>
        )}
      </Page>
    </>
  );
}
