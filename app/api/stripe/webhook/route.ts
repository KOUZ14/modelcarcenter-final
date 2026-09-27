import { processStripeEvent } from "@/lib/orders";
import { verifyStripeWebhook } from "@/lib/stripe";
import { config } from "@/lib/config";
import { assertStripeEventMode } from "@/lib/production-readiness";
import { logSecurityEvent } from "@/lib/security-events";
import { processPromotionStripeEvent } from "@/lib/promotion-payments";
import { processPreorderDepositStripeEvent } from "@/lib/preorder-deposits";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    logSecurityEvent("webhook_rejected", { scope: "stripe", status: 400, reason: "missing_signature" });
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }
  try {
    const rawBody = await request.text();
    const event = await verifyStripeWebhook(rawBody, signature);
    assertStripeEventMode(event.livemode, config.stripeSecretKey);
    const result = await processPreorderDepositStripeEvent(event) ?? await processPromotionStripeEvent(event) ?? await processStripeEvent(event);
    return Response.json({ received: true, ...result });
  } catch {
    logSecurityEvent("webhook_rejected", { scope: "stripe", status: 400, reason: "verification_or_processing_failed" });
    return Response.json({ error: "Webhook could not be verified or processed." }, { status: 400 });
  }
}
