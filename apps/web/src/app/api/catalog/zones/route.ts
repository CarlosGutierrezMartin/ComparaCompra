import { CatalogUnavailableError, zonesForPostalCode } from "@/server/catalog";

/** GET /api/catalog/zones?postal_code=28001: cadenas con precios para ese código postal. */
export async function GET(request: Request) {
  const pc = new URL(request.url).searchParams.get("postal_code") ?? "";
  if (!/^\d{5}$/.test(pc))
    return Response.json({ error: "Código postal no válido" }, { status: 400 });
  try {
    return Response.json({ postalCode: pc, zones: await zonesForPostalCode(pc) });
  } catch (err) {
    if (err instanceof CatalogUnavailableError)
      return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
