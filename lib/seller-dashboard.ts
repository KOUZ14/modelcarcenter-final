import { sellerProceedsAfterRefund } from "./seller-proceeds.ts";

export function sellerTimestamp(value: string | null | undefined) {
  if (!value) return NaN;
  const iso = value.trim().replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) || iso.length === 10 ? iso : `${iso}Z`);
}

type QueueOrder = { paymentStatus: string; fulfillmentStatus: string; shipByAt: string | null; createdAt: string };
export function needsShipment(order: QueueOrder) {
  return ["paid", "partially_refunded"].includes(order.paymentStatus) && ["unfulfilled", "processing"].includes(order.fulfillmentStatus);
}
export function prioritizeOrders<T extends QueueOrder>(orders: T[]) {
  return [...orders].sort((a, b) => Number(needsShipment(b)) - Number(needsShipment(a)) ||
    (needsShipment(a) && needsShipment(b) ? (sellerTimestamp(a.shipByAt) || Infinity) - (sellerTimestamp(b.shipByAt) || Infinity) : 0) ||
    sellerTimestamp(b.createdAt) - sellerTimestamp(a.createdAt));
}

export function sellerPaymentStatus(store: { status: string; stripeChargesEnabled: boolean; stripePayoutsEnabled: boolean }, termsAccepted: boolean) {
  const connected = store.stripeChargesEnabled && store.stripePayoutsEnabled;
  if (store.status === "suspended") return { title: "New sales suspended", detail: "Continue fulfilling existing orders. Contact support to resolve your store status.", href: "/contact", action: "Contact support", connected };
  if (!termsAccepted) return { title: "Action required: accept Seller Terms", detail: connected ? "Stripe is connected. Accept the current Seller Terms to enable new sales; your existing connection is retained." : "Accept the current Seller Terms, then connect your bank account securely with Stripe.", href: "/store?view=settings&filter=terms#seller-terms", action: "Review Seller Terms", connected };
  if (store.status === "applicant") return { title: "Store approval pending", detail: "MCC must approve your application before bank setup or new sales are available.", href: "/contact", action: "Ask about store approval", connected };
  if (!connected) return { title: "Action required: finish bank setup", detail: "Stripe needs your identity or bank details before payments and payouts are ready.", href: null, action: "Continue bank setup", connected };
  if (store.status !== "active") return { title: "Stripe connected · refresh status", detail: "Refresh the saved connection status to finish setup and enable new sales.", href: null, action: "Refresh status", connected };
  return { title: "Ready to receive payments", detail: "Stripe and your Seller Terms are up to date. Order holds and Stripe’s bank payout schedule still apply.", href: null, action: "Manage bank details", connected };
}

export type PayoutOrder = {
  paymentFlow: string; paymentStatus: string; sellerTransferStatus: string;
  sellerTransferAmountCents: number; sellerTransferReversedCents: number;
  sellerProceedsCents: number | null; totalCents: number; refundedAmountCents: number;
};
export function sellerOrderPayout(order: PayoutOrder) {
  if (!["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)) return { label: "Payment not completed", amount: null, legacy: false };
  if (order.paymentFlow === "destination") return { label: "Legacy direct payout", amount: null, legacy: true };
  if (["transferred", "reversed"].includes(order.sellerTransferStatus)) return {
    label: order.sellerTransferStatus === "reversed" ? "Release reversed" : "Released to Stripe",
    amount: Math.max(0, order.sellerTransferAmountCents - order.sellerTransferReversedCents), legacy: false,
  };
  if (order.paymentStatus === "refunded") return { label: "Refunded", amount: 0, legacy: false };
  return { label: order.sellerTransferStatus === "failed" ? "Release needs attention" : order.sellerTransferStatus === "processing" ? "Release in progress" : "Held until eligible",
    amount: order.sellerProceedsCents === null ? null : sellerProceedsAfterRefund({ ...order, sellerProceedsCents: order.sellerProceedsCents }), legacy: false };
}

type SaleItem = { productId: string | null; productTitleSnapshot: string; quantity: number; unitPriceCents: number; imageUrlSnapshot?: string | null };
type SaleOrder = { id: string; createdAt: string; paidAt?: string | null; paymentStatus: string; subtotalCents: number; buyerEmail: string; currency: string; items: SaleItem[]; isTestOrder?: boolean };
export const salesRanges = [["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 180 days"]] as const;

/** One UTC period drives the totals, comparison, chart, and listing performance. */
export function sellerSalesReport(orders: SaleOrder[], days: number, now = new Date(), currency = "usd") {
  const length = [30, 90, 180].includes(days) ? days : 30;
  const end = now.getTime(), start = end - length * 86_400_000, previousStart = start - length * 86_400_000;
  const paid = orders.filter(order => !order.isTestOrder && order.currency.toLowerCase() === currency.toLowerCase() && ["paid", "partially_refunded"].includes(order.paymentStatus));
  const period = (from: number, to: number) => paid.filter(order => { const at = sellerTimestamp(order.paidAt ?? order.createdAt); return at > from && at <= to; });
  const current = period(start, end), previous = period(previousStart, start);
  const totals = (rows: SaleOrder[]) => ({ revenueCents: rows.reduce((sum, row) => sum + row.subtotalCents, 0), orders: rows.length, units: rows.reduce((sum, row) => sum + row.items.reduce((total, item) => total + item.quantity, 0), 0), missingItems: rows.filter(row => !row.items.length).length });
  const products = new Map<string, { id: string | null; title: string; image: string | null; units: number; revenueCents: number; previousRevenueCents: number }>();
  for (const [rows, isCurrent] of [[current, true], [previous, false]] as const) for (const order of rows) for (const item of order.items) {
    const key = item.productId ?? `removed:${item.productTitleSnapshot}`;
    const row = products.get(key) ?? { id: item.productId, title: item.productTitleSnapshot, image: item.imageUrlSnapshot ?? null, units: 0, revenueCents: 0, previousRevenueCents: 0 };
    if (isCurrent) { row.units += item.quantity; row.revenueCents += item.quantity * item.unitPriceCents; }
    else row.previousRevenueCents += item.quantity * item.unitPriceCents;
    products.set(key, row);
  }
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const from = start + i * length * 86_400_000 / 6, to = start + (i + 1) * length * 86_400_000 / 6;
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), ...totals(period(from, to)) };
  });
  return { start: new Date(start).toISOString(), end: now.toISOString(), previousStart: new Date(previousStart).toISOString(), current: totals(current), previous: totals(previous), products: [...products.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.previousRevenueCents - a.previousRevenueCents), buckets,
    missingOrderIds: current.filter(row => !row.items.length).map(row => row.id), excludedTestOrders: orders.filter(row => row.isTestOrder).length };
}
