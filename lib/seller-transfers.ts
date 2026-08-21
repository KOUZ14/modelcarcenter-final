import {
  createSellerTransfer,
  reverseSellerTransfer,
  sellerProceedsAfterRefund,
  sellerTransferReversalTarget,
} from "./stripe";

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

export async function processEligibleSellerTransfers(input: {
  database: D1Database;
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const staleProcessingIso = new Date(
    now.getTime() - PROCESSING_RETRY_MINUTES * 60_000,
  ).toISOString();
  const limit = Math.min(RELEASE_BATCH_SIZE, Math.max(1, input.limit ?? RELEASE_BATCH_SIZE));
  const candidates = await input.database
    .prepare(
      `SELECT o.id, o.order_number AS orderNumber, o.seller_id AS sellerId,
        s.stripe_account_id AS stripeAccountId, o.stripe_charge_id AS stripeChargeId,
        o.stripe_transfer_group AS stripeTransferGroup, o.currency,
        o.total_cents AS totalCents, o.refunded_amount_cents AS refundedAmountCents,
        o.seller_proceeds_cents AS sellerProceedsCents,
        o.seller_transfer_amount_cents AS sellerTransferAmountCents,
        o.seller_transfer_reversed_cents AS sellerTransferReversedCents
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
         AND NOT EXISTS (
           SELECT 1 FROM resolution_cases rc
           WHERE rc.order_id = o.id
             AND rc.status NOT IN ('resolved', 'closed', 'denied')
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
           AND NOT EXISTS (
             SELECT 1 FROM resolution_cases rc
             WHERE rc.order_id = orders.id
               AND rc.status NOT IN ('resolved', 'closed', 'denied')
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

      const transfer = await createSellerTransfer({
        orderId: order.id,
        orderNumber: order.orderNumber,
        sellerId: order.sellerId,
        sellerStripeAccountId: order.stripeAccountId,
        chargeId: order.stripeChargeId,
        transferGroup: order.stripeTransferGroup,
        amountCents: releaseAmountCents,
        currency: order.currency,
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
        await reverseSellerTransfer({
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
  });
  return {
    considered: candidates.results?.length ?? 0,
    transferred,
    cancelled,
    failed: failed + reconciliation.failed,
    reversals: reconciliation.reversed,
  };
}

async function reconcileTransferReversals(input: {
  database: D1Database;
  nowIso: string;
  limit: number;
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
      await reverseSellerTransfer({
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
