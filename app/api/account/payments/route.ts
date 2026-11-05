import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sellers } from "@/db/schema";
import { requireCollectorApi } from "@/lib/collector-auth";
import { config } from "@/lib/config";
import { readJsonObject, routeError } from "@/lib/http";
import { refreshCollectorStripe, startCollectorStripeOnboarding } from "@/lib/listings";
import { assertRequestOrigin, RequestSecurityError } from "@/lib/request-security";
import { createExpressDashboardLink } from "@/lib/stripe";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let response: Response;
  try {
    assertRequestOrigin(request, config.siteUrl, process.env.NODE_ENV === "production");
    const collector = await requireCollectorApi(request);
    if (collector instanceof Response) response = collector;
    else {
      const payload = await readJsonObject(request);
      // Never accept seller or Stripe account IDs from the browser.
      const [seller] = await getDb().select().from(sellers).where(and(
        eq(sellers.ownerUserId, collector.user.id), eq(sellers.sellerType, "collector"),
      )).limit(1);
      if (!seller) return Response.json({ error: "A collector seller account is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      const action = requiredString(payload.action, "action", 40);
      if (action === "dashboard") {
        if (!seller.stripeAccountId) throw new ValidationError("Connect your payout account first.");
        // Existing funds remain accessible even when new sales are suspended or terms change.
        const link = await createExpressDashboardLink(seller.stripeAccountId);
        response = Response.json({ url: link.url });
      } else if (action === "refresh") {
        response = Response.json(await refreshCollectorStripe(collector.user.id));
      } else if (action === "onboarding") {
        response = Response.json(await startCollectorStripeOnboarding(collector.user, collector.profile,
          requiredString(payload.sellerTermsVersion, "sellerTermsVersion", 40), undefined, "payments"));
      } else throw new ValidationError("Unknown payment action.");
    }
  } catch (error) {
    response = error instanceof RequestSecurityError
      ? Response.json({ error: "Invalid request origin." }, { status: error.status })
      : routeError(error, "Stripe could not be opened or refreshed. Please try again.");
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
