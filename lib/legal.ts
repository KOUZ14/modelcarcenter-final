export const POLICY_VERSION = "2026-09-15-seller-processing-v3";
export const POLICY_EFFECTIVE_DATE = "September 15, 2026";

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
