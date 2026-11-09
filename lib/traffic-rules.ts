export const TRAFFIC_CONSENT_KEY = "mcc-traffic-consent-v1";
export const TRAFFIC_COOKIE = "mcc_traffic";
export const TRAFFIC_VISITOR_KEY = "mcc-traffic-visitor-v1";
export const TRAFFIC_SOURCE_KEY = "mcc-traffic-source-v1";
export const CONSENT_CHANGED_EVENT = "mcc:measurement-consent";
export const trafficPages = {
  home: "Home", marketplace: "Marketplace", listing: "Listing details", models: "Model catalog",
  sellers: "Seller storefronts", sell: "Start selling", store: "Seller hub", cart: "Cart",
  checkout: "Checkout", community: "Community", collection: "Collections", account: "Account",
  hunts: "Model Hunts", preorders: "Preorders", help: "Help and policies", other: "Other pages",
} as const;
export const trafficSources = { direct: "Direct / unknown", search: "Search engines", social: "Social networks", referral: "Other websites" } as const;
export type TrafficPage = keyof typeof trafficPages;
export type TrafficSource = keyof typeof trafficSources;
export const trafficIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// Classify locally. Never transmit paths, slugs, query strings or referrer URLs.
export function trafficPage(pathname: string): TrafficPage | null {
  const part = pathname.split("/")[1];
  if (["admin", "api", "media", "sign-in", "signout-with-chatgpt", "signin-with-chatgpt", "beta-review"].includes(part)) return null;
  if (!part) return "home";
  if (["products"].includes(part)) return "listing";
  if (["marketplace", "search"].includes(part)) return "marketplace";
  if (["community", "collectors"].includes(part)) return "community";
  if (["account", "profile", "messages", "notifications", "wishlist"].includes(part)) return "account";
  if (part === "model-hunt") return "hunts";
  if (["help", "contact", "privacy", "cookies", "terms", "seller-terms", "promotion-terms", "shipping", "returns", "protection", "resolution", "report", "copyright", "unsubscribe"].includes(part)) return "help";
  return Object.hasOwn(trafficPages, part) ? part as TrafficPage : "other";
}

export function trafficSource(referrer: string, origin: string): TrafficSource | null {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return null; // Preserve the entry source within this tab.
    const host = url.hostname.toLowerCase();
    const matches = (domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    if (matches(["google.com", "google.co.uk", "google.ca", "google.de", "google.fr", "google.co.in", "bing.com", "duckduckgo.com", "search.yahoo.com", "baidu.com", "yandex.com"])) return "search";
    if (matches(["facebook.com", "instagram.com", "t.co", "twitter.com", "x.com", "reddit.com", "linkedin.com", "youtube.com", "pinterest.com", "tiktok.com", "threads.net"])) return "social";
    return "referral";
  } catch { return "direct"; }
}
