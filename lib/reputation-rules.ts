const COMPLETED_FULFILLMENT_STATUSES = new Set(["shipped", "delivered"]);
const ELIGIBLE_PAYMENT_STATUSES = new Set(["paid", "partially_refunded"]);

export const VERIFIED_FEEDBACK_WAIT_DAYS = 14;

type FeedbackOrder = {
  paymentStatus: string;
  fulfillmentStatus: string;
  shippedAt?: string | null;
};

export type VerifiedFeedbackEligibility = {
  eligible: boolean;
  eligibleAt: string | null;
  basis:
    | "carrier_confirmed_delivery"
    | "waiting_period_elapsed"
    | "awaiting_delivery"
    | "ineligible_payment";
};

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

export function getVerifiedFeedbackEligibility(
  order: FeedbackOrder,
  now = new Date(),
): VerifiedFeedbackEligibility {
  if (!ELIGIBLE_PAYMENT_STATUSES.has(order.paymentStatus)) {
    return {
      eligible: false,
      eligibleAt: null,
      basis: "ineligible_payment",
    };
  }
  // In this system, only carrier tracking updates set an order to delivered.
  if (order.fulfillmentStatus === "delivered") {
    return {
      eligible: true,
      eligibleAt: null,
      basis: "carrier_confirmed_delivery",
    };
  }
  const shippedAt = Date.parse(order.shippedAt ?? "");
  if (order.fulfillmentStatus !== "shipped" || !Number.isFinite(shippedAt)) {
    return {
      eligible: false,
      eligibleAt: null,
      basis: "awaiting_delivery",
    };
  }
  const eligibleAt = new Date(
    shippedAt + VERIFIED_FEEDBACK_WAIT_DAYS * 24 * 60 * 60 * 1_000,
  );
  const eligible = now.getTime() >= eligibleAt.getTime();
  return {
    eligible,
    eligibleAt: eligibleAt.toISOString(),
    basis: eligible ? "waiting_period_elapsed" : "awaiting_delivery",
  };
}

export function canLeaveVerifiedFeedback(
  order: FeedbackOrder,
  now = new Date(),
) {
  return getVerifiedFeedbackEligibility(order, now).eligible;
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
