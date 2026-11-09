export function awaitingShipment(order: { paymentStatus: string; fulfillmentStatus: string }) {
  return ["paid", "partially_refunded"].includes(order.paymentStatus) && ["unfulfilled", "processing"].includes(order.fulfillmentStatus);
}

export function adminTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function overdueShipment(order: { paymentStatus: string; fulfillmentStatus: string; shipByAt?: string | null }, now = Date.now()) {
  const deadline = adminTimestamp(order.shipByAt);
  return awaitingShipment(order) && deadline !== null && deadline.getTime() < now;
}

export function orderItemProblem(order: { subtotalCents: number; items: Array<{ quantity: number; unitPriceCents: number }> }) {
  if (!order.items.length) return "Item records missing. Reconcile the original checkout before fulfillment.";
  if (order.items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1) || order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0) !== order.subtotalCents) return "Item totals do not match the order subtotal. Reconcile before fulfillment.";
  return null;
}
