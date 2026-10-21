"use client";

import { formatDate, formatEuro, formatQuantity, type ChainRecipeCost } from "@comparacompra/core";
import { t } from "@/i18n/es";
import type { RecipeLocal } from "@/lib/db";
import type { CostResponse } from "@/lib/recipes";

const chainName = (slug: string) => t.chains[slug] ?? slug;

function ChainCost({
  c,
  recipe,
  nutrition,
}: {
  c: ChainRecipeCost;
  recipe: RecipeLocal;
  nutrition: CostResponse["nutrition"][string] | undefined;
}) {
  const n = nutrition?.perServing ?? null;
  return (
    <details className="rounded-lg border border-border p-3" data-testid="chain-cost">
      <summary className="tap flex cursor-pointer flex-col justify-center">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{chainName(c.chain)}</span>
          <span className="tabular-nums">
            <span className="text-lg font-semibold" data-testid="per-serving">
              {c.costed ? formatEuro(c.perServing) : "—"}
            </span>{" "}
            <span className="text-sm text-muted">{t.recipes.perServing}</span>
          </span>
        </span>
        <span className="text-sm text-muted">
          {c.costed ? `${formatEuro(c.purchaseTotal)} ${t.recipes.purchase}` : null}
          {c.costed ? " · " : null}
          {t.recipes.costed(c.costed, c.costable)}
        </span>
        {c.oldestPriceDate ? (
          <span className="text-sm text-muted">
            {t.recipes.oldestPrice(formatDate(c.oldestPriceDate))}
          </span>
        ) : null}
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {c.ingredients.map((row) => {
          const ing = recipe.ingredients[Number(row.ingredientId)];
          const o = row.offer;
          return (
            <li key={row.ingredientId} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{ing?.name ?? row.ingredientId}</span>
                <span className="tabular-nums">
                  {row.usedCost !== null ? formatEuro(row.usedCost) : "—"}
                </span>
              </div>
              {o ? (
                <p className="text-muted">
                  {formatQuantity(row.usedQuantity, o.unit)} de{" "}
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand underline"
                  >
                    {o.name}
                  </a>{" "}
                  · {formatEuro(o.price)}
                  {row.packs && row.packs > 1 ? ` × ${row.packs}` : ""} ·{" "}
                  {t.result.priceOf(formatDate(o.priceDate))} · {t.list.levelShort[o.level]}
                </p>
              ) : row.issue ? (
                <p className="text-muted">{t.recipes.issues[row.issue]}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-border pt-2 text-sm">
        <p className="font-medium">{t.recipes.nutrition}</p>
        {n ? (
          <>
            <p data-testid="nutrition">
              {n.energyKcal} {t.recipes.kcal} · {t.recipes.proteins}{" "}
              {formatQuantity(n.proteins, "g")} · {t.recipes.carbohydrates}{" "}
              {formatQuantity(n.carbohydrates, "g")} · {t.recipes.fat} {formatQuantity(n.fat, "g")}{" "}
              · {t.recipes.salt} {formatQuantity(n.salt, "g")}
            </p>
            <p className="text-muted">{t.recipes.nutritionSource}</p>
          </>
        ) : (
          <p className="text-muted" data-testid="nutrition-none">
            {t.recipes.nutritionNone}
          </p>
        )}
      </div>
    </details>
  );
}

export function RecipeCost({ cost, recipe }: { cost: CostResponse; recipe: RecipeLocal }) {
  const sorted = [...cost.chains].sort((a, b) => {
    if (!a.costed !== !b.costed) return a.costed ? -1 : 1;
    if (a.costed !== b.costed) return b.costed - a.costed;
    return a.perServing - b.perServing;
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{t.recipes.purchaseHelp}</p>
      {sorted.map((c) => (
        <ChainCost key={c.chain} c={c} recipe={recipe} nutrition={cost.nutrition[c.chain]} />
      ))}
    </div>
  );
}
