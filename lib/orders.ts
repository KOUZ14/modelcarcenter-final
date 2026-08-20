import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  checkoutReservationItems,
  checkoutReservations,
  orderItems,
  orders,
  sellers,
  stripeEvents,
} from "@/db/schema";
import { sendPaidOrderEmails } from "./email";
import { releaseReservation } from "./inventory";
import {
  retrieveCheckoutSession,
  type StripeCheckoutSession,
} from "./stripe";
import type { ShippingAddress } from "./types";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function processStripeEvent(event: StripeEvent) {
  const db = getDb();
  const duplicate = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id)).limit(1);
  if (duplicate[0]) return { duplicate: true };

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const receivedSession = event.data.object as StripeCheckoutSession;
    const session = receivedSession.id
      ? await retrieveCheckoutSession(receivedSession.id)
      : receivedSession;
    if (session.payment_status === "paid") return finalizePaidCheckout(event, session);
    await recordEvent(event);
    return { recorded: true, waitingForPayment: true };
  }

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as StripeCheckoutSession;
    const reservationId = session.metadata?.reservation_id;
    if (reservationId) await releaseReservation(reservationId);
    await recordEvent(event);
    return { recorded: true, released: Boolean(reservationId) };
  }

  if (event.type === "account.updated") {
    await updateSellerFromAccount(event);
    return { recorded: true, sellerUpdated: true };
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as {
      id?: string;
      payment_intent?: string;
      amount?: number;
      amount_refunded?: number;
    };
    const amountRefunded = Math.max(0, charge.amount_refunded ?? charge.amount ?? 0);
    const d1 = getD1();
    await d1.batch([
      d1.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type),
      d1.prepare(`UPDATE orders SET
        refunded_amount_cents = CASE
          WHEN ? > 0 THEN MIN(total_cents, ?)
          ELSE total_cents
        END,
        payment_status = CASE
          WHEN ? > 0 AND ? < total_cents THEN 'partially_refunded'
          ELSE 'refunded'
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE stripe_charge_id = ? OR stripe_payment_intent_id = ?`).bind(
          amountRefunded,
          amountRefunded,
          amountRefunded,
          amountRefunded,
          charge.id ?? "",
          charge.payment_intent ?? "",
        ),
    ]);
    return { recorded: true, refundUpdated: true };
  }

  await recordEvent(event);
  return { recorded: true, ignored: true };
}

async function recordEvent(event: StripeEvent) {
  await getDb().insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
}

async function updateSellerFromAccount(event: StripeEvent) {
  const account = event.data.object as {
    id?: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    metadata?: { seller_id?: string };
  };
  const d1 = getD1();
  const ready = account.charges_enabled === true && account.payouts_enabled === true;
  await d1.batch([
    d1.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type),
    d1.prepare(`UPDATE sellers SET
      stripe_charges_enabled = ?, stripe_payouts_enabled = ?,
      status = CASE
        WHEN status = 'suspended' THEN status
        WHEN ? = 1 AND status IN ('approved', 'onboarding', 'active') THEN 'active'
        WHEN ? = 0 AND status = 'active' THEN 'onboarding'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE stripe_account_id = ? OR id = ?`)
      .bind(account.charges_enabled ? 1 : 0, account.payouts_enabled ? 1 : 0, ready ? 1 : 0, ready ? 1 : 0, account.id ?? "", account.metadata?.seller_id ?? ""),
  ]);
}

async function finalizePaidCheckout(event: StripeEvent, session: StripeCheckoutSession) {
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) throw new Error("Paid Checkout Session is missing reservation metadata.");
  const db = getDb();
  const existingOrder = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripeCheckoutSessionId, session.id))
    .limit(1);
  if (existingOrder[0]) {
    await recordEvent(event);
    return { duplicateOrder: true };
  }
  const reservationRows = await db
    .select({
      id: checkoutReservations.id,
      sellerId: checkoutReservations.sellerId,
      status: checkoutReservations.status,
      subtotalCents: checkoutReservations.subtotalCents,
      shippingCents: checkoutReservations.shippingCents,
      marketplaceFeeBps: checkoutReservations.marketplaceFeeBps,
      platformFeeCents: checkoutReservations.platformFeeCents,
      currency: checkoutReservations.currency,
      buyerUserId: checkoutReservations.buyerUserId,
      sellerName: sellers.storeName,
      sellerEmail: sellers.contactEmail,
    })
    .from(checkoutReservations)
    .innerJoin(sellers, eq(checkoutReservations.sellerId, sellers.id))
    .where(eq(checkoutReservations.id, reservationId))
    .limit(1);
  const reservation = reservationRows[0];
  if (!reservation) throw new Error("Checkout reservation was not found.");
  if (reservation.status !== "pending") {
    await recordEvent(event);
    return { reservationAlreadyHandled: true };
  }
  const items = await db
    .select()
    .from(checkoutReservationItems)
    .where(eq(checkoutReservationItems.reservationId, reservationId));
  if (!items.length) throw new Error("Checkout reservation has no items.");

  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const charge = typeof session.payment_intent === "object" && session.payment_intent
    ? typeof session.payment_intent.latest_charge === "string"
      ? session.payment_intent.latest_charge
      : session.payment_intent.latest_charge?.id ?? null
    : null;
  const shipping = normalizeShipping(session);
  const buyerEmail = session.customer_details?.email?.trim().toLowerCase();
  if (!buyerEmail) throw new Error("Paid Checkout Session is missing the buyer email.");
  const orderId = crypto.randomUUID();
  const orderNumber = makeOrderNumber();
  const taxCents = session.total_details?.amount_tax ?? 0;
  const totalCents = session.amount_total ?? reservation.subtotalCents + reservation.shippingCents + taxCents;
  const settlement = stripeSettlementDetails(
    session,
    reservation.platformFeeCents,
  );
  const d1 = getD1();
  const pendingGuard = `EXISTS (SELECT 1 FROM checkout_reservations WHERE id = ? AND status = 'pending')`;
  const statements = [d1.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type)];
  for (const item of items) {
    statements.push(
      d1.prepare(`UPDATE products SET
        inventory_quantity = inventory_quantity - ?, reserved_quantity = reserved_quantity - ?,
        status = CASE WHEN inventory_quantity - ? <= 0 THEN 'sold_out' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND ${pendingGuard}`)
        .bind(item.quantity, item.quantity, item.quantity, item.productId, reservationId),
    );
  }
  statements.push(
    d1.prepare(`UPDATE checkout_reservations SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'`).bind(reservationId),
    d1.prepare(`INSERT INTO orders
      (id, order_number, seller_id, buyer_user_id, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
       buyer_email, currency, subtotal_cents, shipping_cents, marketplace_fee_bps, platform_fee_cents,
       payment_processing_fee_cents, seller_proceeds_cents, tax_cents, total_cents,
       payment_status, fulfillment_status, buyer_name, shipping_address, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'unfulfilled', ?, ?, CURRENT_TIMESTAMP)`)
      .bind(orderId, orderNumber, reservation.sellerId, reservation.buyerUserId, session.id, intent, charge, buyerEmail,
        session.currency ?? reservation.currency, reservation.subtotalCents, reservation.shippingCents,
        reservation.marketplaceFeeBps, reservation.platformFeeCents,
        settlement.paymentProcessingFeeCents, settlement.sellerProceedsCents,
        taxCents, totalCents, shipping.name ?? "", JSON.stringify(shipping)),
  );
  for (const item of items) {
    statements.push(
      d1.prepare(`INSERT INTO order_items
        (id, order_id, product_id, product_title_snapshot, seller_sku_snapshot, scale_snapshot,
         manufacturer_snapshot, unit_price_cents, quantity, image_url_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), orderId, item.productId, item.productTitleSnapshot, item.sellerSkuSnapshot,
          item.scaleSnapshot, item.manufacturerSnapshot, item.unitPriceCents, item.quantity, item.imageUrlSnapshot),
    );
  }
  await d1.batch(statements);
  await sendPaidOrderEmails({
    orderNumber,
    sellerName: reservation.sellerName,
    sellerEmail: reservation.sellerEmail,
    buyerEmail,
    currency: session.currency ?? reservation.currency,
    totalCents,
    shippingAddress: shipping,
    items: items.map((item) => ({ title: item.productTitleSnapshot, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
  });
  return { orderId, orderNumber };
}

export function stripeSettlementDetails(
  session: StripeCheckoutSession,
  expectedPlatformFeeCents: number,
) {
  const charge =
    typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent.latest_charge
      : null;
  const expandedCharge =
    charge && typeof charge === "object" ? charge : null;
  if (
    expandedCharge?.application_fee_amount != null &&
    expandedCharge.application_fee_amount !== expectedPlatformFeeCents
  ) {
    throw new Error("Stripe application fee does not match the reserved marketplace fee.");
  }
  const balanceTransaction = expandedCharge?.balance_transaction;
  const paymentProcessingFeeCents =
    balanceTransaction && typeof balanceTransaction === "object"
      ? balanceTransaction.fee
      : null;
  const sellerProceedsCents =
    session.amount_total == null
      ? null
      : Math.max(0, session.amount_total - expectedPlatformFeeCents);
  return { paymentProcessingFeeCents, sellerProceedsCents };
}

function normalizeShipping(session: StripeCheckoutSession): ShippingAddress {
  const source = session.collected_information?.shipping_details ?? session.shipping_details ?? {
    name: session.customer_details?.name,
    address: session.customer_details?.address,
  };
  const address = source?.address ?? {};
  return {
    name: source?.name ?? session.customer_details?.name ?? null,
    address: {
      line1: address.line1 ?? null,
      line2: address.line2 ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      postal_code: address.postal_code ?? null,
      country: address.country ?? null,
    },
  };
}

function makeOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `MCC-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export async function getPublicOrderBySession(sessionId: string) {
  const db = getDb();
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      sellerName: sellers.storeName,
      currency: orders.currency,
      subtotalCents: orders.subtotalCents,
      shippingCents: orders.shippingCents,
      taxCents: orders.taxCents,
      totalCents: orders.totalCents,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      buyerEmail: orders.buyerEmail,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(and(eq(orders.stripeCheckoutSessionId, sessionId), eq(orders.paymentStatus, "paid")))
    .limit(1);
  if (!orderRows[0]) return null;
  const items = await db
    .select({ title: orderItems.productTitleSnapshot, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents, imageUrl: orderItems.imageUrlSnapshot })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderRows[0].id));
  return { ...orderRows[0], items };
}
