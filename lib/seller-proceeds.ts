export type SellerFeeAmounts = {
  processingFeePayer: "platform" | "seller";
  totalCents: number;
  taxCents: number;
  platformFeeCents: number;
  paymentProcessingFeeCents: number | null;
};

export function sellerProceedsAfterRefund(input: {
  totalCents: number;
  refundedAmountCents: number;
  sellerProceedsCents: number;
}) {
  if (input.totalCents < 1 || input.sellerProceedsCents < 1) return 0;
  const remaining = Math.max(0, input.totalCents - Math.max(0, input.refundedAmountCents));
  return Math.min(input.sellerProceedsCents, Math.round((input.sellerProceedsCents * remaining) / input.totalCents));
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
