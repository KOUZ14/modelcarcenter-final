import { calculatePlatformFee } from "./business.ts";
import { sellerProcessingDeduction } from "./seller-proceeds.ts";

export function estimateSellerProceeds(input: { itemCents: number; shippingCents: number; taxCents: number; feeBps: number; processingBps: number; processingFixedCents: number }) {
  for (const value of [input.itemCents, input.shippingCents, input.taxCents, input.processingFixedCents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Enter a valid non-negative amount.");
  }
  if (!Number.isInteger(input.processingBps) || input.processingBps < 0 || input.processingBps > 10000) throw new Error("Enter a processing percentage between 0 and 100.");
  const totalCents = input.itemCents + input.shippingCents + input.taxCents;
  const platformFeeCents = calculatePlatformFee(input.itemCents, input.feeBps);
  const paymentProcessingFeeCents = Math.round(totalCents * input.processingBps / 10000) + input.processingFixedCents;
  const processingDeductionCents = sellerProcessingDeduction({ totalCents, taxCents: input.taxCents, platformFeeCents, paymentProcessingFeeCents, processingFeePayer: "seller" }) ?? 0;
  return { totalCents, platformFeeCents, paymentProcessingFeeCents, processingDeductionCents,
    proceedsCents: Math.max(0, totalCents - input.taxCents - platformFeeCents - processingDeductionCents) };
}
