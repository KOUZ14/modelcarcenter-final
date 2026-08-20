export const POLICY_VERSION = "2026-08-19";
export const POLICY_EFFECTIVE_DATE = "August 19, 2026";

export function isCurrentPolicyVersion(value: unknown) {
  return value === POLICY_VERSION;
}
