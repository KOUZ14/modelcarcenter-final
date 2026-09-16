import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { combinedShippingRequests, sellers, user } from "@/db/schema";
import { loadAuthoritativeCart, type RequestedCartItem, type ResolvedCheckoutShipping } from "./inventory";
import { checkoutCartFingerprint } from "./checkout-shipping";
import { checkoutAddressKey, validateCheckoutDestination } from "./checkout-address";
import { config } from "./config";
import { cleanText, moneyToCents, requiredString, ValidationError } from "./validation";
import { escapeHtml, sendEmail } from "./email";
import { formatMoney } from "./format";

async function notifyShippingRequest(id: string, to: string, subject: string, detail: string, event: string) {
  const url = `${config.siteUrl}/messages#shipping-requests`;
  try {
    await sendEmail({ to, subject, text: `${detail}\n\nReview shipping requests: ${url}`,
      html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(url)}">Review shipping requests</a></p>`,
      idempotencyKey: `combined-shipping-${id}-${event}` });
  } catch { console.error("Combined shipping email failed; the request remains available in Messages."); }
}

export async function listCombinedShippingRequests(userId: string) {
  const rows = await getDb().select({ request: combinedShippingRequests, sellerName: sellers.storeName, ownerUserId: sellers.ownerUserId })
    .from(combinedShippingRequests).innerJoin(sellers, eq(combinedShippingRequests.sellerId, sellers.id))
    .where(or(eq(combinedShippingRequests.buyerUserId, userId), eq(sellers.ownerUserId, userId)))
    .orderBy(desc(combinedShippingRequests.createdAt)).limit(100);
  return rows.map(({ request, sellerName, ownerUserId }) => ({
    id: request.id, sellerId: request.sellerId, sellerName,
    viewerRole: ownerUserId === userId ? "seller" as const : "buyer" as const,
    status: request.status, amountCents: request.amountCents, currency: request.currency,
    carrier: request.carrier, service: request.service, estimatedDays: request.estimatedDays,
    sellerNote: request.sellerNote, expiresAt: request.expiresAt,
    items: JSON.parse(request.items) as Array<{ productId: string; title: string; quantity: number; priceCents: number }>,
    destination: JSON.parse(request.destinationAddress) as ReturnType<typeof validateCheckoutDestination>,
  }));
}

export type CombinedShippingRequest = Awaited<ReturnType<typeof listCombinedShippingRequests>>[number];

export async function requestCombinedShipping(userId: string, items: RequestedCartItem[], destinationInput: unknown) {
  const destination = validateCheckoutDestination(destinationInput, config.shippingCountries);
  const cart = await loadAuthoritativeCart(items);
  if (cart.items.reduce((sum, item) => sum + item.quantity, 0) < 2) throw new ValidationError("Add at least two models from this seller to request combined shipping.");
  const db = getDb();
  const [seller] = await db.select({ ownerUserId: sellers.ownerUserId, email: sellers.contactEmail }).from(sellers).where(eq(sellers.id, cart.seller.sellerId)).limit(1);
  if (!seller?.ownerUserId) throw new ValidationError("This seller cannot respond to shipping requests yet. Standard shipping is still available.");
  if (seller.ownerUserId === userId) throw new ValidationError("You cannot request a quote for your own listings.");
  const fingerprint = checkoutCartFingerprint(cart);
  const existing = await db.select().from(combinedShippingRequests).where(and(eq(combinedShippingRequests.buyerUserId, userId), eq(combinedShippingRequests.sellerId, cart.seller.sellerId)));
  const active = existing.filter((request) => ["pending", "quoted"].includes(request.status) && Date.parse(request.expiresAt) > Date.now());
  const matching = active.find((request) => request.cartFingerprint === fingerprint && checkoutAddressKey(JSON.parse(request.destinationAddress)) === checkoutAddressKey(destination));
  if (matching) return matching.id;
  if (active.length >= 10) throw new ValidationError("You already have several open requests with this seller. Cancel an old request before sending another.");
  const id = crypto.randomUUID();
  await db.insert(combinedShippingRequests).values({ id, sellerId: cart.seller.sellerId, buyerUserId: userId,
    items: JSON.stringify(cart.items.map((item) => ({ productId: item.id, title: item.title, quantity: item.quantity, priceCents: item.priceCents }))),
    cartFingerprint: fingerprint, destinationAddress: JSON.stringify(destination), currency: cart.currency,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  await notifyShippingRequest(id, seller.email, "A buyer requested combined shipping", `A buyer would like one shipping quote for ${cart.items.reduce((sum, item) => sum + item.quantity, 0)} models from ${cart.seller.sellerName}. Review the items and delivery address in Messages, then offer a price and service or decline. The request expires in 7 days.`, "requested");
  return id;
}

export async function respondToCombinedShipping(userId: string, id: string, payload: Record<string, unknown>) {
  const db = getDb();
  const [row] = await db.select({ request: combinedShippingRequests, ownerUserId: sellers.ownerUserId, sellerStatus: sellers.status }).from(combinedShippingRequests)
    .innerJoin(sellers, eq(combinedShippingRequests.sellerId, sellers.id)).where(eq(combinedShippingRequests.id, id)).limit(1);
  if (!row) throw new ValidationError("Shipping request was not found.");
  const { request } = row;
  if (payload.action === "cancel") {
    if (request.buyerUserId !== userId) throw new ValidationError("This shipping request belongs to another buyer.");
    if (!["pending", "quoted"].includes(request.status)) throw new ValidationError("This request cannot be cancelled.");
    const result = await db.update(combinedShippingRequests).set({ status: "cancelled", updatedAt: new Date().toISOString() })
      .where(and(eq(combinedShippingRequests.id, id), eq(combinedShippingRequests.status, request.status))).returning({ id: combinedShippingRequests.id });
    if (!result.length) throw new ValidationError("This request changed. Refresh and try again.");
    return;
  }
  if (row.ownerUserId !== userId || row.sellerStatus !== "active") throw new ValidationError("Only this seller can respond to the shipping request.");
  if (request.status !== "pending" || Date.parse(request.expiresAt) <= Date.now()) throw new ValidationError("This shipping request is no longer open.");
  const decline = payload.action === "decline";
  if (!decline && payload.action !== "quote") throw new ValidationError("Choose quote or decline.");
  const amountCents = decline ? null : moneyToCents(payload.amount, "Combined shipping price");
  if (amountCents !== null && amountCents > config.shippoMaxLabelCostCents) throw new ValidationError("That shipping price exceeds the marketplace limit.");
  const estimatedDays = decline ? null : Number(payload.estimatedDays);
  if (!decline && (!Number.isInteger(estimatedDays) || estimatedDays! < 1 || estimatedDays! > 60)) throw new ValidationError("Enter an estimated transit time between 1 and 60 business days.");
  const result = await db.update(combinedShippingRequests).set({ status: decline ? "declined" : "quoted", amountCents,
    carrier: decline ? null : requiredString(payload.carrier, "carrier", 80),
    service: decline ? null : requiredString(payload.service, "service", 100), estimatedDays,
    sellerNote: cleanText(payload.note, 500), expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(), updatedAt: new Date().toISOString(),
  }).where(and(eq(combinedShippingRequests.id, id), eq(combinedShippingRequests.status, "pending"))).returning({ id: combinedShippingRequests.id });
  if (!result.length) throw new ValidationError("This request changed. Refresh and try again.");
  const [buyer] = await db.select({ email: user.email }).from(user).where(eq(user.id, request.buyerUserId)).limit(1);
  if (buyer) await notifyShippingRequest(id, buyer.email, decline ? "Combined shipping request declined" : "Your combined shipping quote is ready",
    decline ? "The seller could not offer combined shipping. Your items are still in your cart, where you can choose standard shipping."
      : `The seller offered ${formatMoney(amountCents!, request.currency)} for combined shipping. Review the service and price in your cart before paying. This quote expires in 48 hours and applies to the quoted items and delivery address.`, decline ? "declined" : "quoted");
}

export async function resolveCombinedShippingQuote(cart: Awaited<ReturnType<typeof loadAuthoritativeCart>>, id: string, userId: string | null, destinationInput: unknown): Promise<ResolvedCheckoutShipping> {
  const destination = validateCheckoutDestination(destinationInput, config.shippingCountries);
  const [request] = await getDb().select().from(combinedShippingRequests).where(eq(combinedShippingRequests.id, id)).limit(1);
  if (!userId || !request || request.buyerUserId !== userId || request.sellerId !== cart.seller.sellerId) throw new ValidationError("That shipping quote does not belong to this buyer and seller.");
  if (request.status !== "quoted" || request.amountCents === null || Date.parse(request.expiresAt) <= Date.now()) throw new ValidationError("That combined shipping quote is unavailable or expired. Choose standard shipping or request a new quote.");
  if (request.cartFingerprint !== checkoutCartFingerprint(cart) || checkoutAddressKey(JSON.parse(request.destinationAddress)) !== checkoutAddressKey(destination)) throw new ValidationError("Your items or delivery address changed. Request a new combined shipping quote or choose standard shipping.");
  return { mode: "calculated", amountCents: request.amountCents, checkoutShippingQuoteId: null, combinedShippingRequestId: request.id,
    rateId: request.id, carrier: request.carrier, service: request.service, serviceToken: null, estimatedDays: request.estimatedDays, quotedAddress: JSON.stringify(destination) };
}
