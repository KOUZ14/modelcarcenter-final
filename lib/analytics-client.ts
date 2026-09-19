import { ANALYTICS_CONSENT_KEY, sanitizeAnalyticsDetails, type AnalyticsDetails, type AnalyticsEventName } from "./analytics-rules";
const sent = new Set<string>();
export function sellerSetupElapsed(storeId: string, start = false) {
  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "yes") return undefined;
    const key = `mcc-setup-start:${storeId}`;
    const previous = localStorage.getItem(key);
    if (!previous && start) localStorage.setItem(key, String(Date.now()));
    return previous ? Math.max(0, Date.now() - Number(previous)) : undefined;
  } catch { return undefined; }
}
export function trackEvent(name: AnalyticsEventName, details: AnalyticsDetails = {}, options: { onceKey?: string } = {}) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "yes" || localStorage.getItem("mcc-exclude-measurement") === "yes" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl || navigator.doNotTrack === "1") return;
    const key = options.onceKey ? `${name}:${options.onceKey}` : null;
    const persistent = name === "first_listing_published" || name === "seller_setup_started" || name === "seller_setup_step_completed";
    const storage = persistent ? localStorage : sessionStorage;
    if (key && (sent.has(key) || storage.getItem(`mcc-measured:${key}`))) return;
    if (key) { sent.add(key); storage.setItem(`mcc-measured:${key}`, "1"); }
    void fetch("/api/measurement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), name, details: sanitizeAnalyticsDetails(details) }), keepalive: true }).catch(() => {});
  } catch { /* Optional measurement never blocks a task. */ }
}
