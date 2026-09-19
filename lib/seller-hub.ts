import { sellerProceedsAfterRefund } from "./seller-proceeds.ts";
import { modelHuntMatches } from "./business.ts";

// Shared definitions keep the overview, queues, and drill-downs consistent.
export const hubViews = ["overview", "orders", "inventory", "payments", "analytics", "settings", "help", "demand", "opportunities", "marketing"] as const;
export type HubView = (typeof hubViews)[number];
export type HubNavigate = (view: HubView, filter?: string, edit?: string) => void;
export const inventoryViews = [
  ["all", "All inventory"], ["slow", "Slow inventory"], ["low", "Low stock"],
  ["out", "Out of stock"], ["attention", "Needs attention"], ["preorders", "Preorders"],
] as const;
export const orderViews = [
  ["open", "Orders to ship"], ["shipped", "Shipped"], ["returns", "Returns"], ["all", "All orders"],
] as const;

export type HubProduct = {
  id: string; title: string; sellerSku: string; status: string;
  inventoryQuantity: number; reservedQuantity: number; priceCents: number;
  availabilityType: string; createdAt: string;
};
export type HubOrder = {
  id: string; buyerEmail: string; paymentStatus: string; fulfillmentStatus: string;
  createdAt: string; paidAt: string | null; subtotalCents: number;
  sellerProceedsCents: number | null; paymentFlow: string; sellerTransferStatus: string;
  sellerTransferAmountCents: number; sellerTransferReversedCents: number;
  totalCents: number; refundedAmountCents: number;
};
export type HubItem = {
  orderId: string; productId: string | null; productTitleSnapshot: string;
  quantity: number; unitPriceCents: number;
};

export function availableUnits(product: Pick<HubProduct, "inventoryQuantity" | "reservedQuantity">) {
  return Math.max(0, product.inventoryQuantity - product.reservedQuantity);
}

export function matchesInventoryView(product: HubProduct, view: string, slowIds: readonly string[]) {
  const available = availableUnits(product);
  switch (view) {
    case "slow": return slowIds.includes(product.id);
    case "low": return product.status === "active" && product.availabilityType !== "preorder" && available > 0 && available <= 2;
    case "out": return ["active", "sold_out"].includes(product.status) && product.availabilityType !== "preorder" && available === 0;
    case "preorders": return product.availabilityType === "preorder" && product.status !== "rejected";
    case "attention": return ["draft", "pending_review", "rejected"].includes(product.status);
    default: return true;
  }
}

export function matchesOrderView(order: { id: string; paymentStatus: string; fulfillmentStatus: string }, view: string, returnOrderIds: readonly string[]) {
  if (view === "open") return ["paid", "partially_refunded"].includes(order.paymentStatus) && ["unfulfilled", "processing"].includes(order.fulfillmentStatus);
  if (view === "shipped") return ["shipped", "delivered"].includes(order.fulfillmentStatus);
  if (view === "returns") return returnOrderIds.includes(order.id);
  return view === "all" || order.fulfillmentStatus === view || order.paymentStatus === view;
}

export function buildSellerHubMetrics(orders: HubOrder[], items: HubItem[], inventory: HubProduct[], now = new Date()) {
  const cutoff = now.getTime() - 90 * 86_400_000;
  const paid = orders.filter((order) => ["paid", "partially_refunded"].includes(order.paymentStatus));
  const paidById = new Map(paid.map((order) => [order.id, order]));
  const lastSale = new Map<string, number>();
  const performance = new Map<string, { id: string | null; title: string; units: number; revenueCents: number }>();
  let units90 = 0;
  for (const item of items) {
    const order = paidById.get(item.orderId);
    if (!order) continue;
    const soldAt = new Date(order.paidAt ?? order.createdAt).getTime();
    if (item.productId) lastSale.set(item.productId, Math.max(lastSale.get(item.productId) ?? 0, soldAt));
    if (soldAt < cutoff || soldAt > now.getTime()) continue;
    units90 += item.quantity;
    const key = item.productId ?? `deleted:${item.productTitleSnapshot}`;
    const row = performance.get(key) ?? { id: item.productId, title: item.productTitleSnapshot, units: 0, revenueCents: 0 };
    row.units += item.quantity;
    row.revenueCents += item.quantity * item.unitPriceCents;
    performance.set(key, row);
  }
  const current = inventory.filter((product) => product.status !== "rejected");
  const slow = current.filter((product) =>
    product.status === "active" && product.availabilityType !== "preorder" && availableUnits(product) > 0 &&
    new Date(product.createdAt).getTime() <= cutoff && (lastSale.get(product.id) ?? 0) < cutoff,
  );
  const stock = current.filter((product) => product.availabilityType !== "preorder");
  const available = stock.reduce((sum, product) => sum + availableUnits(product), 0);
  const stockIds = new Set(stock.map((product) => product.id));
  // Use the same current, in-stock catalog for numerator and denominator.
  const stockUnits90 = [...performance.values()].filter((row) => row.id && stockIds.has(row.id)).reduce((sum, row) => sum + row.units, 0);
  const buyers = new Map<string, number>();
  for (const order of paid) {
    const key = order.buyerEmail.trim().toLowerCase();
    if (key) buyers.set(key, (buyers.get(key) ?? 0) + 1);
  }
  const releasedCents = orders.filter((order) => order.paymentFlow === "separate" && ["transferred", "reversed"].includes(order.sellerTransferStatus)).reduce((sum, order) => sum + Math.max(0, order.sellerTransferAmountCents - order.sellerTransferReversedCents), 0);
  const held = paid.filter((order) => order.paymentFlow === "separate" && ["pending", "processing", "failed"].includes(order.sellerTransferStatus));
  return {
    slowIds: slow.map((product) => product.id),
    slowValueCents: slow.reduce((sum, product) => sum + availableUnits(product) * product.priceCents, 0),
    inventoryValueCents: stock.reduce((sum, product) => sum + availableUnits(product) * product.priceCents, 0),
    availableUnits: available,
    sellThroughPercent: available + stockUnits90 ? stockUnits90 / (available + stockUnits90) * 100 : null,
    units90,
    repeatBuyers: [...buyers.values()].filter((count) => count > 1).length,
    totalBuyers: buyers.size,
    releasedCents,
    heldCents: held.reduce((sum, order) => sum + sellerProceedsAfterRefund({ ...order, sellerProceedsCents: order.sellerProceedsCents ?? 0 }), 0),
    pendingFeeOrders: held.filter((order) => order.sellerProceedsCents === null).length,
    performance: [...performance.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units),
  };
}

export type DemandProduct = HubProduct & { vehicleMake: string; vehicleModel: string; scale: string; modelManufacturer: string; color: string | null; condition: string };
export type WantDemand = { vehicleMake: string; vehicleModel: string; preferredScale: string; modelManufacturer: string | null; color: string | null; conditionPreference: string | null; maxBudgetCents: number | null; requests: number };
const normalize = (value: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function matchWantDemand(want: WantDemand, inventory: DemandProduct[]) {
  return inventory.filter((product) => product.status !== "rejected" &&
    modelHuntMatches(want, product) &&
    (!want.color || normalize(product.color) === normalize(want.color)) &&
    (!want.conditionPreference || normalize(want.conditionPreference) === "any" || normalize(product.condition) === normalize(want.conditionPreference)) &&
    (want.maxBudgetCents === null || product.priceCents <= want.maxBudgetCents),
  ).map((product) => product.id);
}

export function isTrending(recent: number, previous: number) {
  return recent >= 3 && recent > previous;
}

export type SellerHubMetrics = ReturnType<typeof buildSellerHubMetrics>;
