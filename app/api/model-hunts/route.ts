import { requireAdultConsent } from "@/lib/form-consent";
import { getDb } from "@/db";
import { wantedRequests } from "@/db/schema";
import { searchCatalog } from "@/lib/catalog";
import { readJsonObject, routeError } from "@/lib/http";
import { makeReferenceCode, parseModelHunt } from "@/lib/validation";
import { getCurrentCollector } from "@/lib/collector-auth";
import { modelHuntEmailEnabled } from "@/lib/model-hunt-capabilities";

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
    const collector = await getCurrentCollector(request.headers).catch(() => null);
    const input = await readJsonObject(request);
    requireAdultConsent(input.adultConsent);
    if (collector) input.collectorEmail = collector.user.email;
    const payload = parseModelHunt(input);
    const existing = await searchCatalog({
      q: `${payload.vehicleMake} ${payload.vehicleModel}`,
      scale: payload.preferredScale,
      manufacturer: payload.modelManufacturer ?? "",
      condition: ["mint", "near_mint", "excellent", "good", "fair", "poor"].includes(payload.conditionPreference ?? "") ? payload.conditionPreference! : "",
      pageSize: 4,
    });
    if (existing.products.length && input.continueHunt !== true) {
      return Response.json(
        { error: "We may already have what you're looking for.", products: existing.products },
        { status: 409 },
      );
    }
    const id = crypto.randomUUID();
    const referenceCode = makeReferenceCode();
    await getDb().insert(wantedRequests).values({
      id,
      referenceCode,
      ...payload,
      userId: collector?.user.id ?? null,
    });
    return Response.json({
      ok: true,
      referenceCode,
      message: modelHuntEmailEnabled()
        ? "Your request is saved for review. We'll email you if the team finds a matching listing; a match or response time isn't guaranteed."
        : "Your request is saved for review. Email match alerts are not currently available. Keep your reference number and check your Hunts from your account.",
    }, { status: 201 });
  } catch (error) {
    return routeError(error, "We couldn't start your Model Hunt. Please try again.");
  }
}
