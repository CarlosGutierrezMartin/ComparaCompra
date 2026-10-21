import { recipeViolations } from "@comparacompra/core";
import {
  RECETARIO,
  ingredientKey,
  loadSolver,
  planMenu,
  type MenuRecipe,
} from "@comparacompra/menu";
import { PlanRequestSchema } from "@/lib/menu-types";
import { CatalogUnavailableError } from "@/server/catalog";
import { packsForRecipes } from "@/server/menu-catalog";

/**
 * POST /api/menu/plan: propone el menú de la semana. También sirve para "cambiar" un hueco
 * (el resto fijado y el plato actual en avoidRecipeIds) y para "regenerar" (solo los
 * bloqueados fijados). Los platos que no cumplen alérgenos o dietas no entran, salvo que el
 * usuario los haya fijado; se devuelven en `excluded` con el motivo.
 */
export async function POST(request: Request) {
  const started = performance.now();
  const parsed = PlanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const req = parsed.data;
  const fixed = new Set(req.slots.map((s) => s.fixedRecipeId).filter(Boolean));
  const all: MenuRecipe[] = [...req.recipes, ...(req.includeBase ? RECETARIO : [])];
  const excluded: { recipeId: string; title: string; reasons: string[] }[] = [];
  const candidates = all.filter((r) => {
    const violations = recipeViolations(
      r.ingredients.filter((i) => !i.optional),
      req.diet,
      req.allergens,
    );
    if (!violations.length || fixed.has(r.id)) return true;
    excluded.push({
      recipeId: r.id,
      title: r.title,
      reasons: violations.map((v) => `${v.ingredient}: ${v.reason}`),
    });
    return false;
  });
  try {
    const { packs, unitWeights } = await packsForRecipes(candidates, req.postalCode, req.chains);
    const solver = await loadSolver();
    const pantry = req.pantry.flatMap((p) => {
      const key = ingredientKey(p);
      return key ? [{ key, quantity: p.quantity, unit: p.unit }] : [];
    });
    const result = planMenu(solver, {
      slots: req.slots,
      recipes: candidates,
      packs,
      unitWeights,
      pantry,
      budget: req.budget,
      mode: req.mode,
    });
    const used = new Set(Object.values(result.assignments));
    return Response.json({
      ...result,
      recipes: candidates.filter((r) => used.has(r.id)),
      excluded,
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
