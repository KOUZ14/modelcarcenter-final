import {
  createSellerTransfer,
  reverseSellerTransfer,
  sellerProceedsAfterRefund,
  sellerTransferReversalTarget,
  retrieveCheckoutSession,
  stripeSettlementDetails,
} from "./stripe.ts";
import { allocateCents } from "./checkout-allocation.ts";

const PROCESSING_RETRY_MINUTES = 15;
const RELEASE_BATCH_SIZE = 50;

type EligibleOrder = {
  id: string;
  orderNumber: string;
  sellerId: string;
  stripeAccountId: string;
  stripeChargeId: string;
  stripeTransferGroup: string;
  currency: string;
  totalCents: number;
  refundedAmountCents: number;
  sellerProceedsCents: number;
  sellerTransferAmountCents: number;
  sellerTransferReversedCents: number;
  preorderDepositCents?: number;
};

type TransferredOrder = {
  id: string;
  stripeTransferId: string;
  totalCents: number;
  refundedAmountCents: number;
  sellerTransferAmountCents: number;
  sellerTransferReversedCents: number;
  sellerProceedsCents: number;
};

export type SellerTransferGateway = {
  retrieveSession?: typeof retrieveCheckoutSession;
  create(input: Parameters<typeof createSellerTransfer>[0]): ReturnType<typeof createSellerTransfer>;
  reverse(input: Parameters<typeof reverseSellerTransfer>[0]): ReturnType<typeof reverseSellerTransfer>;
};

const stripeTransferGateway: SellerTransferGateway = {
  create: createSellerTransfer,
  reverse: reverseSellerTransfer,
  retrieveSession: retrieveCheckoutSession,
};

export async function processEligibleSellerTransfers(input: {
  database: D1Database;
  now?: Date;
  limit?: number;
  gateway?: SellerTransferGateway;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const staleProcessingIso = new Date(
    now.getTime() - PROCESSING_RETRY_MINUTES * 60_000,
  ).toISOString();
  const limit = Math.min(RELEASE_BATCH_SIZE, Math.max(1, input.limit ?? RELEASE_BATCH_SIZE));
  const gateway = input.gateway ?? stripeTransferGateway;
  await reconcileProcessingFees(input.database, gateway, nowIso, limit);
  const candidates = await input.database
    .prepare(
      `SELECT o.id, o.order_number AS orderNumber, o.seller_id AS sellerId,
        s.stripe_account_id AS stripeAccountId, o.stripe_charge_id AS stripeChargeId,
        o.stripe_transfer_group AS stripeTransferGroup, o.currency,
        o.total_cents AS totalCents, o.refunded_amount_cents AS refundedAmountCents,
        o.seller_proceeds_cents AS sellerProceedsCents,
        o.seller_transfer_amount_cents AS sellerTransferAmountCents,
        o.seller_transfer_reversed_cents AS sellerTransferReversedCents,
        o.preorder_deposit_cents AS preorderDepositCents
       FROM orders o
       INNER JOIN sellers s ON s.id = o.seller_id
       WHERE o.payment_flow = 'separate'
         AND o.payment_status IN ('paid', 'partially_refunded')
         AND o.fulfillment_status = 'delivered'
         AND o.payout_eligible_at IS NOT NULL
         AND o.payout_eligible_at <= ?
         AND o.stripe_transfer_id IS NULL
         AND o.stripe_charge_id IS NOT NULL
         AND o.stripe_transfer_group IS NOT NULL
         AND o.seller_proceeds_cents > 0
         AND s.stripe_account_id IS NOT NULL
         AND s.status = 'active'
         AND (
           o.seller_transfer_status IN ('pending', 'failed') OR
           (o.seller_transfer_status = 'processing' AND o.seller_transfer_processing_at < ?)
         )
           AND NOT EXISTS (SELECT 1 FROM preorder_refund_requests pr WHERE pr.order_id=o.id AND pr.status IN ('pending','failed'))
           AND NOT EXISTS (
            SELECT 1 FROM resolution_cases rc
            WHERE rc.order_id = o.id
              AND rc.status NOT IN ('resolved', 'closed', 'denied')
          )
          AND NOT EXISTS (
            SELECT 1 FROM disputes d
            WHERE (d.order_id = o.id OR d.stripe_charge_id = o.stripe_charge_id)
              AND d.status NOT IN ('won', 'prevented', 'warning_closed')
          )
       ORDER BY o.payout_eligible_at, o.created_at
       LIMIT ?`,
    )
    .bind(nowIso, staleProcessingIso, limit)
    .all<EligibleOrder>();

  let transferred = 0;
  let cancelled = 0;
  let failed = 0;
  for (const order of candidates.results ?? []) {
    const releaseAmountCents =
      order.sellerTransferAmountCents > 0
        ? order.sellerTransferAmountCents
        : sellerProceedsAfterRefund({
            totalCents: order.totalCents,
            refundedAmountCents: order.refundedAmountCents,
            sellerProceedsCents: order.sellerProceedsCents,
          });
    if (releaseAmountCents < 1) {
      await markTransferCancelled(input.database, order.id, nowIso);
      cancelled += 1;
      continue;
    }
    const claim = await input.database
      .prepare(
        `UPDATE orders SET seller_transfer_status = 'processing',
          seller_transfer_amount_cents = CASE
            WHEN seller_transfer_amount_cents = 0 THEN ?
            ELSE seller_transfer_amount_cents END,
          seller_transfer_processing_at = ?, seller_transfer_last_error = NULL,
          updated_at = ?
         WHERE id = ? AND stripe_transfer_id IS NULL
           AND payment_flow = 'separate'
           AND payment_status IN ('paid', 'partially_refunded')
           AND fulfillment_status = 'delivered'
           AND payout_eligible_at <= ?
           AND (
             seller_transfer_status IN ('pending', 'failed') OR
             (seller_transfer_status = 'processing' AND seller_transfer_processing_at < ?)
           )
            AND NOT EXISTS (SELECT 1 FROM preorder_refund_requests pr WHERE pr.order_id=orders.id AND pr.status IN ('pending','failed'))
            AND NOT EXISTS (
              SELECT 1 FROM resolution_cases rc
              WHERE rc.order_id = orders.id
                AND rc.status NOT IN ('resolved', 'closed', 'denied')
            )
            AND NOT EXISTS (
              SELECT 1 FROM disputes d
              WHERE (d.order_id = orders.id OR d.stripe_charge_id = orders.stripe_charge_id)
                AND d.status NOT IN ('won', 'prevented', 'warning_closed')
            )`,
      )
      .bind(
        releaseAmountCents,
        nowIso,
        nowIso,
        order.id,
        nowIso,
        staleProcessingIso,
      )
      .run();
    if (Number(claim.meta.changes ?? 0) < 1) continue;

    try {
      const current = await input.database
        .prepare(
          `SELECT payment_status AS paymentStatus,
            refunded_amount_cents AS refundedAmountCents
           FROM orders WHERE id = ?`,
        )
        .bind(order.id)
        .first<{ paymentStatus: string; refundedAmountCents: number }>();
      if (!current || current.paymentStatus === "refunded") {
        await markTransferCancelled(input.database, order.id, nowIso);
        cancelled += 1;
        continue;
      }

      const transfer = await gateway.create({
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerId: order.sellerId,
        sellerStripeAccountId: order.stripeAccountId,
        chargeId: order.stripeChargeId,
        transferGroup: order.stripeTransferGroup,
        amountCents: releaseAmountCents,
        currency: order.currency,
        ...(order.preorderDepositCents ? {combinedPayments:true} : {}),
      });
      await input.database
        .prepare(
          `UPDATE orders SET stripe_transfer_id = ?,
            seller_transfer_status = 'transferred',
            seller_transfer_amount_cents = ?, seller_transferred_at = ?,
            seller_transfer_processing_at = NULL, seller_transfer_last_error = NULL,
            updated_at = ? WHERE id = ?`,
        )
        .bind(
          transfer.id,
          releaseAmountCents,
          nowIso,
          nowIso,
          order.id,
        )
        .run();

      const latest = await input.database
        .prepare(
          `SELECT refunded_amount_cents AS refundedAmountCents,
            seller_transfer_reversed_cents AS sellerTransferReversedCents
           FROM orders WHERE id = ?`,
        )
        .bind(order.id)
        .first<{
          refundedAmountCents: number;
          sellerTransferReversedCents: number;
        }>();
      const targetReversedCents = sellerTransferReversalTarget({
        totalCents: order.totalCents,
        refundedAmountCents: latest?.refundedAmountCents ?? current.refundedAmountCents,
        sellerTransferAmountCents: releaseAmountCents,
        sellerProceedsCents: order.sellerProceedsCents,
      });
      const alreadyReversed = latest?.sellerTransferReversedCents ?? 0;
      if (targetReversedCents > alreadyReversed) {
        await gateway.reverse({
          transferId: transfer.id,
          orderId: order.id,
          amountCents: targetReversedCents - alreadyReversed,
          targetReversedCents,
        });
        await input.database
          .prepare(
            `UPDATE orders SET seller_transfer_reversed_cents = ?,
              seller_transfer_status = CASE WHEN ? >= seller_transfer_amount_cents
                THEN 'reversed' ELSE seller_transfer_status END,
              updated_at = ? WHERE id = ?`,
          )
          .bind(targetReversedCents, targetReversedCents, nowIso, order.id)
          .run();
      }
      transferred += 1;
    } catch (error) {
      failed += 1;
      await input.database
        .prepare(
          `UPDATE orders SET seller_transfer_status = 'failed',
            seller_transfer_processing_at = NULL, seller_transfer_last_error = ?,
            updated_at = ? WHERE id = ? AND stripe_transfer_id IS NULL`,
        )
        .bind(errorMessage(error), nowIso, order.id)
        .run();
    }
  }

  const reconciliation = await reconcileTransferReversals({
    database: input.database,
    nowIso,
    limit,
    gateway,
  });
  return {
    considered: candidates.results?.length ?? 0,
    transferred,
    cancelled,
    failed: failed + reconciliation.failed,
    reversals: reconciliation.reversed,
  };
}

// Stripe can publish the balance transaction after the paid Checkout event.
// Keep proceeds unknown (and ineligible for transfer) until the actual fee arrives.
async function reconcileProcessingFees(
  database: D1Database, gateway: SellerTransferGateway, nowIso: string, limit: number,
) {
  if (!gateway.retrieveSession) return;
  const pending = await database.prepare(`SELECT id, stripe_checkout_session_id AS sessionId,
      total_cents AS totalCents, tax_cents AS taxCents, currency,
      platform_fee_cents AS platformFeeCents, stripe_charge_id AS chargeId, checkout_group_id AS checkoutGroupId,preorder_deposit_cents AS preorderDepositCents
    FROM orders WHERE processing_fee_payer = 'seller'
      AND payment_flow = 'separate' AND payment_processing_fee_cents IS NULL
      AND seller_proceeds_cents IS NULL AND stripe_transfer_id IS NULL
      AND seller_transfer_status IN ('pending', 'failed', 'cancelled')
      AND payment_status IN ('paid', 'partially_refunded', 'refunded')
    ORDER BY updated_at, created_at LIMIT ?`).bind(limit).all<{
      id: string; sessionId: string; totalCents: number; taxCents: number;
      currency: string; platformFeeCents: number; chargeId: string | null; checkoutGroupId: string | null; preorderDepositCents:number;
    }>();
  for (const order of pending.results ?? []) {
    try {
      const session = await gateway.retrieveSession(order.sessionId);
      const charge = typeof session.payment_intent === "object"
        ? session.payment_intent?.latest_charge : null;
      const chargeId = typeof charge === "string" ? charge : charge?.id;
      let allocation: { totalCents: number; taxCents: number; paymentProcessingFeeCents: number | null } | undefined;
      let expectedTotal = order.totalCents;
      let expectedTax = order.taxCents;
      if(order.preorderDepositCents) {
        const deposit=await database.prepare("SELECT l.session_id sessionId,l.tax_cents taxCents FROM preorder_payment_ledger l JOIN preorder_reservations r ON r.id=l.reservation_id WHERE r.order_id=? AND l.kind='deposit'").bind(order.id).first<{sessionId:string;taxCents:number}>();
        if(!deposit) throw new Error("Preorder deposit settlement is missing.");
        const depositSession=await gateway.retrieveSession(deposit.sessionId);
        const depositFee=stripeSettlementDetails(depositSession,0).paymentProcessingFeeCents;
        const balanceFee=stripeSettlementDetails(session,0).paymentProcessingFeeCents;
        if(depositSession.payment_status !== "paid" || depositSession.amount_total !== order.preorderDepositCents || depositSession.currency !== order.currency || depositFee == null || balanceFee == null) throw new Error("Preorder payment fees are not ready.");
        expectedTotal-=order.preorderDepositCents;
        expectedTax-=deposit.taxCents;
        allocation={totalCents:order.totalCents,taxCents:order.taxCents,paymentProcessingFeeCents:depositFee+balanceFee};
      }
      if (order.checkoutGroupId) {
        const siblings = await database.prepare("SELECT id, total_cents AS totalCents, tax_cents AS taxCents FROM orders WHERE checkout_group_id = ? ORDER BY checkout_reservation_id")
          .bind(order.checkoutGroupId).all<{ id: string; totalCents: number; taxCents: number }>();
        const rows = siblings.results ?? [];
        expectedTotal = rows.reduce((sum, row) => sum + row.totalCents, 0);
        expectedTax = rows.reduce((sum, row) => sum + row.taxCents, 0);
        const fee = stripeSettlementDetails(session, 0).paymentProcessingFeeCents;
        const shares = fee === null ? rows.map(() => null) : allocateCents(fee, rows.map((row) => row.totalCents));
        allocation = { totalCents: order.totalCents, taxCents: order.taxCents, paymentProcessingFeeCents: shares[rows.findIndex((row) => row.id === order.id)] ?? null };
        if (session.metadata?.checkout_group_id !== order.checkoutGroupId) throw new Error("Stripe settlement does not match this checkout group.");
      }
      if (session.id !== order.sessionId || session.payment_status !== "paid" ||
          session.amount_total !== expectedTotal || session.currency !== order.currency ||
          (session.total_details?.amount_tax ?? 0) !== expectedTax ||
          session.metadata?.processing_fee_payer !== "seller" || chargeId !== order.chargeId) {
        throw new Error("Stripe settlement does not match this order.");
      }
      const settlement = stripeSettlementDetails(session, order.platformFeeCents, allocation);
      await database.prepare(`UPDATE orders SET payment_processing_fee_cents = ?,
          seller_proceeds_cents = ?, seller_transfer_last_error = NULL, updated_at = ?
        WHERE id = ? AND processing_fee_payer = 'seller' AND stripe_transfer_id IS NULL
          AND payment_processing_fee_cents IS NULL AND seller_proceeds_cents IS NULL
          AND seller_transfer_status IN ('pending', 'failed', 'cancelled')`)
        .bind(settlement.paymentProcessingFeeCents, settlement.sellerProceedsCents, nowIso, order.id).run();
    } catch (error) {
      await database.prepare(`UPDATE orders SET seller_transfer_last_error = ?, updated_at = ?
        WHERE id = ? AND stripe_transfer_id IS NULL AND payment_processing_fee_cents IS NULL`)
        .bind(errorMessage(error), nowIso, order.id).run();
    }
  }
}

async function reconcileTransferReversals(input: {
  database: D1Database;
  nowIso: string;
  limit: number;
  gateway: SellerTransferGateway;
}) {
  const rows = await input.database
    .prepare(
      `SELECT id, stripe_transfer_id AS stripeTransferId, total_cents AS totalCents,
        refunded_amount_cents AS refundedAmountCents,
        seller_transfer_amount_cents AS sellerTransferAmountCents,
        seller_transfer_reversed_cents AS sellerTransferReversedCents,
        seller_proceeds_cents AS sellerProceedsCents
       FROM orders
       WHERE payment_flow = 'separate'
         AND stripe_transfer_id IS NOT NULL
         AND refunded_amount_cents > 0
         AND seller_transfer_reversed_cents < seller_transfer_amount_cents
         AND seller_transfer_status IN ('transferred', 'failed')
       ORDER BY updated_at
       LIMIT ?`,
    )
    .bind(input.limit)
    .all<TransferredOrder>();
  let reversed = 0;
  let failed = 0;
  for (const order of rows.results ?? []) {
    const targetReversedCents = sellerTransferReversalTarget({
      totalCents: order.totalCents,
      refundedAmountCents: order.refundedAmountCents,
      sellerTransferAmountCents: order.sellerTransferAmountCents,
      sellerProceedsCents: order.sellerProceedsCents,
    });
    if (targetReversedCents <= order.sellerTransferReversedCents) continue;
    try {
      await input.gateway.reverse({
        transferId: order.stripeTransferId,
        orderId: order.id,
        amountCents: targetReversedCents - order.sellerTransferReversedCents,
        targetReversedCents,
      });
      await input.database
        .prepare(
          `UPDATE orders SET seller_transfer_reversed_cents = ?,
            seller_transfer_status = CASE WHEN ? >= seller_transfer_amount_cents
              THEN 'reversed' ELSE 'transferred' END,
            seller_transfer_last_error = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(
          targetReversedCents,
          targetReversedCents,
          input.nowIso,
          order.id,
        )
        .run();
      reversed += 1;
    } catch (error) {
      failed += 1;
      await input.database
        .prepare(
          `UPDATE orders SET seller_transfer_status = 'failed',
            seller_transfer_last_error = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(errorMessage(error), input.nowIso, order.id)
        .run();
    }
  }
  return { reversed, failed };
}

async function markTransferCancelled(
  database: D1Database,
  orderId: string,
  nowIso: string,
) {
  await database
    .prepare(
      `UPDATE orders SET seller_transfer_status = 'cancelled',
        seller_transfer_processing_at = NULL, seller_transfer_last_error = NULL,
        updated_at = ? WHERE id = ? AND stripe_transfer_id IS NULL`,
    )
    .bind(nowIso, orderId)
    .run();
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}
