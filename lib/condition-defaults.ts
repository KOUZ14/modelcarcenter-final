export const conditionDisclosureFields = ["missingParts", "defects", "restorationCustomization"] as const;

/** New describes use history, not an inspection guarantee. Explicit answers always win. */
export function newConditionDefaults(values: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  const result = { ...values };
  if (result.modelCondition !== "new") return result;
  for (const field of conditionDisclosureFields) {
    if (!String(result[field] ?? "").trim()) result[field] = String(previous[field] ?? "").trim() || "None known";
  }
  return result;
}

export function isNoKnownIssue(value: unknown) {
  return /^(none(?: known)?|no(?:ne)? (?:known )?(?:defects|issues|damage|missing parts|repairs)|n\/a|not applicable)[.!]?$/i.test(String(value ?? "").trim());
}
