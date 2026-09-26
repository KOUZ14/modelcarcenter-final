import type { CartItem } from "./types";

export function groupCartBySeller(cart: CartItem[]) {
  const groups = new Map<string, CartItem[]>();
  for (const item of cart) {
    const group = groups.get(item.sellerId) ?? [];
    group.push(item);
    groups.set(item.sellerId, group);
  }
  return [...groups].map(([sellerId, items]) => ({ sellerId, sellerName: items[0].sellerName, items }));
}

export function removePurchasedItems(cart: CartItem[], purchased: Array<{ productId: string | null; quantity: number }>) {
  const quantities = new Map(purchased.map((item) => [item.productId, item.quantity]));
  return cart.flatMap((item) => {
    const quantity = item.quantity - (quantities.get(item.productId) ?? 0);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}
