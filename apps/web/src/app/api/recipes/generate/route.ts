import { GenerateRequestSchema } from "@/lib/recipe-types";
import { CatalogUnavailableError, leavesOnPromotion } from "@/server/catalog";
import { GenerationError, generateRecipe } from "@/server/recipes-ai";

/** POST /api/recipes/generate: plato propuesto por la IA que respeta alérgenos y dietas. */
export async function POST(request: Request) {
  const parsed = GenerateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const req = parsed.data;
  let cheap: string[] = [];
  if (req.postalCode) {
    try {
      cheap = await leavesOnPromotion(req.postalCode);
    } catch (err) {
      if (!(err instanceof CatalogUnavailableError)) throw err;
    }
  }
  try {
    const draft = await generateRecipe(req, cheap);
    return Response.json({ draft, source: "ia", usedAi: true });
  } catch (err) {
    if (err instanceof GenerationError) {
      return Response.json({ error: err.message, violations: err.violations }, { status: 422 });
    }
    throw err;
  }
}
