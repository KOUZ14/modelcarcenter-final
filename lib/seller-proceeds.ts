export type SellerFeeAmounts = {
  processingFeePayer: "platform" | "seller";
  totalCents: number;
  taxCents: number;
  platformFeeCents: number;
  paymentProcessingFeeCents: number | null;
};

/** A label spending limit, never a final payout or an estimated Stripe fee. */
export function sellerLabelBudget(order: SellerFeeAmounts & {
  sellerProceedsCents: number | null;
  refundedAmountCents: number;
  shippingLabelCostCents: number;
}) {
  if (order.sellerProceedsCents != null) {
    return sellerProceedsAfterRefund({ ...order, sellerProceedsCents: order.sellerProceedsCents });
  }
  // A confirmed payment can precede Stripe's fee details. Let the seller ship
  // against the held payment, excluding tax, marketplace fees, known processing
  // fees, all refunded money and existing postage. Keep final proceeds unknown:
  // the payout job must still reconcile the actual Stripe fee before release.
  return Math.max(0, order.totalCents - order.taxCents - order.platformFeeCents -
    (order.processingFeePayer === "seller" ? Math.max(0, order.paymentProcessingFeeCents ?? 0) : 0) -
    Math.max(0, order.refundedAmountCents) - Math.max(0, order.shippingLabelCostCents));
}

export function sellerProceedsAfterRefund(input: {
  totalCents: number;
  refundedAmountCents: number;
  sellerProceedsCents: number;
  shippingLabelCostCents?: number;
}) {
  if (input.totalCents < 1 || input.sellerProceedsCents < 1) return 0;
  const remaining = Math.max(0, input.totalCents - Math.max(0, input.refundedAmountCents));
  const proceeds = Math.min(input.sellerProceedsCents, Math.round((input.sellerProceedsCents * remaining) / input.totalCents));
  // A customer refund does not refund the carrier label. Deduct postage after
  // the proportional refund calculation so it is recovered only once.
  return Math.max(0, proceeds - Math.max(0, input.shippingLabelCostCents ?? 0));
}

/** The actual processing cost recovered from this seller, capped at their proceeds. */
export function sellerProcessingDeduction(order: SellerFeeAmounts): number | null {
  if (order.processingFeePayer !== "seller") return 0;
  if (order.paymentProcessingFeeCents == null) return null;
  return Math.min(
    Math.max(0, order.totalCents - order.taxCents - order.platformFeeCents),
    Math.max(0, order.paymentProcessingFeeCents),
  );
}

export function processingFeesRecovered(order: SellerFeeAmounts & {
  paymentStatus: string;
  refundedAmountCents: number;
}) {
  const deduction = sellerProcessingDeduction(order);
  if (deduction == null || order.paymentStatus === "refunded" || order.totalCents <= 0) return 0;
  return Math.round(deduction * Math.max(0, order.totalCents - order.refundedAmountCents) / order.totalCents);
}
