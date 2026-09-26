// Immutable order terms. A longer window requires a separate approved version.
export const LEGACY_PROTECTION_POLICY_VERSION = "delivery-3-v1";
export const ACTIVE_PROTECTION_POLICY_VERSION = LEGACY_PROTECTION_POLICY_VERSION;
export const protectionPolicies = {
  "delivery-3-v1": { deliveredDays: 3, shipmentDays: 30, paymentDays: 45 },
} as const;
export function protectionPolicyForOrder(order: { protectionPolicyVersion?: string | null }) {
  const version = order.protectionPolicyVersion || LEGACY_PROTECTION_POLICY_VERSION;
  if (!Object.hasOwn(protectionPolicies, version)) throw new Error("The order protection policy needs review. Contact support.");
  return protectionPolicies[version as keyof typeof protectionPolicies];
}
export const activeProtectionPolicy = protectionPolicyForOrder({ protectionPolicyVersion: ACTIVE_PROTECTION_POLICY_VERSION });
export const PROTECTION_REPORT_DAYS_AFTER_SHIPMENT = activeProtectionPolicy.shipmentDays;
export const PROTECTION_REPORT_DAYS_AFTER_PAYMENT = activeProtectionPolicy.paymentDays;
export const REFUND_REQUEST_DAYS_AFTER_DELIVERY = activeProtectionPolicy.deliveredDays;
export const SELLER_RESPONSE_DAYS = 3;
export const BUYER_EVIDENCE_DAYS = 5;
export const BUYER_ESCALATION_DAYS = 3;
export const RETURN_SHIP_DAYS = 7;

export const protectionReasons = [
  "not_received",
  "damaged",
  "not_as_described",
  "wrong_item",
  "missing_item",
  "counterfeit",
  "other",
] as const;

export const requestedResolutions = [
  "full_refund",
  "partial_refund",
  "return_refund",
] as const;

export type ProtectionReason = (typeof protectionReasons)[number];
export type RequestedResolution = (typeof requestedResolutions)[number];

export function addCalendarDays(value: string | Date, days: number) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("A valid date is required.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function reportDeadlineForOrder(order: {
  protectionPolicyVersion?: string | null;
  paidAt?: string | null;
  createdAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  refundRequestDeadline?: string | null;
}) {
  if (order.refundRequestDeadline) return order.refundRequestDeadline;
  const policy = protectionPolicyForOrder(order);
  if (order.deliveredAt) {
    return addCalendarDays(
      order.deliveredAt,
      policy.deliveredDays,
    );
  }
  const startsAt = order.shippedAt ?? order.paidAt ?? order.createdAt;
  return addCalendarDays(
    startsAt,
    order.shippedAt
      ? policy.shipmentDays
      : policy.paymentDays,
  );
}

export function canReportOrderProblem(
  order: {
    protectionPolicyVersion?: string | null;
    paymentStatus: string;
    totalCents: number;
    refundedAmountCents?: number | null;
    paidAt?: string | null;
    createdAt: string;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    refundRequestDeadline?: string | null;
  },
  now = new Date(),
) {
  const reportDeadline = reportDeadlineForOrder(order);
  const refundableCents = Math.max(
    0,
    order.totalCents - (order.refundedAmountCents ?? 0),
  );
  const eligiblePayment = ["paid", "partially_refunded"].includes(
    order.paymentStatus,
  );
  if (!eligiblePayment || refundableCents < 1) {
    return {
      eligible: false,
      reportDeadline,
      reason: "This order has no refundable paid balance.",
    };
  }
  if (now.getTime() > new Date(reportDeadline).getTime()) {
    return {
      eligible: false,
      reportDeadline,
      reason: "The order-level reporting window has ended.",
    };
  }
  return { eligible: true, reportDeadline, reason: "" };
}

export function remainingRefundableCents(input: {
  totalCents: number;
  refundedAmountCents?: number | null;
}) {
  return Math.max(0, input.totalCents - (input.refundedAmountCents ?? 0));
}

export function isPastDeadline(value: string | null | undefined, now = new Date()) {
  return Boolean(value && now.getTime() > new Date(value).getTime());
}

export function makeCaseNumber(now = new Date(), suffix = crypto.randomUUID()) {
  return `MCC-RC-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${suffix
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase()}`;
}

export function makeReturnAuthorizationNumber(
  caseNumber: string,
  suffix = crypto.randomUUID(),
) {
  return `RMA-${caseNumber.slice(-6)}-${suffix.replaceAll("-", "").slice(0, 4).toUpperCase()}`;
}

export function protectionReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    not_received: "Order not received",
    damaged: "Damaged in transit",
    not_as_described: "Materially not as described",
    wrong_item: "Wrong item",
    missing_item: "Item or parts missing",
    counterfeit: "Authenticity concern",
    other: "Other order problem",
  };
  return labels[reason] ?? reason.replaceAll("_", " ");
}
