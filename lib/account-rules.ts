import type { CartItem } from "./types";

export function ownsSeller(
  userId: string,
  ownerUserId: string | null | undefined,
) {
  return Boolean(userId && ownerUserId && userId === ownerUserId);
}

export function ownsProduct(
  userId: string,
  product: { ownerUserId?: string | null },
) {
  return ownsSeller(userId, product.ownerUserId);
}

export function canFulfillSellerOrder(
  userId: string,
  order: { sellerOwnerUserId?: string | null; paymentStatus: string },
) {
  return (
    order.paymentStatus === "paid" &&
    ownsSeller(userId, order.sellerOwnerUserId)
  );
}

export function cartMergeDecision(saved: CartItem[], guest: CartItem[]) {
  const savedSellerId = saved[0]?.sellerId;
  const guestSellerId = guest[0]?.sellerId;
  if (savedSellerId && guestSellerId && savedSellerId !== guestSellerId)
    return "conflict" as const;
  return "merge" as const;
}

export function mergeCartItems(saved: CartItem[], guest: CartItem[]) {
  if (cartMergeDecision(saved, guest) === "conflict") return null;
  const combined = new Map(saved.map((item) => [item.productId, { ...item }]));
  for (const item of guest) {
    const current = combined.get(item.productId);
    combined.set(item.productId, {
      ...item,
      quantity: Math.min((current?.quantity ?? 0) + item.quantity, 10),
    });
  }
  return [...combined.values()];
}

export function uniqueWishlistIds(ids: unknown[], limit = 100) {
  return [
    ...new Set(
      ids.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      ),
    ),
  ].slice(0, limit);
}

export function safeReturnPath(value: string, fallback = "/account") {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function isCollectorListingAwaitingReview(input: {
  sellerType: string;
  listingStatus: string;
}) {
  return (
    input.sellerType === "collector" && input.listingStatus === "pending_review"
  );
}

export function canApproveCollectorListing(input: {
  sellerStatus: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
}) {
  return (
    input.sellerStatus === "active" &&
    input.stripeChargesEnabled &&
    input.stripePayoutsEnabled
  );
}

export function canClaimGuestRecord(input: {
  authenticatedEmail: string;
  emailVerified: boolean;
  recordEmail: string;
  currentOwnerUserId?: string | null;
}) {
  return (
    input.emailVerified &&
    !input.currentOwnerUserId &&
    input.authenticatedEmail.trim().toLowerCase() ===
      input.recordEmail.trim().toLowerCase()
  );
}
