import { getD1 } from "@/db";
import { POLICY_VERSION } from "./legal";
import { ValidationError } from "./validation";
import { defaultPromotionSettings, promotionIneligibility, PROMOTION_TERMS_VERSION, type PromotionSettings, type PromotionListing } from "./promotion-rules";

export type CampaignRow = {
  id: string; seller_id: string; product_id: string; title: string; status: string; reason: string;
  price_cents: number; currency: string; tax_mode: string; tax_code: string; terms_version: string; duration_ms: number;
  starts_at: number | null; ends_at: number | null; created_at: number; updated_at: number;
  payment_id: string; session_id: string | null; payment_intent_id: string | null; charge_id: string | null;
  payment_status: string; total_cents: number; tax_cents: number; fee_cents: number | null;
  refunded_cents: number; dispute_status: string; payment_error: string; checked_at: number;
};
export const campaignSelect = `SELECT c.*, p.id AS payment_id, p.session_id, p.payment_intent_id, p.charge_id,
  p.status AS payment_status, p.total_cents, p.tax_cents, p.fee_cents, p.refunded_cents, p.dispute_status,
  p.error AS payment_error, p.checked_at FROM promotion_campaigns c JOIN promotion_payments p ON p.campaign_id = c.id`;

export function promotionAuditStatement(campaignId: string | null, actor: string, action: string, detail: string, now = Date.now()) {
  return getD1().prepare("INSERT INTO promotion_audit (id,campaign_id,actor,action,detail,created_at) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), campaignId, actor, action, detail, now);
}

export async function getPromotionSettings(): Promise<PromotionSettings> {
  const row = await getD1().prepare("SELECT settings FROM promotion_settings WHERE id = 'main'").first<{ settings: string }>();
  return row ? JSON.parse(row.settings) as PromotionSettings : { ...defaultPromotionSettings };
}

export async function savePromotionSettings(payload: Record<string, unknown>, actor: string) {
  const price = Number(payload.priceCents);
  if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000) throw new ValidationError("Enter a price between 0 and 1,000,000 cents.");
  if (!["unconfigured", "none", "automatic"].includes(String(payload.taxMode))) throw new ValidationError("Select the promotion tax setting.");
  const sellerIds = String(payload.sellerIds ?? "").split(/[\s,]+/).filter(Boolean);
  if (payload.audience === "selected" && sellerIds.length === 0) throw new ValidationError("Select at least one seller or explicitly choose all eligible sellers.");
  if (sellerIds.length > 100 || sellerIds.some(id => !/^[a-zA-Z0-9-]{1,100}$/.test(id))) throw new ValidationError("Use at most 100 valid seller IDs.");
  const settings: PromotionSettings = {
    purchasesEnabled: payload.purchasesEnabled === true, servingEnabled: payload.servingEnabled === true,
    priceCents: price, currency: "usd", taxMode: payload.taxMode as PromotionSettings["taxMode"],
    taxCode: String(payload.taxCode ?? "").trim(), sellerIds,
  };
  if (settings.taxCode && !/^txcd_\d{8}$/.test(settings.taxCode)) throw new ValidationError("Enter a valid Stripe tax code.");
  if (settings.purchasesEnabled && (price < 50 || settings.taxMode === "unconfigured" || (settings.taxMode === "automatic" && !settings.taxCode))) throw new ValidationError("Set the price and tax treatment before enabling purchases.");
  if (settings.purchasesEnabled && !settings.servingEnabled) throw new ValidationError("Enable placements before enabling purchases.");
  const previous = await getPromotionSettings();
  if (payload.expectedSettings && JSON.stringify(previous) !== payload.expectedSettings) throw new ValidationError("Settings changed since your preview. Reload and review the changes again.");
  const now = Date.now();
  await getD1().batch([
    getD1().prepare("INSERT INTO promotion_settings (id,settings,updated_at) VALUES ('main',?,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at").bind(JSON.stringify(settings), now),
    promotionAuditStatement(null, actor, "settings", JSON.stringify({ previous, settings, reason: requirePromotionReason(payload.reason) }), now),
  ]);
  return settings;
}

export function requirePromotionReason(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 3 || value.length > 500) throw new ValidationError("Enter a reason (3–500 characters).");
  return value.trim();
}

export async function getPromotionListing(productId: string) {
  return getD1().prepare(`SELECT p.id, p.seller_id AS sellerId, p.title, p.status, p.availability_type AS availabilityType,
    p.inventory_quantity AS inventoryQuantity, p.reserved_quantity AS reservedQuantity, p.primary_image_url AS primaryImageUrl,
    s.status AS sellerStatus, s.seller_type AS sellerType, s.seller_terms_version AS sellerTermsVersion,
    s.seller_terms_accepted_at AS sellerTermsAcceptedAt,s.stripe_account_id AS sellerStripeAccountId,s.stripe_charges_enabled AS sellerStripeChargesEnabled,s.stripe_payouts_enabled AS sellerStripePayoutsEnabled FROM products p JOIN sellers s ON s.id=p.seller_id WHERE p.id=?`)
    .bind(productId).first<PromotionListing>();
}

export async function getPromotionCampaign(id: string, sellerId?: string) {
  const row = await getD1().prepare(`${campaignSelect} WHERE c.id=?${sellerId ? " AND c.seller_id=?" : ""}`)
    .bind(...(sellerId ? [id, sellerId] : [id])).first<CampaignRow>();
  if (!row) throw new ValidationError("Promotion not found.");
  return row;
}

export async function changePromotionCampaign(id: string, sellerId: string | null, action: string, actor: string, reason = "") {
  const campaign = await getPromotionCampaign(id, sellerId ?? undefined);
  const now = Date.now();
  if (!["pause", "resume", "end", "reinstate"].includes(action)) throw new ValidationError("Unknown campaign action.");
  if (sellerId && action === "reinstate") throw new ValidationError("Administrator access required.");
  if (action === "resume" || action === "reinstate") {
    const listing = await getPromotionListing(campaign.product_id);
    const unavailable = listing ? promotionIneligibility(listing, POLICY_VERSION) : "Listing unavailable.";
    if (unavailable) throw new ValidationError(unavailable);
    if (campaign.reason !== "seller_paused" && action !== "reinstate") throw new ValidationError("This campaign requires administrator review.");
  }
  const next = action === "pause" ? "paused" : action === "end" ? "ended" : "active";
  const detail = sellerId ? (action === "pause" ? "seller_paused" : action === "end" ? "seller_ended" : "") : reason;
  const allowed = action === "end" ? "c.status IN ('pending_payment','active','paused')" : action === "pause" ? "c.status='active'" : "c.status='paused'";
  const result = await getD1().batch([
    getD1().prepare(`UPDATE promotion_campaigns AS c SET status=?,reason=?,updated_at=? WHERE id=? AND ${allowed}
      ${action === "end" ? "" : `AND ends_at>? AND EXISTS (SELECT 1 FROM promotion_payments p WHERE p.campaign_id=c.id AND p.status='paid' AND p.refunded_cents=0 AND p.dispute_status IN ('none','won')) AND NOT EXISTS (SELECT 1 FROM promotion_refunds r WHERE r.campaign_id=c.id AND r.status NOT IN ('failed','canceled'))`}`)
      .bind(...(action === "end" ? [next, detail, now, id] : [next, detail, now, id, now])),
    getD1().prepare("INSERT INTO promotion_audit (id,campaign_id,actor,action,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1")
      .bind(crypto.randomUUID(), id, actor, action, detail, now),
  ]);
  if (!result[0].meta.changes) throw new ValidationError("The campaign changed or cannot perform this action. Refresh its status.");
}

export async function getSellerPromotions(sellerId: string) {
  const db = getD1();
  const now = Date.now();
  const settings = await getPromotionSettings();
  const campaigns = await db.prepare(`SELECT c.id,c.product_id,c.title,c.status,c.reason,c.price_cents,c.currency,c.starts_at,c.ends_at,
    p.status AS payment_status,p.total_cents,p.refunded_cents,p.dispute_status,
    COALESCE((SELECT sum(impressions) FROM promotion_daily_metrics WHERE campaign_id=c.id),0) AS impressions,
    COALESCE((SELECT sum(clicks) FROM promotion_daily_metrics WHERE campaign_id=c.id),0) AS clicks,
    (SELECT group_concat(DISTINCT status) FROM promotion_refunds WHERE campaign_id=c.id) AS refund_status
    FROM promotion_campaigns c JOIN promotion_payments p ON p.campaign_id=c.id WHERE c.seller_id=? ORDER BY c.created_at DESC LIMIT 100`).bind(sellerId).all<Record<string, unknown>>();
  const listings = await db.prepare(`SELECT p.id,p.title,p.seller_sku AS sku,p.price_cents AS priceCents,p.currency,p.status,p.availability_type AS availabilityType,p.seller_id AS sellerId,
    p.inventory_quantity AS inventoryQuantity,p.reserved_quantity AS reservedQuantity,p.primary_image_url AS primaryImageUrl,
    s.status AS sellerStatus,s.seller_type AS sellerType,s.seller_terms_version AS sellerTermsVersion,s.seller_terms_accepted_at AS sellerTermsAcceptedAt,
    s.stripe_account_id AS sellerStripeAccountId,s.stripe_charges_enabled AS sellerStripeChargesEnabled,s.stripe_payouts_enabled AS sellerStripePayoutsEnabled,
    EXISTS(SELECT 1 FROM promotion_campaigns c WHERE c.product_id=p.id AND (c.status='pending_payment' OR (c.status IN ('active','paused') AND c.ends_at>?))) AS hasCampaign
    FROM products p JOIN sellers s ON s.id=p.seller_id WHERE p.seller_id=? ORDER BY p.title LIMIT 1000`).bind(now, sellerId).all<PromotionListing & { hasCampaign: number; sku: string; priceCents: number; currency: string }>();
  return { settings: { ...settings, sellerIds: undefined }, pilotEligible: !settings.sellerIds.length || settings.sellerIds.includes(sellerId), termsVersion: PROMOTION_TERMS_VERSION,
    campaigns: (campaigns.results ?? []).map(c => {
      const listing = (listings.results ?? []).find(l => l.id === c.product_id);
      return { ...c, status: ["active", "paused"].includes(String(c.status)) && Number(c.ends_at) <= now ? "expired" : c.status,
        deliveryReason: !settings.servingEnabled ? "Sponsored placements are temporarily stopped." : listing ? promotionIneligibility(listing, POLICY_VERSION) : "Listing unavailable." };
    }),
    listings: (listings.results ?? []).map(l => ({ id: l.id, title: l.title, sku: l.sku, priceCents: l.priceCents, currency: l.currency, quantity: Math.max(0,l.inventoryQuantity-l.reservedQuantity), imageUrl: l.primaryImageUrl, unavailable: promotionIneligibility(l, POLICY_VERSION) ?? (l.hasCampaign ? "Already promoted." : null) })),
  };
}

export async function getAdminPromotions() {
  const [campaigns, refunds, audit, totals, settings, sellerOptions, impact] = await Promise.all([
    getD1().prepare(`${campaignSelect} ORDER BY c.created_at DESC LIMIT 200`).all<CampaignRow>(),
    getD1().prepare("SELECT * FROM promotion_refunds ORDER BY created_at DESC LIMIT 100").all(),
    getD1().prepare("SELECT * FROM promotion_audit ORDER BY created_at DESC LIMIT 100").all(),
    getD1().prepare(`SELECT COALESCE(sum(total_cents),0) AS gross_cents,COALESCE(sum(tax_cents),0) AS tax_cents,
      COALESCE(sum(fee_cents),0) AS recorded_fee_cents,COALESCE(sum(refunded_cents),0) AS refunded_cents,
      count(CASE WHEN fee_cents IS NULL THEN 1 END) AS unsettled_payments FROM promotion_payments WHERE status='paid'`).first(),
    getPromotionSettings(),
    getD1().prepare("SELECT id, store_name, status FROM sellers ORDER BY store_name").all(),
    getD1().prepare("SELECT count(*) campaigns, count(DISTINCT c.seller_id) sellers FROM promotion_campaigns c JOIN promotion_payments p ON p.campaign_id=c.id WHERE c.status='active' AND p.status='paid' AND c.ends_at > ?").bind(Date.now()).first(),
  ]);
  return { campaigns: campaigns.results ?? [], refunds: refunds.results ?? [], audit: audit.results ?? [], totals, settings, sellers: sellerOptions.results ?? [], impact };
}
