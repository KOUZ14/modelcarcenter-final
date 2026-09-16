import { attachStripeSession, loadAuthoritativeCart, releaseReservation, releaseStaleReservations, reserveCart } from "@/lib/inventory";
import { readJsonObject } from "@/lib/http";
import { assertSellerPaymentsReady, createCheckoutSession, expireCheckoutSession } from "@/lib/stripe";
import { checkoutReturnCookie, closePreviousCheckout } from "@/lib/checkout-return";
import { parseCheckoutShippingAddress } from "@/lib/shipping-rules";
import { ValidationError } from "@/lib/validation";
import { getCurrentCollector } from "@/lib/collector-auth";
import { isCurrentPolicyVersion, POLICY_VERSION } from "@/lib/legal";
import { resolveCheckoutShipping } from "@/lib/checkout-shipping";
import { calculateServerTotals } from "@/lib/business";
import { config } from "@/lib/config";
import { assertLiveCheckoutConfigured, LiveCheckoutUnavailable } from "@/lib/production-readiness";
import { startConsolidatedCheckout } from "@/lib/consolidated-checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reservationId: string | null = null;
  let sessionId: string | null = null;
  try {
    assertLiveCheckoutConfigured(config);
    const payload = await readJsonObject(request);
    if (!isCurrentPolicyVersion(payload.policyVersion)) {
      throw new Error("Accept the current marketplace policies before checkout.");
    }
    const previous = await closePreviousCheckout(request, payload.previousReservationId);
    if (previous?.completedSessionId) {
      return Response.json({ url: `${config.siteUrl}/checkout/success?session_id=${encodeURIComponent(previous.completedSessionId)}` }, {
        headers: { "Cache-Control": "no-store", "Set-Cookie": checkoutReturnCookie(String(payload.previousReservationId)) },
      });
    }
    const collector = await getCurrentCollector(request.headers).catch(() => null);
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const requested = rawItems.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { productId: String(value.productId ?? ""), quantity: Number(value.quantity) };
    });
    await releaseStaleReservations();
    if (payload.sellerSelections !== undefined) {
      const result = await startConsolidatedCheckout(requested, payload.sellerSelections, payload.destination, collector?.user ?? null);
      return Response.json({ url: result.url, reservationId: result.reservationId }, { headers: {
        "Cache-Control": "no-store", "Set-Cookie": checkoutReturnCookie(result.reservationId, result.sessionId, result.returnToken),
      } });
    }
    const loadedCart = await loadAuthoritativeCart(requested);
    await assertSellerPaymentsReady(loadedCart.seller.sellerStripeAccountId!, loadedCart.seller.sellerName);
    const shipping = await resolveCheckoutShipping(
      loadedCart,
      payload.shippingSelection,
      collector?.user.id ?? null,
      payload.destination,
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
    const returnToken = crypto.randomUUID();
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
      deliveryAddress: parseCheckoutShippingAddress(JSON.parse(shipping.quotedAddress!)),
      returnToken,
    });
    sessionId = session.id;
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await attachStripeSession(reservationId, session.id);
    return Response.json({ url: session.url, reservationId }, { headers: {
      "Cache-Control": "no-store", "Set-Cookie": checkoutReturnCookie(reservationId, session.id, returnToken),
    } });
  } catch (error) {
    const closed = !sessionId || await expireCheckoutSession(sessionId).then(() => true).catch(() => false);
    if (reservationId && closed) await releaseReservation(reservationId).catch(console.error);
    if (error instanceof LiveCheckoutUnavailable) {
      return Response.json({ error: error.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    const safe = error instanceof ValidationError || /cart|product|inventory|available|seller|checkout|configured|payment/i.test(message)
      ? message
      : "Checkout could not be started. Please try again.";
    console.error(error);
    return Response.json({ error: safe, ...(error instanceof ValidationError ? { fields: error.fields } : {}) }, { status: 400, headers: { "Cache-Control": "no-store" } });
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
