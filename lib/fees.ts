import { calculatePlatformFee, calculateServerTotals } from "./business.ts";
import { config } from "./config.ts";

// Standard rate. An explicitly granted founding offer is allocated per unit below.
export function determineMarketplaceFee() {
  return { marketplaceFeeBps: config.marketplaceFeeBps };
}

export function calculateMarketplaceFee(subtotalCents: number) {
  const decision = determineMarketplaceFee();
  return {
    ...decision,
    platformFeeCents: calculatePlatformFee(subtotalCents, decision.marketplaceFeeBps),
  };
}

export function formatFeePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}

export const FOUNDING_FEE_FREE_UNITS = 10;
export type FoundingFeeProfile = {
  sellerType?: string;
  foundingFeeGrantedAt?: string | null;
  foundingFeeUsedUnits?: number;
  foundingFeeReservedUnits?: number;
};

export function foundingFeeOffer(seller: FoundingFeeProfile) {
  const active = seller.sellerType === "professional" && Boolean(seller.foundingFeeGrantedAt);
  const used = seller.foundingFeeUsedUnits ?? 0;
  const reserved = seller.foundingFeeReservedUnits ?? 0;
  return { active, used, reserved, remaining: active ? Math.max(0, FOUNDING_FEE_FREE_UNITS - used - reserved) : 0 };
}

export function calculateCartMarketplaceFee(
  items: Array<{ priceCents: number; quantity: number }>,
  seller: FoundingFeeProfile,
) {
  // Validate quantities/prices before allocating the offer. Within one checkout,
  // apply available slots to the most expensive units first, regardless of cart order.
  const { subtotalCents } = calculateServerTotals(items, 0, config.marketplaceFeeBps);
  let remaining = foundingFeeOffer(seller).remaining;
  let foundingFeeFreeUnits = 0;
  let foundingFeeFreeSubtotalCents = 0;
  for (const item of [...items].sort((a, b) => b.priceCents - a.priceCents)) {
    const free = Math.min(remaining, item.quantity);
    foundingFeeFreeUnits += free;
    foundingFeeFreeSubtotalCents += free * item.priceCents;
    remaining -= free;
  }
  return {
    marketplaceFeeBps: foundingFeeFreeUnits > 0 && foundingFeeFreeSubtotalCents === subtotalCents ? 0 : config.marketplaceFeeBps,
    foundingFeeFreeUnits,
    foundingFeeFreeSubtotalCents,
  };
}

export function calculateSellerTotals(
  items: Array<{ priceCents: number; quantity: number }>,
  shippingCents: number,
  fee: { marketplaceFeeBps: number; foundingFeeFreeSubtotalCents?: number },
) {
  const totals = calculateServerTotals(items, shippingCents, fee.marketplaceFeeBps);
  const exempt = fee.foundingFeeFreeSubtotalCents ?? 0;
  if (!Number.isSafeInteger(exempt) || exempt < 0 || exempt > totals.subtotalCents) throw new Error("Invalid fee-free subtotal.");
  return { ...totals, platformFeeCents: calculatePlatformFee(totals.subtotalCents - exempt, fee.marketplaceFeeBps) };
}
