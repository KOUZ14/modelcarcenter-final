import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import {
  deactivateCollectorListing,
  refreshCollectorStripe,
  saveCollectorListing,
  startCollectorStripeOnboarding,
  submitCollectorListing,
} from "@/lib/listings";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 40);
    if (action === "save") {
      return Response.json({ ok: true, ...await saveCollectorListing({
        user: collector.user,
        profile: collector.profile,
        payload,
        productId: typeof payload.productId === "string" && payload.productId ? payload.productId : null,
      }) });
    }
    if (action === "submit") {
      return Response.json({ ok: true, ...await submitCollectorListing(
        collector.user.id,
        requiredString(payload.productId, "productId", 100),
      ) });
    }
    if (action === "deactivate") {
      await deactivateCollectorListing(collector.user.id, requiredString(payload.productId, "productId", 100));
      return Response.json({ ok: true });
    }
    if (action === "stripe_onboarding") {
      return Response.json({ ok: true, ...await startCollectorStripeOnboarding(collector.user, collector.profile) });
    }
    if (action === "refresh_stripe") {
      return Response.json({ ok: true, ...await refreshCollectorStripe(collector.user.id) });
    }
    throw new ValidationError("Unknown listing action.");
  } catch (error) {
    return routeError(error, "The listing change could not be saved.");
  }
}
