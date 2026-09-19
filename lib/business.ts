import type { CartItem } from "./types";

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function availableQuantity(inventoryQuantity: number, reservedQuantity: number) {
  return Math.max(0, inventoryQuantity - reservedQuantity);
}

export function calculatePlatformFee(subtotalCents: number, feeBps: number) {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error("Subtotal must be a non-negative integer.");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("Fee basis points must be between 0 and 10000.");
  }
  return Math.round((subtotalCents * feeBps) / 10_000);
}

export function calculateServerTotals(
  items: Array<{ priceCents: number; quantity: number }>,
  shippingCents: number,
  feeBps: number,
) {
  if (!Number.isInteger(shippingCents) || shippingCents < 0) {
    throw new Error("Shipping must be a non-negative integer.");
  }
  const subtotalCents = items.reduce((total, item) => {
    if (!Number.isInteger(item.priceCents) || item.priceCents < 0) {
      throw new Error("Item price must be a non-negative integer.");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Item quantity must be a positive integer.");
    }
    return total + item.priceCents * item.quantity;
  }, 0);
  return {
    subtotalCents,
    shippingCents,
    platformFeeCents: calculatePlatformFee(subtotalCents, feeBps),
    totalBeforeTaxCents: subtotalCents + shippingCents,
  };
}

export function cartSellerConflict(cart: CartItem[], sellerId: string) {
  return cart.length > 0 && cart.some((item) => item.sellerId !== sellerId);
}

export function normalizeMatchValue(value: string | null | undefined) {
  return normalizeSearch(value ?? "").replace(/[^a-z0-9]/g, "");
}

export function modelHuntMatches(
  hunt: { vehicleMake: string; vehicleModel: string; preferredScale: string; modelManufacturer?: string | null },
  product: { vehicleMake: string; vehicleModel: string; scale: string; modelManufacturer: string },
) {
  const required =
    (!hunt.vehicleMake || normalizeMatchValue(hunt.vehicleMake) === normalizeMatchValue(product.vehicleMake)) &&
    (normalizeMatchValue(hunt.vehicleModel) === normalizeMatchValue(product.vehicleModel) ||
      (!hunt.vehicleMake && normalizeMatchValue(hunt.vehicleModel) === normalizeMatchValue(`${product.vehicleMake} ${product.vehicleModel}`))) &&
    (!hunt.preferredScale || normalizeMatchValue(hunt.preferredScale) === normalizeMatchValue(product.scale));
  const manufacturer = normalizeMatchValue(hunt.modelManufacturer);
  return required && (!manufacturer || manufacturer === normalizeMatchValue(product.modelManufacturer));
}

export function isStripeEventProcessed(processedEventIds: ReadonlySet<string>, eventId: string) {
  return processedEventIds.has(eventId);
}

export function applyInventoryReservation(
  state: { inventoryQuantity: number; reservedQuantity: number },
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Reservation quantity must be positive.");
  if (availableQuantity(state.inventoryQuantity, state.reservedQuantity) < quantity) {
    throw new Error("Insufficient available inventory.");
  }
  return { ...state, reservedQuantity: state.reservedQuantity + quantity };
}

export function releaseInventoryReservation(
  state: { inventoryQuantity: number; reservedQuantity: number },
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || state.reservedQuantity < quantity) {
    throw new Error("Cannot release an invalid reservation.");
  }
  return { ...state, reservedQuantity: state.reservedQuantity - quantity };
}

export function completeInventoryReservation(
  state: { inventoryQuantity: number; reservedQuantity: number },
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || state.reservedQuantity < quantity || state.inventoryQuantity < quantity) {
    throw new Error("Cannot complete an invalid reservation.");
  }
  return {
    inventoryQuantity: state.inventoryQuantity - quantity,
    reservedQuantity: state.reservedQuantity - quantity,
  };
}
