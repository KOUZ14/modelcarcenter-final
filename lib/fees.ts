import { calculatePlatformFee } from "./business.ts";
import { config } from "./config.ts";

export type SellerFeeProfile = {
  sellerType: "professional" | "collector" | string;
  isFoundingSeller?: boolean | null;
  foundingRateStartsAt?: string | null;
  foundingRateEndsAt?: string | null;
};

export type MarketplaceFeeRates = {
  collectorMarketplaceFeeBps: number;
  professionalMarketplaceFeeBps: number;
  foundingSellerMarketplaceFeeBps: number;
};

export type MarketplaceFeeDecision = {
  marketplaceFeeBps: number;
  standardMarketplaceFeeBps: number;
  rateKind: "collector" | "professional" | "founding_professional";
  foundingPromotionActive: boolean;
};

export function isEligibleForFoundingSellerRate(seller: SellerFeeProfile) {
  return seller.sellerType === "professional";
}

function configuredRates(): MarketplaceFeeRates {
  return {
    collectorMarketplaceFeeBps: config.collectorMarketplaceFeeBps,
    professionalMarketplaceFeeBps: config.professionalMarketplaceFeeBps,
    foundingSellerMarketplaceFeeBps:
      config.foundingSellerMarketplaceFeeBps,
  };
}

export function determineMarketplaceFee(
  seller: SellerFeeProfile,
  now = new Date(),
  rates: MarketplaceFeeRates = configuredRates(),
): MarketplaceFeeDecision {
  if (!isEligibleForFoundingSellerRate(seller)) {
    return {
      marketplaceFeeBps: rates.collectorMarketplaceFeeBps,
      standardMarketplaceFeeBps: rates.collectorMarketplaceFeeBps,
      rateKind: "collector",
      foundingPromotionActive: false,
    };
  }

  const startsAt = parseTimestamp(seller.foundingRateStartsAt);
  const endsAt = parseTimestamp(seller.foundingRateEndsAt);
  const foundingPromotionActive = Boolean(
    seller.isFoundingSeller === true &&
      startsAt &&
      endsAt &&
      startsAt.getTime() <= now.getTime() &&
      now.getTime() < endsAt.getTime(),
  );

  return {
    marketplaceFeeBps: foundingPromotionActive
      ? rates.foundingSellerMarketplaceFeeBps
      : rates.professionalMarketplaceFeeBps,
    standardMarketplaceFeeBps: rates.professionalMarketplaceFeeBps,
    rateKind: foundingPromotionActive
      ? "founding_professional"
      : "professional",
    foundingPromotionActive,
  };
}

export function calculateMarketplaceFeeForSeller(
  subtotalCents: number,
  seller: SellerFeeProfile,
  now = new Date(),
  rates: MarketplaceFeeRates = configuredRates(),
) {
  const decision = determineMarketplaceFee(seller, now, rates);
  return {
    ...decision,
    platformFeeCents: calculatePlatformFee(
      subtotalCents,
      decision.marketplaceFeeBps,
    ),
  };
}

export function foundingSellerRatePeriod(
  startsAt: string | Date,
  months = config.foundingSellerPromotionMonths,
) {
  const start =
    startsAt instanceof Date ? new Date(startsAt.getTime()) : new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Founding seller start date is invalid.");
  }
  const day = start.getUTCDate();
  const targetMonth = start.getUTCMonth() + months;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const end = new Date(start.getTime());
  end.setUTCFullYear(
    targetYear,
    normalizedMonth,
    Math.min(day, daysInTargetMonth),
  );
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function formatFeePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
