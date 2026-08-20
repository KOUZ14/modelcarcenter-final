const COMPLETED_FULFILLMENT_STATUSES = new Set(["shipped", "delivered"]);
const ELIGIBLE_PAYMENT_STATUSES = new Set(["paid", "partially_refunded"]);

export function addBusinessDays(start: Date, businessDays: number) {
  const result = new Date(start);
  let remaining = Math.max(1, Math.trunc(businessDays));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export function isCompletedTransaction(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}) {
  return (
    ELIGIBLE_PAYMENT_STATUSES.has(order.paymentStatus) &&
    COMPLETED_FULFILLMENT_STATUSES.has(order.fulfillmentStatus)
  );
}

export function canLeaveVerifiedFeedback(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}) {
  return isCompletedTransaction(order);
}

export function publicCollectorName(value: string | null | undefined) {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Verified collector";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`;
}
