import { compareBasket, type BasketLine } from "@comparacompra/core";
import { CompareRequestSchema } from "@/lib/api-types";
import { CatalogUnavailableError, offersForLine } from "@/server/catalog";

/** POST /api/basket/compare: total por cadena, mejor tienda única y mejor pareja. */
export async function POST(request: Request) {
  const started = performance.now();
  const parsed = CompareRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Petición no válida", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const req = parsed.data;
  try {
    const offers = await Promise.all(
      req.lines.map((l) => offersForLine(l, req.postalCode, req.chains)),
    );
    const lines: BasketLine[] = req.lines.map((l, i) => ({
      id: l.id,
      label: l.label,
      quantity: l.quantity,
      unit: l.unit,
      packs: l.packs ?? null,
      offers: offers[i] ?? [],
    }));
    const result = compareBasket(lines, {
      chains: req.chains,
      maxStores: req.maxStores,
      fixedCostPerStore: req.fixedCostPerStore,
    });
    return Response.json({
      ...result,
      offers: Object.fromEntries(lines.map((l) => [l.id, l.offers])),
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
