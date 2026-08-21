export const POLICY_VERSION = "2026-08-20-protection-v2";
export const POLICY_EFFECTIVE_DATE = "August 20, 2026";

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
