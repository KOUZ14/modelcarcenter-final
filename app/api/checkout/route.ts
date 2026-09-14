import { attachStripeSession, loadAuthoritativeCart, releaseReservation, releaseStaleReservations, reserveCart } from "@/lib/inventory";
import { readJsonObject } from "@/lib/http";
import { createCheckoutSession, retrieveStripeAccount } from "@/lib/stripe";
import { getCurrentCollector } from "@/lib/collector-auth";
import { isCurrentPolicyVersion, POLICY_VERSION } from "@/lib/legal";
import { resolveCheckoutShipping } from "@/lib/checkout-shipping";
import { calculateServerTotals } from "@/lib/business";
import { config } from "@/lib/config";
import { assertLiveCheckoutConfigured, LiveCheckoutUnavailable } from "@/lib/production-readiness";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reservationId: string | null = null;
  try {
    assertLiveCheckoutConfigured(config);
    const payload = await readJsonObject(request);
    if (!isCurrentPolicyVersion(payload.policyVersion)) {
      throw new Error("Accept the current marketplace policies before checkout.");
    }
    const collector = await getCurrentCollector(request.headers).catch(() => null);
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const requested = rawItems.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { productId: String(value.productId ?? ""), quantity: Number(value.quantity) };
    });
    await releaseStaleReservations();
    const loadedCart = await loadAuthoritativeCart(requested);
    const connectedAccount = await retrieveStripeAccount(
      loadedCart.seller.sellerStripeAccountId!,
    );
    if (!connectedAccount.charges_enabled || !connectedAccount.payouts_enabled) {
      throw new Error(
        "This seller's Stripe account is not ready to accept marketplace payments.",
      );
    }
    const shipping = await resolveCheckoutShipping(
      loadedCart,
      payload.shippingSelection,
      collector?.user.id ?? null,
    );
    const cart = {
      ...loadedCart,
      totals: calculateServerTotals(
        loadedCart.items,
        shipping.amountCents,
        loadedCart.fee.marketplaceFeeBps,
      ),
    };
    const reservation = await reserveCart(
      cart,
      collector?.user.id ?? null,
      POLICY_VERSION,
      shipping,
    );
    reservationId = reservation.reservationId;
    const session = await createCheckoutSession({
      reservationId,
      sellerId: cart.seller.sellerId,
      sellerStripeAccountId: cart.seller.sellerStripeAccountId!,
      items: cart.items.map((item) => ({
        title: item.title,
        description:
          item.availabilityType === "preorder" && item.releaseDate
            ? `Preorder · Expected release ${formatReleaseDate(item.releaseDate)}. ${item.description}`.trim()
            : item.description,
        imageUrl: item.imageUrl,
        priceCents: item.priceCents,
        currency: item.currency,
        quantity: item.quantity,
      })),
      shippingCents: cart.totals.shippingCents,
      marketplaceFeeBps: cart.fee.marketplaceFeeBps,
      platformFeeCents: cart.totals.platformFeeCents,
      expiresAt: reservation.expiresAt,
      buyerUserId: collector?.user.id ?? null,
      buyerEmail: collector?.user.email ?? null,
      policyVersion: POLICY_VERSION,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await attachStripeSession(reservationId, session.id);
    return Response.json({ url: session.url });
  } catch (error) {
    if (reservationId) await releaseReservation(reservationId).catch(console.error);
    if (error instanceof LiveCheckoutUnavailable) {
      return Response.json({ error: error.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    const safe = /cart|product|inventory|available|seller|checkout|configured|payment/i.test(message)
      ? message
      : "Checkout could not be started. Please try again.";
    console.error(error);
    return Response.json({ error: safe }, { status: 400 });
  }
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}
