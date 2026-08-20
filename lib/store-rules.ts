export type StoreAnalyticsOrder = {
  id: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotalCents: number;
  platformFeeCents: number;
  createdAt: string;
};

export type StoreAnalyticsItem = {
  orderId: string;
  productTitleSnapshot: string;
  quantity: number;
  unitPriceCents: number;
};

export type StoreAnalyticsProduct = {
  status: string;
  inventoryQuantity: number;
  reservedQuantity: number;
  priceCents: number;
};

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function buildStoreAnalytics(
  orders: StoreAnalyticsOrder[],
  items: StoreAnalyticsItem[],
  inventory: StoreAnalyticsProduct[],
  now = new Date(),
) {
  const paidOrders = orders.filter((order) =>
    ["paid", "partially_refunded"].includes(order.paymentStatus),
  );
  const paidIds = new Set(paidOrders.map((order) => order.id));
  const paidItems = items.filter((item) => paidIds.has(item.orderId));
  const grossSalesCents = paidOrders.reduce(
    (sum, order) => sum + order.subtotalCents,
    0,
  );
  const platformFeesCents = paidOrders.reduce(
    (sum, order) => sum + order.platformFeeCents,
    0,
  );
  const unitsSold = paidItems.reduce((sum, item) => sum + item.quantity, 0);
  const activeListings = inventory.filter(
    (product) => product.status === "active",
  ).length;
  const lowStock = inventory.filter(
    (product) =>
      product.status === "active" &&
      product.inventoryQuantity - product.reservedQuantity <= 2,
  ).length;
  const inventoryValueCents = inventory.reduce(
    (sum, product) =>
      sum +
      Math.max(0, product.inventoryQuantity - product.reservedQuantity) *
        product.priceCents,
    0,
  );

  const monthlySales = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthOrders = paidOrders.filter((order) =>
      order.createdAt.startsWith(key),
    );
    monthlySales.push({
      key,
      label: `${monthNames[month.getUTCMonth()]} ${month.getUTCFullYear()}`,
      orders: monthOrders.length,
      grossCents: monthOrders.reduce(
        (sum, order) => sum + order.subtotalCents,
        0,
      ),
    });
  }

  const products = new Map<
    string,
    { title: string; units: number; revenueCents: number }
  >();
  for (const item of paidItems) {
    const current = products.get(item.productTitleSnapshot) ?? {
      title: item.productTitleSnapshot,
      units: 0,
      revenueCents: 0,
    };
    current.units += item.quantity;
    current.revenueCents += item.quantity * item.unitPriceCents;
    products.set(item.productTitleSnapshot, current);
  }

  return {
    paidOrders: paidOrders.length,
    unfulfilledOrders: paidOrders.filter(
      (order) => order.fulfillmentStatus === "unfulfilled",
    ).length,
    unitsSold,
    grossSalesCents,
    platformFeesCents,
    netSalesCents: grossSalesCents - platformFeesCents,
    averageOrderCents: paidOrders.length
      ? Math.round(grossSalesCents / paidOrders.length)
      : 0,
    activeListings,
    lowStock,
    inventoryValueCents,
    monthlySales,
    topProducts: [...products.values()]
      .sort(
        (a, b) =>
          b.revenueCents - a.revenueCents || b.units - a.units,
      )
      .slice(0, 5),
  };
}
