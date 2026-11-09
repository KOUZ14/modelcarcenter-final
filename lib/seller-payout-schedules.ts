import { config } from "./config.ts";
import { configureSellerWeeklyPayouts } from "./stripe.ts";
import { SELLER_PAYOUT_POLICY_VERSION, sellerPayoutNotice } from "./payout-schedule.ts";
import { logSecurityEvent } from "./security-events.ts";

// Apply the schedule to existing accounts, then check it daily. Failed accounts
// retry independently; a failure must not stop order releases or other sellers.
export async function processSellerPayoutSchedules(input: {
  database: D1Database;
  now?: Date;
  limit?: number;
  configure?: typeof configureSellerWeeklyPayouts;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const retryBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  const recheckBefore = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const database = input.database;
  const configure = input.configure ?? configureSellerWeeklyPayouts;
  const candidates = await database.prepare(`SELECT s.id, s.stripe_account_id AS accountId,
      s.contact_email AS email, s.seller_type AS sellerType
    FROM sellers s LEFT JOIN seller_payout_schedules p ON p.stripe_account_id = s.stripe_account_id
    WHERE s.stripe_account_id IS NOT NULL AND s.status IN ('active', 'onboarding')
      AND (p.last_attempt_at IS NULL OR p.last_attempt_at <= ?)
      AND (p.verified_at IS NULL OR p.policy_version != ? OR p.verified_at <= ?)
    ORDER BY COALESCE(p.last_attempt_at, ''), s.id LIMIT ?`)
    .bind(retryBefore, SELLER_PAYOUT_POLICY_VERSION, recheckBefore, Math.max(1, Math.min(input.limit ?? 20, 50)))
    .all<{ id: string; accountId: string; email: string; sellerType: string }>();
  let verified = 0, failed = 0;
  for (const seller of candidates.results ?? []) {
    // Claim before the external call so overlapping jobs don't duplicate work.
    const claim = await database.prepare(`INSERT INTO seller_payout_schedules
      (stripe_account_id, seller_id, policy_version, last_attempt_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(stripe_account_id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at
      WHERE seller_payout_schedules.last_attempt_at <= ?`)
      .bind(seller.accountId, seller.id, SELLER_PAYOUT_POLICY_VERSION, nowIso, retryBefore).run();
    if (!claim.meta.changes) continue;
    try {
      await configure(seller.accountId, seller.id);
      const notice = sellerPayoutNotice(config.siteUrl, seller.sellerType);
      await database.batch([
        database.prepare(`UPDATE seller_payout_schedules SET policy_version = ?, verified_at = ?, last_error = NULL
          WHERE stripe_account_id = ? AND seller_id = ?`).bind(SELLER_PAYOUT_POLICY_VERSION, nowIso, seller.accountId, seller.id),
        database.prepare(`INSERT OR IGNORE INTO legal_notifications (id, recipient, subject, body)
          VALUES (?, ?, ?, ?)`).bind(`payout-schedule:${SELLER_PAYOUT_POLICY_VERSION}:${seller.id}:${seller.accountId}`, seller.email, notice.subject, notice.body),
      ]);
      verified++;
    } catch {
      await database.prepare(`UPDATE seller_payout_schedules SET verified_at = NULL,
        last_error = 'Weekly payout setup needs retry or operations review' WHERE stripe_account_id = ?`)
        .bind(seller.accountId).run();
      logSecurityEvent("operation_failed", { scope: "seller-payout-schedule" });
      failed++;
    }
  }
  return { verified, failed };
}
