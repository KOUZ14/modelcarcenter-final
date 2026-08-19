import { getDb } from "@/db";
import { wantedRequests } from "@/db/schema";
import { searchCatalog } from "@/lib/catalog";
import { readJsonObject, routeError } from "@/lib/http";
import { makeReferenceCode, parseModelHunt } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await searchCatalog({
      q: `${url.searchParams.get("make") ?? ""} ${url.searchParams.get("model") ?? ""}`,
      scale: url.searchParams.get("scale") ?? "",
      manufacturer: url.searchParams.get("manufacturer") ?? "",
      pageSize: 4,
    });
    return Response.json({ products: result.products });
  } catch (error) {
    return routeError(error, "We couldn't check current inventory.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = parseModelHunt(await readJsonObject(request));
    const existing = await searchCatalog({
      q: `${payload.vehicleMake} ${payload.vehicleModel}`,
      scale: payload.preferredScale,
      manufacturer: payload.modelManufacturer ?? "",
      pageSize: 4,
    });
    if (existing.products.length) {
      return Response.json(
        { error: "We may already have what you're looking for.", products: existing.products },
        { status: 409 },
      );
    }
    const id = crypto.randomUUID();
    const referenceCode = makeReferenceCode();
    await getDb().insert(wantedRequests).values({ id, referenceCode, ...payload });
    return Response.json({
      ok: true,
      referenceCode,
      message: "Your Model Hunt is active. We'll email you if we find a match.",
    }, { status: 201 });
  } catch (error) {
    return routeError(error, "We couldn't start your Model Hunt. Please try again.");
  }
}
