import { sellerProceedsAfterRefund, type SellerFeeAmounts } from "./seller-proceeds.ts";

export type CollectorPayment = SellerFeeAmounts & {
  id: string; orderNumber: string; currency: string; createdAt: string;
  subtotalCents: number; shippingCents: number; marketplaceFeeBps: number;
  sellerProceedsCents: number | null; shippingLabelCostCents: number;
  refundedAmountCents: number; paymentStatus: string; paymentFlow: string;
  sellerTransferStatus: string; sellerTransferAmountCents: number; sellerTransferReversedCents: number;
  payoutEligibleAt: string | null; sellerTransferredAt: string | null;
  payoutHold: boolean; isTestOrder: boolean;
};

export function collectorPaymentState(order: CollectorPayment) {
  if (order.paymentFlow === "destination") return { label: "Legacy direct payout", kind: "legacy", amount: null } as const;
  if (["transferred", "reversed"].includes(order.sellerTransferStatus)) return {
    label: order.sellerTransferStatus === "reversed" ? "Release reversed" : order.sellerTransferReversedCents > 0 ? "Released to Stripe · partly reversed" : "Released to Stripe",
    kind: "released", amount: Math.max(0, order.sellerTransferAmountCents - order.sellerTransferReversedCents),
  } as const;
  if (order.paymentStatus === "refunded" || order.sellerTransferStatus === "cancelled") return {
    label: order.paymentStatus === "refunded" ? "Refunded" : "Release cancelled", kind: "closed", amount: 0,
  } as const;
  const amount = order.sellerProceedsCents == null || (order.processingFeePayer === "seller" && order.paymentProcessingFeeCents == null)
    ? null : sellerProceedsAfterRefund({ ...order, sellerProceedsCents: order.sellerProceedsCents });
  const label = order.payoutHold ? "Held for a case, dispute or refund"
    : order.sellerTransferStatus === "processing" ? "Release processing"
    : order.sellerTransferStatus === "failed" ? "Release will be retried"
    : amount == null ? "Awaiting final proceeds"
    : order.payoutEligibleAt ? "Awaiting release" : "Held until after delivery";
  return { label, kind: "held", amount } as const;
}

/** MCC's order ledger, never a Stripe balance or a bank-deposit total. */
export function collectorPaymentSummary(orders: CollectorPayment[], currency: string) {
  return orders.filter(order => !order.isTestOrder && order.currency.toLowerCase() === currency.toLowerCase()).reduce((summary, order) => {
    const state = collectorPaymentState(order);
    if (state.kind === "released") summary.releasedCents += state.amount;
    if (state.kind === "held") {
      if (state.amount == null) summary.pendingCount += 1;
      else summary.heldCents += state.amount;
    }
    if (state.kind === "legacy") summary.legacyCount += 1;
    return summary;
  }, { heldCents: 0, releasedCents: 0, pendingCount: 0, legacyCount: 0 });
}
