import { attachStripeSession, loadAuthoritativeCart, releaseReservation, releaseStaleReservations, reserveCart } from "@/lib/inventory";
import { readJsonObject } from "@/lib/http";
import { createCheckoutSession } from "@/lib/stripe";
import { getCurrentCollector } from "@/lib/collector-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reservationId: string | null = null;
  try {
    const payload = await readJsonObject(request);
    const collector = await getCurrentCollector(request.headers).catch(() => null);
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const requested = rawItems.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { productId: String(value.productId ?? ""), quantity: Number(value.quantity) };
    });
    await releaseStaleReservations();
    const cart = await loadAuthoritativeCart(requested);
    const reservation = await reserveCart(cart, collector?.user.id ?? null);
    reservationId = reservation.reservationId;
    const session = await createCheckoutSession({
      reservationId,
      sellerId: cart.seller.sellerId,
      sellerStripeAccountId: cart.seller.sellerStripeAccountId!,
      items: cart.items.map((item) => ({
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        priceCents: item.priceCents,
        currency: item.currency,
        quantity: item.quantity,
      })),
      shippingCents: cart.totals.shippingCents,
      platformFeeCents: cart.totals.platformFeeCents,
      expiresAt: reservation.expiresAt,
      buyerUserId: collector?.user.id ?? null,
      buyerEmail: collector?.user.email ?? null,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await attachStripeSession(reservationId, session.id);
    return Response.json({ url: session.url });
  } catch (error) {
    if (reservationId) await releaseReservation(reservationId).catch(console.error);
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    const safe = /cart|product|inventory|available|seller|checkout|configured|payment/i.test(message)
      ? message
      : "Checkout could not be started. Please try again.";
    console.error(error);
    return Response.json({ error: safe }, { status: 400 });
  }
}
