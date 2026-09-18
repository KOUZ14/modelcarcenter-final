import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { products, sellers, promotionCampaigns, promotionPayments } from "@/db/schema";
import { activeConditions, productSelection, searchCatalog, type CatalogQuery } from "./catalog";
import { getPromotionSettings } from "./promotions";
import { signPromotionToken, verifyPromotionToken, rotatePromotions, PROMOTION_TOKEN_MS } from "./promotion-rules";
import { config } from "./config";
import { POLICY_VERSION } from "./legal";
import type { ProductSummary } from "./types";

export async function getPromotionPlacements(query: CatalogQuery, viewerId: string | null, now = Date.now()) {
  if ((query.page ?? 1) !== 1 || query.seller || query.availability === "preorder" || !(await getPromotionSettings()).servingEnabled) return [];
  const db = getDb();
  const [organic, candidates] = await Promise.all([
    searchCatalog({ ...query, page: 1, pageSize: 24 }),
    db.select({ id: promotionCampaigns.id, sellerId: promotionCampaigns.sellerId, productId: promotionCampaigns.productId, endsAt: promotionCampaigns.endsAt })
      .from(promotionCampaigns).innerJoin(promotionPayments, eq(promotionPayments.campaignId, promotionCampaigns.id))
      .innerJoin(products, eq(products.id, promotionCampaigns.productId)).innerJoin(sellers, eq(sellers.id, products.sellerId))
      .where(and(...activeConditions(query), eq(promotionCampaigns.status, "active"), gt(promotionCampaigns.endsAt, now),
        sql`${promotionCampaigns.startsAt} <= ${now}`, eq(products.availabilityType, "in_stock"), isNotNull(products.primaryImageUrl), ne(products.primaryImageUrl, ""),
        eq(sellers.sellerType, "professional"), eq(sellers.id, promotionCampaigns.sellerId),
        isNotNull(sellers.stripeAccountId), eq(sellers.stripeChargesEnabled, true), eq(sellers.stripePayoutsEnabled, true),
        eq(promotionPayments.status, "paid"), eq(promotionPayments.refundedCents, 0), inArray(promotionPayments.disputeStatus, ["none", "won"]),
        sql`NOT EXISTS (SELECT 1 FROM promotion_refunds r WHERE r.campaign_id=${promotionCampaigns.id} AND r.status NOT IN ('failed','canceled'))`,
        viewerId ? sql`(${sellers.ownerUserId} IS NULL OR ${sellers.ownerUserId} <> ${viewerId})` : undefined)),
  ]);
  const chosen = rotatePromotions(candidates, organic.products.map(p => p.id), now);
  if (!chosen.length) return [];
  const details = await db.select(productSelection).from(products).innerJoin(sellers, eq(sellers.id, products.sellerId))
    .where(and(...activeConditions(query), inArray(products.id, chosen.map(c => c.productId))));
  const nonce = crypto.randomUUID();
  const placements = await Promise.all(chosen.map(async campaign => {
    const product = details.find(p => p.id === campaign.productId);
    if (!product) return null;
    const token = await signPromotionToken({ campaignId: campaign.id, productId: campaign.productId, nonce, issuedAt: now, expiresAt: now + PROMOTION_TOKEN_MS }, config.betterAuthSecret);
    return { campaignId: campaign.id, product: product as ProductSummary, token, expiresAt: Math.min(campaign.endsAt!, now + PROMOTION_TOKEN_MS) };
  }));
  return placements.filter(p => p !== null);
}

export async function recordPromotionEvent(token: string, kind: string, viewerId: string | null, now = Date.now()) {
  if (!["impression", "click"].includes(kind)) return false;
  const value = await verifyPromotionToken(token, config.betterAuthSecret, now);
  if (!value || !(await getPromotionSettings()).servingEnabled || (kind === "impression" && now - value.issuedAt < 1000)) return false;
  const db = getD1(), eventId = crypto.randomUUID(), day = new Date(now).toISOString().slice(0, 10);
  const result = await db.batch([
    db.prepare(`INSERT INTO promotion_events (id,campaign_id,nonce,kind,created_at)
      SELECT ?,c.id,?,?,? FROM promotion_campaigns c JOIN promotion_payments pay ON pay.campaign_id=c.id
      JOIN products p ON p.id=c.product_id JOIN sellers s ON s.id=c.seller_id
      WHERE c.id=? AND c.product_id=? AND p.seller_id=c.seller_id AND c.status='active' AND c.starts_at<=? AND c.ends_at>?
      AND pay.status='paid' AND pay.refunded_cents=0 AND pay.dispute_status IN ('none','won')
      AND NOT EXISTS(SELECT 1 FROM promotion_refunds r WHERE r.campaign_id=c.id AND r.status NOT IN ('failed','canceled'))
      AND p.status='active' AND p.availability_type='in_stock' AND p.inventory_quantity-p.reserved_quantity>0 AND p.primary_image_url IS NOT NULL AND p.primary_image_url<>''
      AND s.status='active' AND s.seller_type='professional' AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL
      AND s.stripe_account_id IS NOT NULL AND s.stripe_charges_enabled=1 AND s.stripe_payouts_enabled=1
      AND (? IS NULL OR s.owner_user_id IS NULL OR s.owner_user_id<>?) ON CONFLICT(campaign_id,nonce,kind) DO NOTHING`)
      .bind(eventId, value.nonce, kind, now, value.campaignId, value.productId, now, now, POLICY_VERSION, viewerId, viewerId),
    db.prepare(`INSERT INTO promotion_daily_metrics (id,campaign_id,day,impressions,clicks) SELECT ?,?,?,?,? WHERE changes()=1
      ON CONFLICT(campaign_id,day) DO UPDATE SET impressions=impressions+excluded.impressions,clicks=clicks+excluded.clicks`)
      .bind(`${value.campaignId}:${day}`, value.campaignId, day, kind === "impression" ? 1 : 0, kind === "click" ? 1 : 0),
  ]);
  return Boolean(result[0].meta.changes);
}
