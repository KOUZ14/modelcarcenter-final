export const PROMOTION_TERMS_VERSION = "2026-09-17";
export const PROMOTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const PROMOTION_TOKEN_MS = 30 * 60 * 1000;

export type PromotionSettings = {
  purchasesEnabled: boolean;
  servingEnabled: boolean;
  priceCents: number;
  currency: string;
  taxMode: "unconfigured" | "none" | "automatic";
  taxCode: string;
  sellerIds: string[];
};

export const defaultPromotionSettings: PromotionSettings = {
  purchasesEnabled: false, servingEnabled: true, priceCents: 299,
  currency: "usd", taxMode: "unconfigured", taxCode: "", sellerIds: [],
};

export type PromotionListing = {
  id: string; sellerId: string; title: string; status: string;
  availabilityType: string; inventoryQuantity: number; reservedQuantity: number;
  primaryImageUrl: string | null; sellerStatus: string; sellerType: string;
  sellerTermsVersion: string | null; sellerTermsAcceptedAt: string | null;
  sellerStripeAccountId: string | null; sellerStripeChargesEnabled: number; sellerStripePayoutsEnabled: number;
};

export function promotionIneligibility(listing: PromotionListing, policyVersion: string) {
  if (listing.sellerType !== "professional" || listing.sellerStatus !== "active") return "An active professional store is required.";
  if (listing.sellerTermsVersion !== policyVersion || !listing.sellerTermsAcceptedAt) return "Accept the current seller terms first.";
  if (!listing.sellerStripeAccountId || !listing.sellerStripeChargesEnabled || !listing.sellerStripePayoutsEnabled) return "Complete your store's payment setup first.";
  if (listing.status !== "active") return "Activate this listing first.";
  if (listing.availabilityType !== "in_stock") return "Only in-stock listings can be promoted.";
  if (listing.inventoryQuantity - listing.reservedQuantity < 1) return "No available units remain.";
  if (!listing.primaryImageUrl) return "Add a primary listing photo first.";
  return null;
}

export function promotionPurchaseUnavailable(settings: PromotionSettings, sellerId: string) {
  if (!settings.purchasesEnabled || !settings.servingEnabled) return "New promotion purchases are currently unavailable.";
  if (!Number.isSafeInteger(settings.priceCents) || settings.priceCents < 50 || settings.taxMode === "unconfigured" || (settings.taxMode === "automatic" && !settings.taxCode)) return "Promotion pricing is not configured yet.";
  if (settings.sellerIds.length && !settings.sellerIds.includes(sellerId)) return "Promotions are currently available to participating pilot stores.";
  return null;
}

export function promotionCanServe(campaign: { status: string; startsAt: number | null; endsAt: number | null; paymentStatus: string; refundedCents: number; disputeStatus: string }, now: number) {
  return campaign.status === "active" && campaign.paymentStatus === "paid" && campaign.refundedCents === 0 &&
    ["none", "won"].includes(campaign.disputeStatus) && campaign.startsAt !== null && campaign.startsAt <= now && campaign.endsAt !== null && campaign.endsAt > now;
}

// Stable rotation per minute; choose sellers first so additional listings do not
// buy additional chances at a slot. No visitor identifier enters the selection.
function rotationScore(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function rotatePromotions<T extends { id: string; sellerId: string; productId: string }>(candidates: T[], excludedIds: readonly string[], now: number) {
  const excluded = new Set(excludedIds);
  const bucket = Math.floor(now / 60_000);
  const sellers = new Map<string, T[]>();
  for (const row of candidates) {
    if (excluded.has(row.productId)) continue;
    const group = sellers.get(row.sellerId) ?? [];
    group.push(row); sellers.set(row.sellerId, group);
  }
  return [...sellers].sort(([a], [b]) => rotationScore(`${bucket}:${a}`) - rotationScore(`${bucket}:${b}`) || a.localeCompare(b)).slice(0, 2)
    .map(([, rows]) => rows.sort((a, b) => rotationScore(`${bucket}:${a.id}`) - rotationScore(`${bucket}:${b.id}`) || a.id.localeCompare(b.id))[0]);
}

export type PromotionToken = { campaignId: string; productId: string; nonce: string; issuedAt: number; expiresAt: number };
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");

async function tokenKey(secret: string) {
  if (secret.length < 32) throw new Error("Promotion signing secret is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signPromotionToken(value: PromotionToken, secret: string) {
  const body = btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${body}.${hex(await crypto.subtle.sign("HMAC", await tokenKey(secret), encoder.encode(`promotion-v1:${body}`)))}`;
}

export async function verifyPromotionToken(token: string, secret: string, now = Date.now()): Promise<PromotionToken | null> {
  if (token.length > 1500) return null;
  const [body, signature, extra] = token.split(".");
  if (extra || !body || !/^[a-f0-9]{64}$/.test(signature ?? "")) return null;
  try {
    const bytes = Uint8Array.from(signature.match(/../g)!, x => Number.parseInt(x, 16));
    if (!await crypto.subtle.verify("HMAC", await tokenKey(secret), bytes, encoder.encode(`promotion-v1:${body}`))) return null;
    const value = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/"))) as PromotionToken;
    if (![value.campaignId, value.productId, value.nonce].every(v => typeof v === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(v))) return null;
    if (!Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) || value.issuedAt > now || value.expiresAt <= now || value.expiresAt - value.issuedAt !== PROMOTION_TOKEN_MS) return null;
    return value;
  } catch { return null; }
}
