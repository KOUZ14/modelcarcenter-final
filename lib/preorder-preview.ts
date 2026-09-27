import { getD1 } from "@/db";

export async function previewPreorderMaintenance() {
  const db = getD1();
  const at = new Date().toISOString();
  const count = async (query: string, values: string[] = []) => Number((await db.prepare(`SELECT count(*) n FROM (${query})`).bind(...values).first<{ n: number }>())?.n || 0);
  const [expiring, reminders, dispatchNotices, notices, refundPayments, refundRequests, depositCheckouts, staleCheckouts, overdueBatches, allocations, restockWatches, retainedDeposits, lastRun] = await Promise.all([
    count("SELECT id FROM preorder_reservations WHERE (status='hold' AND hold_expires_at<=?) OR (status IN ('reserved','allocated','awaiting_payment') AND consent_state='required' AND consent_deadline<=?) OR (status IN ('allocated','awaiting_payment') AND payment_deadline<=?) LIMIT 100", [at, at, at]),
    count("SELECT id FROM preorder_reservations r WHERE status IN ('allocated','awaiting_payment') AND payment_deadline>? AND payment_deadline<=? AND NOT EXISTS (SELECT 1 FROM preorder_events e WHERE e.id='payment-reminder-'||r.id||'-'||r.payment_deadline) LIMIT 100", [at, new Date(Date.now() + 86400000).toISOString()]),
    count("SELECT id FROM incoming_batches b WHERE supply_state!='cancelled' AND dispatch_end>? AND dispatch_end<=? AND EXISTS (SELECT 1 FROM preorder_reservations r WHERE r.batch_id=b.id AND r.status IN ('reserved','allocated','awaiting_payment')) AND NOT EXISTS (SELECT 1 FROM preorder_events e WHERE e.id='dispatch-approaching-'||b.id||'-'||b.revision) LIMIT 50", [at, new Date(Date.now() + 7 * 86400000).toISOString()]),
    count("SELECT id FROM preorder_events WHERE recipient IS NOT NULL AND delivery_status!='sent' AND (next_attempt_at IS NULL OR next_attempt_at<=?) LIMIT 40", [at]),
    count("SELECT id FROM preorder_payment_ledger WHERE status='recovery' AND refund_status IN ('required','pending','requires_action') LIMIT 20"),
    count("SELECT id FROM preorder_refund_requests WHERE status='pending' LIMIT 30"),
    count("SELECT reservation_id FROM preorder_deposit_checkouts WHERE status='pending' LIMIT 30"),
    count("SELECT id FROM checkout_reservations WHERE status='pending' AND expires_at<=? LIMIT 50", [at]),
    count("SELECT id FROM incoming_batches b WHERE dispatch_end<=? AND supply_state!='cancelled' AND EXISTS (SELECT 1 FROM preorder_reservations r WHERE r.batch_id=b.id AND r.status IN ('reserved','allocated','awaiting_payment') AND (json_extract(r.terms,'$.paymentModel')!='deposit_10' OR r.status='reserved') AND r.consent_state!='required') LIMIT 30", [at]),
    count("SELECT DISTINCT batch_id FROM preorder_reservations WHERE status='reserved' AND consent_state='accepted' LIMIT 30"),
    count("SELECT DISTINCT a.product_id FROM availability_alerts a JOIN incoming_batches b ON b.listing_id=a.product_id WHERE a.status='active' AND b.status='open' AND b.opens_at<=? AND b.cutoff_at>? LIMIT 20", [at, at]),
    count("SELECT r.id FROM preorder_reservations r JOIN preorder_payment_ledger l ON l.reservation_id=r.id AND l.kind='deposit' JOIN preorder_deposit_checkouts d ON d.reservation_id=r.id JOIN incoming_batches b ON b.id=r.batch_id JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id WHERE r.status IN ('cancelled','expired') AND r.reason IN ('buyer_change_of_mind','payment_deadline_expired','account_deleted') AND julianday(r.updated_at)<julianday('now','-7 days') AND r.order_id IS NULL AND b.supply_state!='cancelled' AND l.status='paid' AND l.refund_status='not_required' AND l.refunded_cents=0 AND d.seller_transfer_id IS NULL AND d.dispute_status IN ('none','won','warning_closed') AND s.status='active' AND s.stripe_payouts_enabled=1 LIMIT 20"),
    db.prepare("SELECT created_at, detail FROM preorder_events WHERE kind='maintenance_completed' ORDER BY created_at DESC LIMIT 1").first<{ created_at: string; detail: string }>(),
  ]);
  return { checkedAt: at, expiring, reminders, dispatchNotices, notices, refundPayments, refundRequests, depositCheckouts, staleCheckouts, overdueBatches, allocations, restockWatches, retainedDeposits, lastRun };
}
