import { getD1 } from "@/db";
import { orders } from "@/db/schema";
import { allocateCents } from "./checkout-allocation";
import { retrieveChargeRefunds, reverseSellerTransfer, sellerTransferReversalTarget } from "./stripe";

export async function reconcileCheckoutRefunds(event: { id: string; type: string }, matched: Array<typeof orders.$inferSelect>) {
  const rows = [...matched].sort((a, b) => a.id.localeCompare(b.id));
  const chargeId = rows[0].stripeChargeId;
  if (!chargeId) throw new Error("Shared checkout refund is missing its charge.");
  const refunds = await retrieveChargeRefunds(chargeId);
  const amounts = new Map(rows.map((order) => [order.id, 0]));
  let unassigned = 0;
  for (const refund of refunds) {
    if (refund.status !== "succeeded") continue;
    const id = refund.metadata?.order_id;
    if (id && amounts.has(id)) amounts.set(id, amounts.get(id)! + refund.amount);
    else unassigned += refund.amount;
  }
  const remaining = rows.map((order) => order.totalCents - amounts.get(order.id)!);
  if (remaining.some((amount) => amount < 0) || unassigned > remaining.reduce((sum, amount) => sum + amount, 0)) throw new Error("Refund exceeds the allocated seller order amounts.");
  // Dashboard refunds without an order reference are apportioned across the
  // remaining seller balances. Application refunds always carry order_id.
  const shared = allocateCents(unassigned, remaining);
  const d1 = getD1();
  const statements = [d1.prepare("INSERT INTO stripe_events (id, type) VALUES (?, ?)").bind(event.id, event.type)];
  for (const [index, order] of rows.entries()) {
    const amount = amounts.get(order.id)! + shared[index];
    let reversed = order.sellerTransferReversedCents;
    if (order.stripeTransferId && order.sellerTransferAmountCents > 0) {
      const target = sellerTransferReversalTarget({ totalCents: order.totalCents, refundedAmountCents: amount, sellerTransferAmountCents: order.sellerTransferAmountCents, sellerProceedsCents: order.sellerProceedsCents ?? order.sellerTransferAmountCents });
      if (target > reversed) {
        await reverseSellerTransfer({ transferId: order.stripeTransferId, orderId: order.id, amountCents: target - reversed, targetReversedCents: target });
        reversed = target;
      }
    }
    statements.push(d1.prepare(`UPDATE orders SET refunded_amount_cents = ?, payment_status = ?,
      seller_transfer_reversed_cents = MAX(seller_transfer_reversed_cents, ?),
      seller_transfer_status = CASE
        WHEN stripe_transfer_id IS NULL AND ? >= total_cents THEN 'cancelled'
        WHEN stripe_transfer_id IS NOT NULL AND ? >= seller_transfer_amount_cents THEN 'reversed'
        ELSE seller_transfer_status END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND refunded_amount_cents <= ?`)
      .bind(amount, amount >= order.totalCents ? "refunded" : amount > 0 ? "partially_refunded" : "paid", reversed, amount, reversed, order.id, amount));
  }
  await d1.batch(statements);
  return { recorded: true, refundUpdated: true };
}
