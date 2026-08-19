import { processStripeEvent } from "@/lib/orders";
import { verifyStripeWebhook } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  try {
    const rawBody = await request.text();
    const event = await verifyStripeWebhook(rawBody, signature);
    const result = await processStripeEvent(event);
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Webhook could not be verified or processed." }, { status: 400 });
  }
}
