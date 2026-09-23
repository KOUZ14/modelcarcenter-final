export type SavedListingPreview = {
  id: string; slug: string; title: string; scale: string; modelManufacturer: string;
  modelCondition: string; sellerName: string; primaryImageUrl: string | null;
  priceCents: number; currency: string; availabilityType: string; availableQuantity: number;
};

type OrderProgress = {
  paymentStatus?: unknown; fulfillmentStatus?: unknown; carrier?: unknown; trackingNumber?: unknown;
  shipment?: { status: string; trackingUrl: string | null; carrier: string; trackingNumber: string } | null;
};

export function orderDeliveryLabel(order: OrderProgress) {
  if (order.fulfillmentStatus === "cancelled") return "Cancelled";
  // Order delivery is retained even when a later carrier payload repeats an older scan.
  if (order.fulfillmentStatus === "delivered") return "Delivered";
  const shipmentLabels: Record<string, string> = {
    label_created: "Label created", pre_transit: "Awaiting carrier", in_transit: "In transit",
    delivered: "Delivered", returned: "Returned to sender", failure: "Delivery needs attention",
  };
  if (order.shipment && shipmentLabels[order.shipment.status]) return shipmentLabels[order.shipment.status];
  const labels: Record<string, string> = { delivered: "Delivered", shipped: "Shipped", processing: "Preparing to ship" };
  if (labels[String(order.fulfillmentStatus)]) return labels[String(order.fulfillmentStatus)];
  return ["paid", "partially_refunded"].includes(String(order.paymentStatus)) ? "Awaiting dispatch" : "Not dispatched";
}

export function orderTrackingHref(order: OrderProgress): string | null {
  if (order.shipment?.trackingUrl) {
    try {
      const url = new URL(order.shipment.trackingUrl);
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch { /* Fall back to a known carrier when no usable provider URL exists. */ }
  }
  const number = String(order.shipment?.trackingNumber || order.trackingNumber || "").trim();
  if (!number) return null;
  const carrier = String(order.shipment?.carrier || order.carrier || "").toLowerCase();
  const encoded = encodeURIComponent(number);
  // These are the same carrier destinations used by existing shipment emails.
  if (carrier.includes("ups")) return `https://www.ups.com/track?tracknum=${encoded}`;
  if (carrier.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (carrier.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
  if (carrier.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
  return null;
}
