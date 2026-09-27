import { checkoutAddressKey } from "./checkout-address";
import type { CartItem } from "./types";
import type { NormalizedShippingAddress } from "./shipping-rules";
import type { CombinedShippingRequest } from "./combined-shipping";

export function combinedRequestMatches(request: CombinedShippingRequest, items: CartItem[], destination: NormalizedShippingAddress | null) {
  if (!destination || request.viewerRole !== "buyer" || request.sellerId !== items[0]?.sellerId || checkoutAddressKey(request.destination) !== checkoutAddressKey(destination)) return false;
  const key = (rows: Array<{ productId: string; quantity: number; priceCents: number }>) => JSON.stringify(rows.map((item) => [item.productId, item.quantity, item.priceCents]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  return key(request.items) === key(items);
}
