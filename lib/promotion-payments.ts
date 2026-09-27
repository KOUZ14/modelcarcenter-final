import { getD1 } from "@/db";
import { POLICY_VERSION } from "./legal";
import { ValidationError } from "./validation";
import { createPromotionCheckout, createPromotionRefund, retrieveCheckoutSession, retrieveChargeRefunds, retrievePromotionDispute, retrievePromotionPaymentIntent, findPromotionCheckout, type StripeCheckoutSession } from "./stripe";
import { campaignSelect, getPromotionCampaign, getPromotionListing, getPromotionSettings, promotionAuditStatement, type CampaignRow } from "./promotions";
import { promotionIneligibility, promotionPurchaseUnavailable, PROMOTION_DURATION_MS, PROMOTION_TERMS_VERSION } from "./promotion-rules";

const objectId = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;

export async function startPromotionPurchase(sellerId: string, productId: string, requestKey: string, termsVersion: string) {
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw new ValidationError("A valid purchase request key is required.");
  if (termsVersion !== PROMOTION_TERMS_VERSION) throw new ValidationError("Accept the current promotion terms before paying.");
  const settings = await getPromotionSettings();
  const disabled = promotionPurchaseUnavailable(settings, sellerId);
  if (disabled) throw new ValidationError(disabled);
  const listing = await getPromotionListing(productId);
  if (!listing || listing.sellerId !== sellerId) throw new ValidationError("Choose a listing from your store.");
  const unavailable = promotionIneligibility(listing, POLICY_VERSION);
  if (unavailable) throw new ValidationError(unavailable);
  const db = getD1(), now = Date.now();
  const prior = () => db.prepare(`${campaignSelect} WHERE p.seller_id=? AND p.request_key=?`).bind(sellerId, requestKey).first<CampaignRow>();
  let campaign = await prior();
  if (!campaign) {
    const id = crypto.randomUUID(), paymentId = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare("UPDATE promotion_campaigns SET status='expired',updated_at=? WHERE seller_id=? AND status IN ('active','paused') AND ends_at<=?").bind(now, sellerId, now),
        db.prepare(`INSERT INTO promotion_campaigns (id,seller_id,product_id,title,price_cents,currency,tax_mode,tax_code,terms_version,duration_ms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, sellerId, productId, listing.title, settings.priceCents, settings.currency, settings.taxMode, settings.taxCode, termsVersion, PROMOTION_DURATION_MS, now, now),
        db.prepare("INSERT INTO promotion_payments (id,campaign_id,seller_id,request_key,created_at) VALUES (?,?,?,?,?)").bind(paymentId, id, sellerId, requestKey, now),
        promotionAuditStatement(id, sellerId, "purchase_requested", JSON.stringify({ priceCents: settings.priceCents, termsVersion }), now),
      ]);
      campaign = await getPromotionCampaign(id, sellerId);
    } catch (error) {
      campaign = await prior();
      if (!campaign) {
        if (String(error).includes("UNIQUE")) throw new ValidationError("This listing already has a pending or running promotion.");
        throw error;
      }
    }
  }
  if (campaign.product_id !== productId) throw new ValidationError("This request key belongs to another listing.");
  if (campaign.status !== "pending_payment" || campaign.payment_status !== "pending") throw new ValidationError("This purchase has already been processed. Refresh campaigns.");
  const session = await recoverPromotionSession(campaign);
  if (!session) throw new ValidationError("This checkout expired. Start a new purchase.");
  if (session.payment_status === "paid" || session.status === "expired") {
    await synchronizePromotionSession(campaign.id, await retrieveCheckoutSession(session.id));
    return { campaignId: campaign.id, checkoutUrl: null };
  }
  if (!session.url || session.status !== "open") throw new ValidationError("Payment is processing. Refresh the campaign shortly.");
  return { campaignId: campaign.id, checkoutUrl: session.url };
}

async function recoverPromotionSession(c: CampaignRow) {
  if (c.session_id) return retrieveCheckoutSession(c.session_id);
  // Never create another session after the original request's expiry. Search for
  // an accepted-but-lost response first, including beyond Stripe's key retention.
  const session = Date.now() - c.created_at >= 30 * 60_000
    ? await findPromotionCheckout(c.payment_id, c.created_at)
    : await createPromotionCheckout({ campaignId: c.id, paymentId: c.payment_id, sellerId: c.seller_id, title: c.title,
      priceCents: c.price_cents, currency: c.currency, taxMode: c.tax_mode, taxCode: c.tax_code, termsVersion: c.terms_version,
      expiresAt: Math.floor(c.created_at / 1000) * 1000 + 60 * 60_000 });
  if (!session) {
    // All sessions that could have been created in the original window were
    // inspected, and creation is no longer permitted by this application.
    await getD1().batch([
      getD1().prepare("UPDATE promotion_payments SET status='expired',checked_at=? WHERE id=? AND status='pending' AND session_id IS NULL").bind(Date.now(), c.payment_id),
      getD1().prepare("UPDATE promotion_campaigns SET status='ended',reason='checkout_expired',updated_at=? WHERE id=? AND status='pending_payment'").bind(Date.now(), c.id),
    ]);
    return null;
  }
  await getD1().prepare("UPDATE promotion_payments SET session_id=?,checked_at=?,error='' WHERE id=? AND (session_id IS NULL OR session_id=?)").bind(session.id, Date.now(), c.payment_id, session.id).run();
  return session;
}

export async function synchronizePromotionSession(id: string, session: StripeCheckoutSession) {
  const c = await getPromotionCampaign(id), db = getD1(), now = Date.now();
  if (session.metadata?.purpose !== "listing_promotion" || session.metadata.campaign_id !== c.id || session.metadata.promotion_payment_id !== c.payment_id || session.metadata.seller_id !== c.seller_id || (c.session_id && c.session_id !== session.id)) throw new Error("Promotion payment identity mismatch.");
  if (session.payment_status !== "paid") {
    if (session.status === "expired") {
      await db.batch([
        db.prepare("UPDATE promotion_payments SET status='expired',checked_at=? WHERE id=? AND status='pending'").bind(now, c.payment_id),
        db.prepare("UPDATE promotion_campaigns SET status='ended',reason='checkout_expired',updated_at=? WHERE id=? AND status='pending_payment' AND EXISTS(SELECT 1 FROM promotion_payments WHERE campaign_id=? AND status='expired')").bind(now, id, id),
      ]);
    } else await db.prepare("UPDATE promotion_payments SET checked_at=? WHERE id=?").bind(now, c.payment_id).run();
    return;
  }
  const intentId = objectId(session.payment_intent);
  const charge = typeof session.payment_intent === "object" && session.payment_intent ? session.payment_intent.latest_charge : null;
  const chargeId = objectId(charge);
  const balance = typeof charge === "object" && charge ? charge.balance_transaction : null;
  const fee = typeof balance === "object" && balance ? balance.fee : null;
  const total = session.amount_total, tax = session.total_details?.amount_tax ?? 0;
  if (!intentId || !Number.isSafeInteger(total) || total! < 1 || !Number.isSafeInteger(tax) || tax < 0) throw new Error("Incomplete promotion payment details.");
  const mismatch = session.currency !== c.currency || session.amount_subtotal !== c.price_cents || total !== c.price_cents + tax || session.metadata.promotion_terms_version !== c.terms_version;
  const serving = (await getPromotionSettings()).servingEnabled;
  await db.prepare(`UPDATE promotion_payments SET session_id=?,payment_intent_id=?,charge_id=COALESCE(?,charge_id),status='paid',total_cents=?,tax_cents=?,fee_cents=COALESCE(?,fee_cents),checked_at=?,error=? WHERE id=?`)
    .bind(session.id, intentId, chargeId, total!, tax, fee, now, mismatch ? "Paid amount or currency does not match the purchase." : "", c.payment_id).run();
  // A delayed paid event must consult provider refunds before first activation.
  if (!chargeId) throw new Error("Promotion charge is not available for reconciliation yet.");
  await synchronizePromotionRefunds(id);
  await db.batch([
    db.prepare(`UPDATE promotion_campaigns AS c SET status='active',starts_at=?,ends_at=?+duration_ms,updated_at=?,reason=''
      WHERE id=? AND status='pending_payment' AND starts_at IS NULL AND ?=1 AND ?=0
      AND EXISTS(SELECT 1 FROM products p JOIN sellers s ON s.id=p.seller_id WHERE p.id=c.product_id AND p.seller_id=c.seller_id
        AND p.status='active' AND p.availability_type='in_stock' AND p.inventory_quantity-p.reserved_quantity>0
        AND p.primary_image_url IS NOT NULL AND p.primary_image_url<>'' AND s.status='active' AND s.seller_type='professional' AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL
        AND s.stripe_account_id IS NOT NULL AND s.stripe_charges_enabled=1 AND s.stripe_payouts_enabled=1)
      AND EXISTS(SELECT 1 FROM promotion_payments WHERE campaign_id=c.id AND refunded_cents=0 AND dispute_status IN ('none','won'))
      AND NOT EXISTS(SELECT 1 FROM promotion_refunds WHERE campaign_id=c.id AND status NOT IN ('failed','canceled'))`)
      .bind(now, now, now, id, serving ? 1 : 0, mismatch ? 1 : 0, POLICY_VERSION),
    db.prepare("INSERT INTO promotion_audit (id,campaign_id,actor,action,detail,created_at) SELECT ?,?,'stripe','activated','Payment verified',? WHERE changes()=1").bind(crypto.randomUUID(), id, now),
  ]);
  const current = await getPromotionCampaign(id);
  if ((mismatch || current.starts_at === null) && current.refunded_cents === 0 && ["none", "won"].includes(current.dispute_status)) {
    await queuePromotionRefund(id, total!, "activation-failed", "Payment could not activate the listing.", "system");
  }
}

export async function queuePromotionRefund(id: string, amountCents: number, operationKey: string, reason: string, actor: string) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new ValidationError("Enter a positive refund amount in cents.");
  const c = await getPromotionCampaign(id);
  if (c.payment_status !== "paid" || !c.payment_intent_id) throw new ValidationError("This campaign has no confirmed payment to refund.");
  const key = `${id}:${operationKey}`, now = Date.now();
  const prior = await getD1().prepare("SELECT id,amount_cents FROM promotion_refunds WHERE operation_key=?").bind(key).first<{ id: string; amount_cents: number }>();
  if (prior) {
    if (prior.amount_cents !== amountCents) throw new ValidationError("This refund request was already used for a different amount.");
    return prior.id;
  }
  const refundId = crypto.randomUUID();
  const result = await getD1().batch([
    getD1().prepare(`INSERT INTO promotion_refunds (id,campaign_id,operation_key,amount_cents,reason,created_at,updated_at)
      SELECT ?,?,?,?,?,?,? FROM promotion_payments p WHERE p.campaign_id=? AND p.status='paid' AND p.dispute_status IN ('none','won')
      AND ?<=p.total_cents-p.refunded_cents-COALESCE((SELECT sum(amount_cents) FROM promotion_refunds r WHERE r.campaign_id=p.campaign_id AND r.status IN ('queued','pending','requires_action')),0)
      ON CONFLICT(operation_key) DO NOTHING`)
      .bind(refundId, id, key, amountCents, reason, now, now, id, amountCents),
    getD1().prepare("UPDATE promotion_campaigns SET status='ended',reason='refund_requested',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM promotion_refunds WHERE operation_key=?)").bind(now, id, key),
    getD1().prepare("INSERT INTO promotion_audit (id,campaign_id,actor,action,detail,created_at) SELECT ?,?,?,'refund_requested',?,? WHERE EXISTS(SELECT 1 FROM promotion_refunds WHERE id=?)").bind(crypto.randomUUID(), id, actor, reason, now, refundId),
  ]);
  if (!result[0].meta.changes) {
    const existing = await getD1().prepare("SELECT id FROM promotion_refunds WHERE operation_key=?").bind(key).first<{ id: string }>();
    if (existing) return existing.id;
    if (actor === "system" && (c.refunded_cents > 0 || c.dispute_status !== "none")) return null;
    throw new ValidationError("The refund exceeds the available payment balance or the payment is disputed.");
  }
  return refundId;
}

export async function synchronizePromotionRefunds(id: string) {
  const c = await getPromotionCampaign(id);
  if (!c.charge_id) return;
  const refunds = await retrieveChargeRefunds(c.charge_id);
  const statements: D1PreparedStatement[] = [];
  let succeeded = 0;
  for (const refund of refunds) {
    if (refund.status === "succeeded") succeeded += refund.amount;
    const ownedId = refund.metadata?.promotion_refund_id;
    const now = Date.now();
    if (ownedId) statements.push(getD1().prepare("UPDATE promotion_refunds SET stripe_refund_id=?,status=?,error='',updated_at=? WHERE id=? AND campaign_id=?").bind(refund.id, refund.status, now, ownedId, id));
    // Dashboard refunds also have a permanent local record.
    statements.push(getD1().prepare(`INSERT INTO promotion_refunds (id,campaign_id,operation_key,stripe_refund_id,amount_cents,status,reason,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'Stripe refund',?,? WHERE NOT EXISTS(SELECT 1 FROM promotion_refunds WHERE stripe_refund_id=?) ON CONFLICT DO NOTHING`)
      .bind(crypto.randomUUID(), id, `stripe:${refund.id}`, refund.id, refund.amount, refund.status, now, now, refund.id));
  }
  statements.push(getD1().prepare("UPDATE promotion_payments SET refunded_cents=max(refunded_cents,?) WHERE id=?").bind(succeeded, c.payment_id));
  if (refunds.some(r => !["failed", "canceled"].includes(r.status))) statements.push(getD1().prepare("UPDATE promotion_campaigns SET status='ended',reason='refunded',updated_at=? WHERE id=?").bind(Date.now(), id));
  await getD1().batch(statements);
}

type StripePromotionEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function processPromotionStripeEvent(event: StripePromotionEvent): Promise<{ promotion: true } | null> {
  if (!/^(checkout\.session\.|charge\.(refunded|dispute\.)|refund\.)/.test(event.type)) return null;
  const value = event.data.object;
  let c: CampaignRow | null = null;
  if (event.type.startsWith("checkout.session.")) {
    const metadata = value.metadata as Record<string, string> | undefined;
    c = await getD1().prepare(`${campaignSelect} WHERE p.session_id=? OR (p.id=? AND c.id=?)`).bind(String(value.id ?? ""), metadata?.promotion_payment_id ?? "", metadata?.campaign_id ?? "").first<CampaignRow>();
    if (!c) {
      if (metadata?.purpose === "listing_promotion") throw new Error("Unknown promotion payment; reconciliation required.");
      return null;
    }
    await synchronizePromotionSession(c.id, await retrieveCheckoutSession(String(value.id)));
    if (event.type === "checkout.session.async_payment_failed") await getD1().batch([
      getD1().prepare("UPDATE promotion_payments SET status='failed',checked_at=? WHERE campaign_id=? AND status='pending'").bind(Date.now(), c.id),
      getD1().prepare("UPDATE promotion_campaigns SET status='ended',reason='payment_failed',updated_at=? WHERE id=? AND status='pending_payment' AND EXISTS(SELECT 1 FROM promotion_payments WHERE campaign_id=? AND status='failed')").bind(Date.now(), c.id, c.id),
    ]);
  } else {
    const intentId = objectId(value.payment_intent), chargeId = event.type === "charge.refunded" ? String(value.id) : objectId(value.charge);
    c = await getD1().prepare(`${campaignSelect} WHERE p.payment_intent_id=? OR p.charge_id=?`).bind(intentId ?? "", chargeId ?? "").first<CampaignRow>();
    if (!c && intentId) {
      const intent = await retrievePromotionPaymentIntent(intentId);
      if (intent.metadata?.purpose !== "listing_promotion") return null;
      c = await getPromotionCampaign(intent.metadata.campaign_id);
      const session = await recoverPromotionSession(c);
      if (!session) throw new Error("Promotion session is not reconciled.");
      await synchronizePromotionSession(c.id, await retrieveCheckoutSession(session.id));
    }
    if (!c) return null;
    if (event.type.startsWith("charge.dispute.")) {
      const dispute = await retrievePromotionDispute(String(value.id));
      await getD1().batch([
        getD1().prepare("UPDATE promotion_payments SET dispute_status=? WHERE campaign_id=?").bind(dispute.status, c.id),
        getD1().prepare("UPDATE promotion_campaigns SET status='paused',reason='payment_dispute',updated_at=? WHERE id=? AND status='active' AND ?<>'won'").bind(Date.now(), c.id, dispute.status),
        promotionAuditStatement(c.id, "stripe", "dispute", dispute.status),
      ]);
    } else await synchronizePromotionRefunds(c.id);
  }
  await getD1().prepare("INSERT INTO stripe_events (id,type) VALUES (?,?) ON CONFLICT DO NOTHING").bind(event.id, event.type).run();
  return { promotion: true };
}

export async function processPromotions(now = Date.now()) {
  const db = getD1();
  await db.batch([
    db.prepare("UPDATE promotion_campaigns SET status='expired',updated_at=? WHERE status IN ('active','paused') AND ends_at<=?").bind(now, now),
    db.prepare("DELETE FROM promotion_events WHERE created_at<?").bind(now - 7 * 86_400_000),
  ]);
  const payments = await db.prepare(`${campaignSelect} WHERE (p.status='pending' OR (p.status='paid' AND (p.fee_cents IS NULL OR c.status IN ('pending_payment','active','paused') OR p.error<>''))) AND p.checked_at<? ORDER BY p.checked_at LIMIT 30`).bind(now - 60_000).all<CampaignRow>();
  let errors = 0;
  for (const c of payments.results ?? []) {
    try {
      const session = await recoverPromotionSession(c);
      if (session) await synchronizePromotionSession(c.id, await retrieveCheckoutSession(session.id));
    } catch {
      errors++;
      await db.prepare("UPDATE promotion_payments SET checked_at=?,error='Payment reconciliation needs retry or review.' WHERE id=?").bind(now, c.payment_id).run();
    }
  }
  const refunds = await db.prepare(`SELECT r.*,p.payment_intent_id FROM promotion_refunds r JOIN promotion_payments p ON p.campaign_id=r.campaign_id
    WHERE r.status IN ('queued','pending','requires_action') ORDER BY r.updated_at LIMIT 30`).all<{ id: string; campaign_id: string; amount_cents: number; stripe_refund_id: string | null; payment_intent_id: string; status: string; created_at: number }>();
  for (const refund of refunds.results ?? []) {
    try {
      await synchronizePromotionRefunds(refund.campaign_id);
      const current = await db.prepare("SELECT status,stripe_refund_id FROM promotion_refunds WHERE id=?").bind(refund.id).first<{ status: string; stripe_refund_id: string | null }>();
      if (current?.status === "queued" && !current.stripe_refund_id) {
        // A lost response remains discoverable via refund metadata. Beyond the
        // idempotency retention window require review instead of issuing again.
        if (now - refund.created_at > 23 * 60 * 60_000) throw new Error("Refund requires review.");
        const result = await createPromotionRefund({ id: refund.id, campaignId: refund.campaign_id, paymentIntentId: refund.payment_intent_id, amountCents: refund.amount_cents });
        await db.prepare("UPDATE promotion_refunds SET stripe_refund_id=?,status=?,updated_at=?,error='' WHERE id=?").bind(result.id, result.status, now, refund.id).run();
        await synchronizePromotionRefunds(refund.campaign_id);
      }
    } catch {
      errors++;
      await db.prepare("UPDATE promotion_refunds SET error='Refund needs retry or administrator review.',updated_at=? WHERE id=?").bind(now, refund.id).run();
    }
  }
  return { reconciled: payments.results?.length ?? 0, refunds: refunds.results?.length ?? 0, errors };
}
