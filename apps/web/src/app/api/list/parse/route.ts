import { ParseRequestSchema } from "@/lib/api-types";
import { parseListWithAi } from "@/server/listparse-ai";

/** POST /api/list/parse: texto de la lista -> líneas con producto canónico y cantidad. */
export async function POST(request: Request) {
  const parsed = ParseRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(await parseListWithAi(parsed.data.text));
}
