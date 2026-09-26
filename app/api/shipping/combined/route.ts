import { requireCollectorApi } from "@/lib/collector-auth";
import { listCombinedShippingRequests, requestCombinedShipping, respondToCombinedShipping } from "@/lib/combined-shipping";
import { readJsonObject, routeError } from "@/lib/http";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try { return Response.json({ requests: await listCombinedShippingRequests(collector.user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return routeError(error, "Shipping requests are temporarily unavailable."); }
}

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    const payload = await readJsonObject(request);
    let id: string;
    if (payload.action === "request") {
      if (!Array.isArray(payload.items) || payload.items.length > 25) throw new ValidationError("Choose up to 25 cart items.");
      const items = payload.items.map((item) => ({ productId: String(item?.productId ?? ""), quantity: Number(item?.quantity) }));
      id = await requestCombinedShipping(collector.user.id, items, payload.destination);
    } else {
      id = requiredString(payload.id, "request", 100);
      await respondToCombinedShipping(collector.user.id, id, payload);
    }
    return Response.json({ id, requests: await listCombinedShippingRequests(collector.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error, "The shipping request could not be saved."); }
}
