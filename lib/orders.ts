import { and, asc, eq, inArray } from "drizzle-orm";
import { guardCollectionPayment } from "./collection-payment-guard";
import { getD1, getDb } from "@/db";
import {
  checkoutReservationItems,
  checkoutGroups,
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
  retrieveCheckoutLines,
  reverseSellerTransfer,
  sellerTransferReversalTarget,
  stripeSettlementDetails,
  stripeTransferGroup,
  type StripeCheckoutSession,
} from "./stripe";
import type { ShippingAddress } from "./types";
import { addBusinessDays } from "./reputation-rules";
import { preorderShipAnchor } from "./availability-rules";
import { parseCheckoutShippingAddress } from "./shipping-rules";
import { stripeShippingAddress } from "./checkout-address";
import {
  disputeIsTerminal,
  disputePayoutDisposition,
} from "./stripe-event-rules";
import { allocateCheckoutLines } from "./checkout-allocation";
import { reconcileCheckoutRefunds } from "./checkout-refunds";
import { finalizePreorderPayment, preorderForCheckout, syncPreorderRefund } from "./preorder-payments";

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  created?: number;
  data: { object: Record<string, unknown> };
};

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
    return updateSellerFromAccount(event);
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as {
      id?: string;
      payment_intent?: string;
      amount?: number;
      amount_refunded?: number;
    };
    const amountRefunded = Math.max(0, charge.amount_refunded ?? charge.amount ?? 0);
    const matchedOrders = await db
      .select()
      .from(orders)
      .where(
        charge.id
          ? eq(orders.stripeChargeId, charge.id)
          : eq(orders.stripePaymentIntentId, charge.payment_intent ?? ""),
      );
    if (matchedOrders.length > 1 || matchedOrders[0]?.checkoutGroupId ||
      (matchedOrders[0]?.checkoutReservationId && await preorderForCheckout(matchedOrders[0].checkoutReservationId))) return reconcileCheckoutRefunds(event, matchedOrders);
    const matchedOrder = matchedOrders[0];
    let sellerTransferReversedCents =
      matchedOrder?.sellerTransferReversedCents ?? 0;
    if (
      matchedOrder?.paymentFlow === "separate" &&
      matchedOrder.stripeTransferId &&
      matchedOrder.sellerTransferAmountCents > 0
    ) {
      const targetReversedCents = sellerTransferReversalTarget({
        totalCents: matchedOrder.totalCents,
        refundedAmountCents: amountRefunded,
        sellerTransferAmountCents: matchedOrder.sellerTransferAmountCents,
        sellerProceedsCents:
          matchedOrder.sellerProceedsCents ??
          matchedOrder.sellerTransferAmountCents,
      });
      const amountToReverse = Math.max(
        0,
        targetReversedCents - matchedOrder.sellerTransferReversedCents,
      );
      if (amountToReverse > 0) {
        await reverseSellerTransfer({
          transferId: matchedOrder.stripeTransferId,
          orderId: matchedOrder.id,
          amountCents: amountToReverse,
          targetReversedCents,
        });
        sellerTransferReversedCents = targetReversedCents;
      }
    }
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
        seller_transfer_reversed_cents = CASE
          WHEN payment_flow = 'separate' THEN MAX(seller_transfer_reversed_cents, ?)
          ELSE seller_transfer_reversed_cents
        END,
        seller_transfer_status = CASE
          WHEN payment_flow = 'separate' AND stripe_transfer_id IS NULL AND ? >= total_cents THEN 'cancelled'
          WHEN payment_flow = 'separate' AND stripe_transfer_id IS NOT NULL AND ? >= seller_transfer_amount_cents THEN 'reversed'
          ELSE seller_transfer_status
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE stripe_charge_id = ? OR stripe_payment_intent_id = ?`).bind(
          amountRefunded,
          amountRefunded,
          amountRefunded,
          amountRefunded,
          sellerTransferReversedCents,
          amountRefunded,
          sellerTransferReversedCents,
          charge.id ?? "",
          charge.payment_intent ?? "",
        ),
    ]);
    return { recorded: true, refundUpdated: true };
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed"
  ) {
    return handleDisputeEvent(event);
  }

  if (event.type === "transfer.reversed" || event.type === "transfer.updated") {
    const transfer = event.data.object as {
      id?: string;
      amount?: number;
      amount_reversed?: number;
      reversed?: boolean;
      metadata?: { order_id?: string };
    };
    const amountReversed = Math.max(0, transfer.amount_reversed ?? 0);
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)")
        .bind(event.id, event.type),
      d1
        .prepare(`UPDATE orders SET
          seller_transfer_reversed_cents = MAX(seller_transfer_reversed_cents, ?),
          seller_transfer_status = CASE
            WHEN ? = 1 OR (? > 0 AND ? >= seller_transfer_amount_cents) THEN 'reversed'
            ELSE seller_transfer_status
          END,
          updated_at = CURRENT_TIMESTAMP
          WHERE stripe_transfer_id = ? OR id = ?`)
        .bind(
          amountReversed,
          transfer.reversed ? 1 : 0,
          amountReversed,
          amountReversed,
          transfer.id ?? "",
          transfer.metadata?.order_id ?? "",
        ),
    ]);
    return { recorded: true, transferUpdated: true };
  }

  if (event.type === "refund.updated" || event.type === "refund.failed") {
    const refund = event.data.object as {
      id?: string;
      status?: string;
      failure_reason?: string | null;
    };
    const status =
      refund.status === "succeeded"
        ? "succeeded"
        : refund.status === "failed" || event.type === "refund.failed"
          ? "failed"
          : refund.status === "canceled"
            ? "cancelled"
            : "pending";
    await syncPreorderRefund({ ...refund, status, failure_reason: refund.failure_reason ?? undefined });
    const d1 = getD1();
    const statements = [
      d1
        .prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)")
        .bind(event.id, event.type),
      d1
        .prepare(
          "UPDATE resolution_refunds SET status = ? WHERE stripe_refund_id = ?",
        )
        .bind(status, refund.id ?? ""),
    ];
    if (status === "succeeded") {
      statements.push(
        d1
          .prepare(`UPDATE resolution_cases SET status = 'resolved',
            resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
            WHERE id IN (
              SELECT case_id FROM resolution_refunds WHERE stripe_refund_id = ?
            ) AND status = 'under_review'`)
          .bind(refund.id ?? ""),
      );
    }
    await d1.batch(statements);
    return {
      recorded: true,
      refundStatusUpdated: true,
      status,
      failureReason: refund.failure_reason ?? null,
    };
  }

  await recordEvent(event);
  return { recorded: true, ignored: true };
}

export async function processConnectAccountEvent(event: StripeEvent) {
  const duplicate = await getDb()
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, event.id))
    .limit(1);
  if (duplicate[0]) return { duplicate: true };

  if (event.type === "account.updated") {
    return updateSellerFromAccount(event);
  }
  if (event.type === "payout.failed") {
    const payout = event.data.object as {
      id?: string;
      failure_code?: string | null;
    };
    const code = payout.failure_code?.trim().slice(0, 80);
    return recordConnectAlert(event, {
      type: "payout_failed",
      severity: "critical",
      sourceObjectId: payout.id,
      message: code
        ? `A Stripe payout failed (${code}). The seller must review their payout account.`
        : "A Stripe payout failed. The seller must review their payout account.",
    });
  }
  if (event.type === "account.external_account.updated") {
    const externalAccount = event.data.object as {
      id?: string;
      status?: string | null;
    };
    const status = externalAccount.status?.trim().slice(0, 80) || "updated";
    const needsAttention = ["errored", "verification_failed"].includes(status);
    return recordConnectAlert(event, {
      type: "external_account_updated",
      severity: needsAttention ? "critical" : "info",
      sourceObjectId: externalAccount.id,
      message: needsAttention
        ? `A seller payout account needs attention (${status}).`
        : `A seller payout account was updated (${status}).`,
    });
  }

  await recordEvent(event);
  return { recorded: true, ignored: true };
}

async function handleDisputeEvent(event: StripeEvent) {
  const dispute = event.data.object as {
    id?: string;
    charge?: string | { id?: string } | null;
    payment_intent?: string | { id?: string } | null;
    status?: string;
    reason?: string;
    amount?: number;
    currency?: string;
    evidence_details?: { due_by?: number | null } | null;
  };
  if (!dispute.id) {
    await recordEvent(event);
    return { recorded: true, ignored: true };
  }

  const chargeId =
    typeof dispute.charge === "string"
      ? dispute.charge
      : dispute.charge?.id ?? null;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id ?? null;
  const status = dispute.status?.trim() || "unknown";
  const disposition = disputePayoutDisposition(status);
  const d1 = getD1();
  const order = await d1
    .prepare(`SELECT id, seller_id AS sellerId,
      stripe_transfer_id AS stripeTransferId,
      seller_transfer_status AS sellerTransferStatus
      FROM orders
      WHERE stripe_charge_id = ? OR stripe_payment_intent_id = ? OR id IN (
        SELECT r.order_id FROM preorder_payment_ledger l JOIN preorder_reservations r ON r.id=l.reservation_id
        WHERE l.charge_id=? OR l.payment_intent_id=?)
      LIMIT 1`)
    .bind(chargeId ?? "__missing_charge__", paymentIntentId ?? "__missing_intent__", chargeId ?? "__missing_charge__", paymentIntentId ?? "__missing_intent__")
    .first<{
      id: string;
      sellerId: string;
      stripeTransferId: string | null;
      sellerTransferStatus: string;
    }>();
  const evidenceDueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null;
  const closedAt = disputeIsTerminal(status)
    ? new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()
    : null;
  const statements = [
    d1
      .prepare("INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)")
      .bind(event.id, event.type),
    d1
      .prepare(`INSERT INTO disputes
        (id, order_id, stripe_charge_id, stripe_payment_intent_id, status,
         reason, amount_cents, currency, evidence_due_by, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          order_id = COALESCE(disputes.order_id, excluded.order_id),
          stripe_charge_id = COALESCE(excluded.stripe_charge_id, disputes.stripe_charge_id),
          stripe_payment_intent_id = COALESCE(excluded.stripe_payment_intent_id, disputes.stripe_payment_intent_id),
          status = excluded.status,
          reason = excluded.reason,
          amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          evidence_due_by = excluded.evidence_due_by,
          closed_at = COALESCE(excluded.closed_at, disputes.closed_at),
          updated_at = CURRENT_TIMESTAMP`)
      .bind(
        dispute.id,
        order?.id ?? null,
        chargeId,
        paymentIntentId,
        status,
        dispute.reason?.trim().slice(0, 100) ?? "",
        Math.max(0, dispute.amount ?? 0),
        dispute.currency?.toLowerCase().slice(0, 10) || "usd",
        evidenceDueBy,
        closedAt,
      ),
  ];

  if (order && disposition === "cancel") {
    statements.push(
      d1
        .prepare(`UPDATE orders SET
          seller_transfer_status = CASE
            WHEN payment_flow = 'separate' THEN 'cancelled'
            ELSE seller_transfer_status
          END,
          seller_transfer_last_error = CASE
            WHEN payment_flow = 'separate' THEN ?
            ELSE seller_transfer_last_error
          END,
          updated_at = CURRENT_TIMESTAMP
          WHERE stripe_transfer_id IS NULL AND (stripe_charge_id = ? OR stripe_payment_intent_id = ? OR id=?)`)
        .bind(`Stripe dispute ${dispute.id} was lost.`, chargeId ?? "__missing_charge__", paymentIntentId ?? "__missing_intent__",order.id),
    );
  }
  if (order && disposition === "release") {
    statements.push(
      d1
        .prepare(`UPDATE orders SET
          seller_transfer_status = 'pending',
          seller_transfer_last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
          WHERE stripe_transfer_id IS NULL AND (stripe_charge_id = ? OR stripe_payment_intent_id = ? OR id=?) AND seller_transfer_last_error LIKE 'Stripe dispute %'`)
        .bind(chargeId ?? "__missing_charge__", paymentIntentId ?? "__missing_intent__",order.id),
    );
  }

  await d1.batch(statements);
  return {
    recorded: true,
    disputeUpdated: true,
    disputeId: dispute.id,
    status,
    payoutDisposition: disposition,
    orderMatched: Boolean(order),
    transferAlreadyReleased: Boolean(order?.stripeTransferId),
  };
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
    requirements?: { currently_due?: string[] | null };
  };
  const d1 = getD1();
  const ready =
    account.charges_enabled === true && account.payouts_enabled === true;
  const seller = await findSellerForConnectEvent(event);
  const changed = Boolean(
    seller &&
      (seller.stripeChargesEnabled !== Number(account.charges_enabled === true) ||
        seller.stripePayoutsEnabled !== Number(account.payouts_enabled === true)),
  );
  const currentlyDue = account.requirements?.currently_due?.length ?? 0;
  const statements = [
    d1
      .prepare("INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)")
      .bind(event.id, event.type),
    d1
      .prepare(`UPDATE sellers SET
        stripe_charges_enabled = ?, stripe_payouts_enabled = ?,
        status = CASE
          WHEN status = 'suspended' THEN status
          WHEN ? = 1 AND status IN ('approved', 'onboarding', 'active') THEN 'active'
          WHEN ? = 0 AND status = 'active' THEN 'onboarding'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE stripe_account_id = ? OR id = ?`)
      .bind(
        account.charges_enabled ? 1 : 0,
        account.payouts_enabled ? 1 : 0,
        ready ? 1 : 0,
        ready ? 1 : 0,
        event.account ?? account.id ?? "",
        account.metadata?.seller_id ?? "",
      ),
  ];
  if (seller && (changed || !ready || currentlyDue > 0)) {
    statements.push(
      sellerAlertStatement(d1, event, seller.id, {
        type: "account_updated",
        severity: ready && currentlyDue === 0 ? "info" : "warning",
        sourceObjectId: event.account ?? account.id,
        message:
          ready && currentlyDue === 0
            ? "Stripe confirmed that seller charges and payouts are enabled."
            : `Stripe seller verification needs attention${currentlyDue ? ` (${currentlyDue} requirement${currentlyDue === 1 ? "" : "s"} due)` : ""}.`,
      }),
    );
  }
  await d1.batch(statements);
  return {
    recorded: true,
    sellerUpdated: Boolean(seller),
    ready,
    currentlyDue,
  };
}

type SellerAlertInput = {
  type: "account_updated" | "payout_failed" | "external_account_updated";
  severity: "info" | "warning" | "critical";
  message: string;
  sourceObjectId?: string | null;
};

async function recordConnectAlert(
  event: StripeEvent,
  alert: SellerAlertInput,
) {
  const d1 = getD1();
  const seller = await findSellerForConnectEvent(event);
  const statements = [
    d1
      .prepare("INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)")
      .bind(event.id, event.type),
  ];
  if (seller) {
    statements.push(sellerAlertStatement(d1, event, seller.id, alert));
  }
  await d1.batch(statements);
  return {
    recorded: true,
    alerted: Boolean(seller),
    sellerMatched: Boolean(seller),
  };
}

function sellerAlertStatement(
  d1: D1Database,
  event: StripeEvent,
  sellerId: string,
  alert: SellerAlertInput,
) {
  return d1
    .prepare(`INSERT OR IGNORE INTO seller_alerts
      (id, seller_id, type, severity, message, source_object_id, stripe_event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      event.id,
      sellerId,
      alert.type,
      alert.severity,
      alert.message,
      alert.sourceObjectId ?? null,
      event.id,
    );
}

async function findSellerForConnectEvent(event: StripeEvent) {
  const object = event.data.object as {
    id?: string;
    account?: string;
    metadata?: { seller_id?: string };
  };
  const stripeAccountId =
    event.account ?? object.account ??
    (event.type === "account.updated" ? object.id : undefined) ??
    "";
  return getD1()
    .prepare(`SELECT id,
      stripe_charges_enabled AS stripeChargesEnabled,
      stripe_payouts_enabled AS stripePayoutsEnabled
      FROM sellers
      WHERE stripe_account_id = ? OR id = ?
      LIMIT 1`)
    .bind(stripeAccountId, object.metadata?.seller_id ?? "")
    .first<{
      id: string;
      stripeChargesEnabled: number;
      stripePayoutsEnabled: number;
    }>();
}

async function finalizePaidCheckout(event: StripeEvent, session: StripeCheckoutSession) {
  if (session.metadata?.checkout_group_id) return finalizeGroupedCheckout(event, session);
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) throw new Error("Paid Checkout Session is missing reservation metadata.");
  if (await preorderForCheckout(reservationId)) return finalizePreorderPayment(event, session, preparePaidOrder);
  await guardCollectionPayment(reservationId, session.id, session);
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
  const planned = await preparePaidOrder(session, reservationId);
  await getD1().batch([getD1().prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type), ...planned.statements]);
  await sendPaidOrderEmails(planned.email);
  return { orderId: planned.orderId, orderNumber: planned.orderNumber };
}

async function finalizeGroupedCheckout(event: StripeEvent, session: StripeCheckoutSession) {
  const groupId = session.metadata!.checkout_group_id;
  const db = getDb();
  const [group] = await db.select().from(checkoutGroups).where(eq(checkoutGroups.id, groupId)).limit(1);
  if (!group || (group.stripeCheckoutSessionId && group.stripeCheckoutSessionId !== session.id)) throw new Error("Paid checkout group does not match this payment.");
  if (group.status === "completed") { await recordEvent(event); return { duplicateOrder: true }; }
  if (group.status !== "pending") throw new Error("Paid checkout has released reservations and needs reconciliation.");
  const reservations = await db.select().from(checkoutReservations).where(eq(checkoutReservations.checkoutGroupId, groupId)).orderBy(asc(checkoutReservations.id));
  if (!reservations.length || reservations.some((row) => row.status !== "pending") || session.amount_total == null || session.currency !== group.currency) throw new Error("Paid checkout reservations are incomplete.");
  const processingFee = stripeSettlementDetails(session, reservations.reduce((sum, row) => sum + row.platformFeeCents, 0)).paymentProcessingFeeCents;
  const allocations = allocateCheckoutLines(reservations, await retrieveCheckoutLines(session.id), session.amount_total, session.total_details?.amount_tax ?? 0, processingFee);
  const planned = [];
  for (const allocation of allocations) planned.push(await preparePaidOrder(session, allocation.reservationId, { totalCents: allocation.totalCents, taxCents: allocation.taxCents, paymentProcessingFeeCents: allocation.processingFeeCents }));
  const d1 = getD1();
  await d1.batch([
    d1.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type),
    ...planned.flatMap((row) => row.statements),
    d1.prepare("UPDATE checkout_groups SET status = 'completed', stripe_checkout_session_id = ? WHERE id = ? AND status = 'pending'").bind(session.id, groupId),
  ]);
  for (const row of planned) await sendPaidOrderEmails(row.email);
  return { orders: planned.map(({ orderId, orderNumber }) => ({ orderId, orderNumber })) };
}

export async function preparePaidOrder(session: StripeCheckoutSession, reservationId: string, allocation?: { totalCents: number; taxCents: number; paymentProcessingFeeCents: number | null }) {
  const db = getDb();
  const reservationRows = await db
    .select({
      id: checkoutReservations.id,
      sellerId: checkoutReservations.sellerId,
      status: checkoutReservations.status,
      subtotalCents: checkoutReservations.subtotalCents,
      shippingCents: checkoutReservations.shippingCents,
      shippingMode: checkoutReservations.shippingMode,
      selectedShippingCarrier: checkoutReservations.selectedShippingCarrier,
      selectedShippingService: checkoutReservations.selectedShippingService,
      selectedShippingServiceToken:
        checkoutReservations.selectedShippingServiceToken,
      selectedShippingEstimatedDays:
        checkoutReservations.selectedShippingEstimatedDays,
      shipFromAddress: checkoutReservations.shipFromAddress,
      quotedShippingAddress: checkoutReservations.quotedShippingAddress,
      marketplaceFeeBps: checkoutReservations.marketplaceFeeBps,
      platformFeeCents: checkoutReservations.platformFeeCents,
      currency: checkoutReservations.currency,
      buyerUserId: checkoutReservations.buyerUserId,
      sellerName: sellers.storeName,
      sellerEmail: sellers.contactEmail,
      handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
    })
    .from(checkoutReservations)
    .innerJoin(sellers, eq(checkoutReservations.sellerId, sellers.id))
    .where(eq(checkoutReservations.id, reservationId))
    .limit(1);
  const reservation = reservationRows[0];
  if (!reservation) throw new Error("Checkout reservation was not found.");
  if (reservation.status !== "pending") {
    throw new Error("Checkout reservation has already been handled.");
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
  const shipping = session.metadata?.delivery_address_source === "cart"
    ? stripeShippingAddress(parseCheckoutShippingAddress(JSON.parse(reservation.quotedShippingAddress ?? "null")))
    : normalizeShipping(session);
  const buyerEmail = session.customer_details?.email?.trim().toLowerCase();
  if (!buyerEmail) throw new Error("Paid Checkout Session is missing the buyer email.");
  const orderId = crypto.randomUUID();
  const orderNumber = makeOrderNumber();
  const taxCents = allocation?.taxCents ?? session.total_details?.amount_tax ?? 0;
  const totalCents = allocation?.totalCents ?? session.amount_total ?? reservation.subtotalCents + reservation.shippingCents + taxCents;
  const settlement = stripeSettlementDetails(
    session,
    reservation.platformFeeCents,
    allocation,
  );
  const paidAt = new Date();
  const preorder = await preorderForCheckout(reservationId);
  const preorderAnchor = preorderShipAnchor(
    items.map((item) =>
      item.availabilityTypeSnapshot === "preorder"
        ? item.releaseDateSnapshot
        : null,
    ),
  );
  const paymentFlow =
    session.metadata?.payment_flow === "separate" ? "separate" : "destination";
  const transferGroup =
    paymentFlow === "separate" ? stripeTransferGroup(session.metadata?.checkout_group_id ?? reservationId) : null;
  const shipByAt = addBusinessDays(
    preorderAnchor && preorderAnchor > paidAt ? preorderAnchor : paidAt,
    preorder ? JSON.parse(preorder.reservation.terms).handlingDays : reservation.handlingTimeBusinessDays,
  );
  const d1 = getD1();
  const pendingGuard = `EXISTS (SELECT 1 FROM checkout_reservations WHERE id = ? AND status = 'pending')`;
  const statements: D1PreparedStatement[] = [
    // Fail the whole payment batch if cancellation or another webhook won the race.
    d1.prepare(`UPDATE checkout_reservations SET status = CASE WHEN status = 'pending' THEN 'pending' ELSE NULL END WHERE id = ?`).bind(reservationId),
  ];
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
       payment_flow, stripe_transfer_group, seller_transfer_status,
       buyer_email, currency, subtotal_cents, shipping_cents, shipping_mode,
       selected_shipping_carrier, selected_shipping_service, selected_shipping_service_token,
       selected_shipping_estimated_days, marketplace_fee_bps, platform_fee_cents,
       processing_fee_payer, payment_processing_fee_cents, seller_proceeds_cents, tax_cents, total_cents,
        payment_status, fulfillment_status, buyer_name, shipping_address, ship_from_address, paid_at, ship_by_at, checkout_group_id, checkout_reservation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'unfulfilled', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(orderId, orderNumber, reservation.sellerId, reservation.buyerUserId, session.id, intent, charge,
        paymentFlow, transferGroup, paymentFlow === "separate" ? "pending" : "transferred", buyerEmail,
        session.currency ?? reservation.currency, reservation.subtotalCents, reservation.shippingCents,
        reservation.shippingMode, reservation.selectedShippingCarrier,
        reservation.selectedShippingService, reservation.selectedShippingServiceToken,
        reservation.selectedShippingEstimatedDays,
        reservation.marketplaceFeeBps, reservation.platformFeeCents,
        settlement.processingFeePayer, settlement.paymentProcessingFeeCents, settlement.sellerProceedsCents,
        taxCents, totalCents, shipping.name ?? "", JSON.stringify(shipping),
        reservation.shipFromAddress,
        paidAt.toISOString(), shipByAt.toISOString(), session.metadata?.checkout_group_id ?? null, reservationId),
  );
  for (const item of items) {
    statements.push(
      d1.prepare(`INSERT INTO order_items
        (id, order_id, product_id, product_title_snapshot, seller_sku_snapshot, scale_snapshot,
         manufacturer_snapshot, unit_price_cents, quantity, image_url_snapshot,
         availability_type_snapshot, release_date_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), orderId, item.productId, item.productTitleSnapshot, item.sellerSkuSnapshot,
          item.scaleSnapshot, item.manufacturerSnapshot, item.unitPriceCents, item.quantity, item.imageUrlSnapshot,
          item.availabilityTypeSnapshot, item.releaseDateSnapshot),
    );
  }
  const email = {
    orderNumber,
    sellerName: reservation.sellerName,
    sellerEmail: reservation.sellerEmail,
    buyerEmail,
    currency: session.currency ?? reservation.currency,
    totalCents,
    shippingAddress: shipping,
    items: items.map((item) => ({
      title: item.productTitleSnapshot,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      availabilityType: item.availabilityTypeSnapshot,
      releaseDate: item.releaseDateSnapshot,
    })),
  };
  return { orderId, orderNumber, statements, email };
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
    .where(and(eq(orders.stripeCheckoutSessionId, sessionId), inArray(orders.paymentStatus, ["paid", "partially_refunded", "refunded"])))
    .orderBy(asc(orders.checkoutReservationId));
  if (!orderRows[0]) return null;
  const items = await db
    .select({ orderId: orderItems.orderId, productId: orderItems.productId, title: orderItems.productTitleSnapshot, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents, imageUrl: orderItems.imageUrlSnapshot })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderRows.map((order) => order.id)));
  const sellerOrders = orderRows.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) }));
  return { ...orderRows[0],
    subtotalCents: orderRows.reduce((sum, order) => sum + order.subtotalCents, 0),
    shippingCents: orderRows.reduce((sum, order) => sum + order.shippingCents, 0),
    taxCents: orderRows.reduce((sum, order) => sum + order.taxCents, 0),
    totalCents: orderRows.reduce((sum, order) => sum + order.totalCents, 0),
    items, orders: sellerOrders,
  };
}
