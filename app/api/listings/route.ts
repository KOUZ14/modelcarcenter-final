import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import {
  deactivateCollectorListing,
  refreshCollectorStripe,
  saveCollectorListing,
  startCollectorStripeOnboarding,
  submitCollectorListing,
} from "@/lib/listings";
import { cleanText, requiredString, ValidationError } from "@/lib/validation";
import { isCurrentPolicyVersion } from "@/lib/legal";

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
      if (!isCurrentPolicyVersion(payload.sellerTermsVersion)) {
        throw new ValidationError("Accept the current Seller Terms before submitting.");
      }
      return Response.json({ ok: true, ...await submitCollectorListing(
        collector.user.id,
        requiredString(payload.productId, "productId", 100),
        requiredString(payload.sellerTermsVersion, "sellerTermsVersion", 40),
      ) });
    }
    if (action === "deactivate") {
      await deactivateCollectorListing(collector.user.id, requiredString(payload.productId, "productId", 100));
      return Response.json({ ok: true });
    }
    if (action === "stripe_onboarding") {
      if (!isCurrentPolicyVersion(payload.sellerTermsVersion)) {
        throw new ValidationError("Accept the current Seller Terms before connecting your payment method.");
      }
      return Response.json({ ok: true, ...await startCollectorStripeOnboarding(
        collector.user,
        collector.profile,
        requiredString(payload.sellerTermsVersion, "sellerTermsVersion", 40),
        payload.productId ? {
          productId: requiredString(payload.productId, "productId", 100),
          collectionItem: cleanText(payload.collectionItem, 100),
          selling: cleanText(payload.selling, 40),
          minimum: cleanText(payload.minimum, 40),
        } : undefined,
      ) });
    }
    if (action === "refresh_stripe") {
      return Response.json({ ok: true, ...await refreshCollectorStripe(collector.user.id) });
    }
    throw new ValidationError("Unknown listing action.");
  } catch (error) {
    return routeError(error, "The listing change could not be saved.");
  }
}
