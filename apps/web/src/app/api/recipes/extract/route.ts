import { ExtractRequestSchema, type ExtractResponse } from "@/lib/recipe-types";
import { FetchError, fetchPage } from "@/server/safe-fetch";
import { extractJsonLdRecipe, visibleText } from "@/server/schemaorg";
import {
  draftFromRules,
  extractFromImage,
  extractFromPageText,
  extractFromText,
} from "@/server/recipes-ai";

/**
 * POST /api/recipes/extract: convierte texto pegado, un enlace o una foto en un borrador de
 * plato. Con enlace, primero schema.org (sin IA); si la página no lo tiene, IA sobre el texto
 * visible y, sin IA, reglas. De páginas ajenas solo se guardan ingredientes y el enlace.
 */
export async function POST(request: Request) {
  const parsed = ExtractRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const req = parsed.data;

  if (req.kind === "text") {
    const { draft, usedAi } = await extractFromText(req.text);
    return Response.json({
      draft,
      source: usedAi ? "ia" : "reglas",
      usedAi,
    } satisfies ExtractResponse);
  }

  if (req.kind === "image") {
    const draft = await extractFromImage(req.mediaType, req.data);
    if (!draft) {
      return Response.json(
        { error: "No se ha podido leer la foto. Prueba a pegar el texto." },
        { status: 422 },
      );
    }
    return Response.json({ draft, source: "ia", usedAi: true } satisfies ExtractResponse);
  }

  let page: { html: string; url: string };
  try {
    page = await fetchPage(req.url);
  } catch (err) {
    const message = err instanceof FetchError ? err.message : "No se ha podido abrir el enlace";
    return Response.json({ error: message }, { status: 422 });
  }
  const fromSchema = extractJsonLdRecipe(page.html, req.url);
  if (fromSchema) {
    return Response.json({
      draft: fromSchema,
      source: "schema.org",
      usedAi: false,
    } satisfies ExtractResponse);
  }
  const text = visibleText(page.html);
  const fromAi = await extractFromPageText(text, req.url);
  if (fromAi)
    return Response.json({ draft: fromAi, source: "ia", usedAi: true } satisfies ExtractResponse);
  const fromRules = draftFromRules(text, req.url);
  if (!fromRules.ingredients.length) {
    return Response.json(
      { error: "No se han encontrado ingredientes en esa página" },
      { status: 422 },
    );
  }
  return Response.json({
    draft: fromRules,
    source: "reglas",
    usedAi: false,
  } satisfies ExtractResponse);
}
