export const ANALYTICS_CONSENT_KEY = "mcc-analytics-consent-v1";
export const ANALYTICS_COOKIE = "mcc_analytics";
export const analyticsEvents = ["buyer_search", "buyer_empty_results", "listing_viewed", "add_to_cart", "shipping_completed", "checkout_started", "purchase_completed", "seller_setup_started", "seller_setup_step_completed", "inventory_import", "first_listing_published", "seller_tool_used", "task_abandoned"] as const;
export type AnalyticsEventName = typeof analyticsEvents[number];
export type AnalyticsDetails = { step?: string; result?: string; count?: number; durationMs?: number };
const steps = new Set(["store", "bank", "shipping", "inventory", "profile", "payouts", "listing", "orders", "payments", "import", "preview", "saved", "checkout", "delivery", "setup", "save_store", "save_product", "product_status", "update_stock", "preview_import", "commit_import", "archive_product", "ship_order", "connect_payments", "refresh_payments", "accept_seller_terms"]);
const results = new Set(["success", "error", "errors", "ready", "empty", "started", "completed", "draft", "pending", "active", "blocked", "repeat"]);
// Fixed dimensions only. Never accept search strings, paths, identities or form contents.
export function sanitizeAnalyticsDetails(value: unknown): AnalyticsDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>, output: AnalyticsDetails = {};
  if (typeof input.step === "string" && steps.has(input.step)) output.step = input.step;
  if (typeof input.result === "string" && results.has(input.result)) output.result = input.result;
  if (typeof input.count === "number" && Number.isFinite(input.count)) output.count = Math.max(0, Math.min(100000, Math.trunc(input.count)));
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) output.durationMs = Math.max(0, Math.min(30 * 86400000, Math.trunc(input.durationMs)));
  return output;
}
export function analyticsConsent(cookies: string | null) { return (cookies ?? "").split(";").some(part => part.trim() === `${ANALYTICS_COOKIE}=yes`); }
