export const POLICY_VERSION = "2026-11-05-founding-store-offer-v6";
export const POLICY_EFFECTIVE_DATE = "November 5, 2026";

export function isCurrentPolicyVersion(value: unknown) {
  return value === POLICY_VERSION;
}

export function sellerAcceptedCurrentTerms(seller: {
  sellerTermsVersion?: string | null;
  sellerTermsAcceptedAt?: string | null;
}) {
  return (
    isCurrentPolicyVersion(seller.sellerTermsVersion) &&
    Boolean(seller.sellerTermsAcceptedAt)
  );
}
