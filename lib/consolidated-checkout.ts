import { getD1 } from "@/db";
import { loadAuthoritativeCheckout, buildCartReservation, releaseReservation, type RequestedCartItem } from "./inventory";
import { resolveCheckoutShipping } from "./checkout-shipping";
import { assertSellerPaymentsReady, createCheckoutSession, expireCheckoutSession, type CheckoutSessionInput } from "./stripe";
import { calculateServerTotals } from "./business";
import { validateCheckoutDestination } from "./checkout-address";
import { config } from "./config";
import { POLICY_VERSION } from "./legal";
import { ValidationError } from "./validation";

export async function startConsolidatedCheckout(
  requested: RequestedCartItem[], selectionsInput: unknown, destinationInput: unknown,
  buyer: { id: string; email: string } | null,
) {
  const destination = validateCheckoutDestination(destinationInput, config.shippingCountries);
  if (!Array.isArray(selectionsInput)) throw new ValidationError("Choose shipping for every selected seller.");
  const selections = new Map<string, unknown>();
  for (const value of selectionsInput) {
    if (!value || typeof value !== "object" || typeof value.sellerId !== "string" || selections.has(value.sellerId)) throw new ValidationError("Invalid seller shipping selection.");
    selections.set(value.sellerId, value.shippingSelection);
  }
  const carts = await loadAuthoritativeCheckout(requested);
  if (selections.size !== carts.length) throw new ValidationError("Choose shipping for every selected seller.");
  const groupId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.checkoutExpirationMinutes * 60_000);
  const resolved = [];
  for (const cart of carts) {
    if (!selections.has(cart.seller.sellerId)) throw new ValidationError("Choose shipping for every selected seller.");
    await assertSellerPaymentsReady(cart.seller.sellerStripeAccountId!, cart.seller.sellerName);
    const shipping = await resolveCheckoutShipping(cart, selections.get(cart.seller.sellerId), buyer?.id ?? null, destination);
    const totals = calculateServerTotals(cart.items, shipping.amountCents, cart.fee.marketplaceFeeBps);
    const reservation = buildCartReservation({ ...cart, totals }, buyer?.id ?? null, POLICY_VERSION, shipping, groupId, expiresAt);
    resolved.push({ cart, shipping, totals, reservation });
  }
  const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare("INSERT INTO checkout_groups (id, currency, total_before_tax_cents, expires_at) VALUES (?, ?, ?, ?)")
        .bind(groupId, carts[0].currency, resolved.reduce((sum, row) => sum + row.totals.totalBeforeTaxCents, 0), expiresAt.toISOString()),
      ...resolved.flatMap((row) => row.reservation.statements),
    ]);
  } catch {
    throw new ValidationError("Inventory or shipping changed while checkout was starting. Review your cart and shipping choices, then try again. Your items are kept.");
  }
  let sessionId: string | null = null;
  try {
    const items: CheckoutSessionInput["items"] = resolved.flatMap(({ cart, shipping, reservation }) => [
      ...cart.items.map((item) => ({ title: `${item.title} — ${cart.seller.sellerName}`, description: item.availabilityType === "preorder" ? `Preorder. Expected release ${item.releaseDate}. ${item.description}` : item.description, imageUrl: item.imageUrl, priceCents: item.priceCents, currency: item.currency, quantity: item.quantity, reservationId: reservation.reservationId })),
      ...(shipping.amountCents > 0 ? [{ title: `Shipping — ${cart.seller.sellerName}`, description: shipping.service ?? "Seller shipping", imageUrl: null, priceCents: shipping.amountCents, currency: cart.currency, quantity: 1, reservationId: reservation.reservationId, shipping: true }] : []),
    ]);
    const returnToken = crypto.randomUUID();
    const session = await createCheckoutSession({
      reservationId: groupId, checkoutGroupId: groupId, sellerId: carts[0].seller.sellerId,
      sellerStripeAccountId: carts[0].seller.sellerStripeAccountId!, items, shippingCents: 0, marketplaceFeeBps: 0,
      platformFeeCents: resolved.reduce((sum, row) => sum + row.totals.platformFeeCents, 0),
      expiresAt, buyerUserId: buyer?.id, buyerEmail: buyer?.email, policyVersion: POLICY_VERSION, deliveryAddress: destination, returnToken,
    });
    sessionId = session.id;
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await d1.batch([
      d1.prepare("UPDATE checkout_groups SET stripe_checkout_session_id = ? WHERE id = ? AND status = 'pending'").bind(session.id, groupId),
      d1.prepare("UPDATE checkout_reservations SET stripe_checkout_session_id = ? WHERE checkout_group_id = ? AND status = 'pending'").bind(session.id, groupId),
    ]);
    return { url: session.url, reservationId: groupId, sessionId, returnToken };
  } catch (error) {
    const closed = !sessionId || await expireCheckoutSession(sessionId).then(() => true).catch(() => false);
    if (closed) await releaseReservation(groupId);
    throw error;
  }
}
