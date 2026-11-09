import { ANALYTICS_CONSENT_KEY } from "./analytics-rules";
import { TRAFFIC_CONSENT_KEY, TRAFFIC_VISITOR_KEY, TRAFFIC_SOURCE_KEY, trafficIdPattern, trafficSources, trafficPage, trafficSource, type TrafficSource } from "./traffic-rules";

let entrySource: TrafficSource | undefined;
export function clearTrafficStorage() {
  entrySource = undefined;
  try { localStorage.removeItem(TRAFFIC_VISITOR_KEY); sessionStorage.removeItem(TRAFFIC_SOURCE_KEY); } catch { /* Optional storage. */ }
}

export function trackPageView(pathname: string) {
  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "yes" || localStorage.getItem(TRAFFIC_CONSENT_KEY) !== "yes" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl || navigator.doNotTrack === "1") {
      clearTrafficStorage(); return false;
    }
    const page = trafficPage(pathname);
    if (!page || localStorage.getItem("mcc-exclude-measurement") === "yes") return false;
    const now = Date.now();
    let visitor: { id: string; expires: number } | null = null;
    try { visitor = JSON.parse(localStorage.getItem(TRAFFIC_VISITOR_KEY) || "null"); } catch { /* Replace malformed storage. */ }
    if (!visitor || !trafficIdPattern.test(visitor.id) || !Number.isFinite(visitor.expires) || visitor.expires <= now || visitor.expires > now + 90 * 86400000) {
      visitor = { id: crypto.randomUUID(), expires: now + 90 * 86400000 };
      localStorage.setItem(TRAFFIC_VISITOR_KEY, JSON.stringify(visitor));
    }
    if (!entrySource) {
      const saved = sessionStorage.getItem(TRAFFIC_SOURCE_KEY) || "";
      entrySource = trafficSource(document.referrer, location.origin) ?? (Object.hasOwn(trafficSources, saved) ? saved as TrafficSource : "direct");
      sessionStorage.setItem(TRAFFIC_SOURCE_KEY, entrySource);
    }
    void fetch("/api/traffic", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, referrerPolicy: "no-referrer",
      body: JSON.stringify({ id: crypto.randomUUID(), visitorId: visitor.id, page, source: entrySource }),
    }).catch(() => {});
    return true;
  } catch { return false; } // Measurement must never block navigation.
}
