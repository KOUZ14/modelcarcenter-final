import { previewPreorderMaintenance } from "./preorder-preview";
import { eq } from "drizzle-orm";
import { getDb, getD1 } from "@/db";
import { preorderReservations, incomingBatches } from "@/db/schema";
import { allocateBatch, cancelPreorder, eventStatement, termsOf } from "./preorders";
import { recoverPreorderRefunds } from "./preorder-payments";
import { releaseStaleReservations } from "./inventory";
import { sendEmail, escapeHtml } from "./email";
import { config } from "./config";
import { notifyRestockSubscribers } from "./availability";
import { formatMoney } from "./format";
import { recoverPreorderDeposits, settleForfeitedPreorderDeposits } from "./preorder-deposits";
import { recoverPreorderOrderRefunds } from "./preorder-order-refunds";

export async function processPreorders(actor = "system") {
  const before = await previewPreorderMaintenance();
  const db=getD1(), at=new Date().toISOString();
  await recoverPreorderDeposits();
  await releaseStaleReservations(50);
  const approaching=await db.prepare(`SELECT b.id,b.revision,b.dispatch_end deadline,p.title,s.contact_email email
    FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id
    WHERE b.supply_state!='cancelled' AND b.dispatch_end>? AND b.dispatch_end<=?
    AND EXISTS (SELECT 1 FROM preorder_reservations r WHERE r.batch_id=b.id AND r.status IN ('reserved','allocated','awaiting_payment'))
    AND NOT EXISTS (SELECT 1 FROM preorder_events e WHERE e.id='dispatch-approaching-'||b.id||'-'||b.revision) LIMIT 50`)
    .bind(at,new Date(Date.now()+7*86400000).toISOString()).all<{id:string;revision:number;deadline:string;title:string;email:string}>();
  for (const b of (approaching.results??[])) await eventStatement({id:`dispatch-approaching-${b.id}-${b.revision}`,batchId:b.id,actor:"system",kind:"dispatch_approaching",recipient:b.email,
    detail:{message:`The dispatch window for ${b.title} ends ${b.deadline}. Check incoming stock and unpaid allocations. If the estimate is no longer supported, update the ship date from the inventory item in Seller Hub.`,url:`${config.siteUrl}/store?view=inventory&filter=preorders`}}).run();
  const expired=await db.prepare(`SELECT id FROM preorder_reservations WHERE
    (status='hold' AND hold_expires_at <= ?) OR
    (status IN ('reserved','allocated','awaiting_payment') AND consent_state='required' AND consent_deadline <= ?) OR
    (status IN ('allocated','awaiting_payment') AND payment_deadline <= ?) LIMIT 100`).bind(at,at,at).all<{id:string}>();
  for (const row of (expired.results ?? [])) await cancelPreorder(row.id,"system","response_deadline_expired",true);
  await db.prepare(`UPDATE preorder_waitlist SET status=(SELECT CASE WHEN r.status='reserved' THEN 'reserved' ELSE 'expired' END FROM preorder_reservations r WHERE r.id=reservation_id)
    WHERE status='invited' AND reservation_id IN (SELECT id FROM preorder_reservations WHERE status IN ('reserved','cancelled','expired'))`).run();
  const overdue=await db.prepare(`SELECT id FROM incoming_batches WHERE dispatch_end <= ? AND supply_state != 'cancelled'
    AND EXISTS(SELECT 1 FROM preorder_reservations r WHERE r.batch_id=incoming_batches.id AND r.status IN ('reserved','allocated','awaiting_payment') AND (json_extract(r.terms,'$.paymentModel')!='deposit_10' OR r.status='reserved') AND r.consent_state != 'required') LIMIT 30`).bind(at).all<{id:string}>();
  for (const row of (overdue.results ?? [])) {
    // No replacement date is invented. An overdue buyer can cancel; keeping the
    // reservation requires a supported revised estimate from the seller.
    await db.batch([
      db.prepare("UPDATE incoming_batches SET status='closed' WHERE id=?").bind(row.id),
      db.prepare(`UPDATE preorder_reservations SET consent_state='required',reason='dispatch_overdue',actor='system',updated_at=?,
        consent_deadline=strftime('%Y-%m-%dT%H:%M:%fZ',?, '+' || (SELECT delay_response_days FROM preorder_policies WHERE version=json_extract(preorder_reservations.terms,'$.policyVersion')) || ' days')
        WHERE batch_id=? AND status IN ('reserved','allocated','awaiting_payment') AND (json_extract(terms,'$.paymentModel')!='deposit_10' OR status='reserved') AND consent_state != 'required'`).bind(at,at,row.id),
    ]);
  }
  const reminders=await db.prepare(`SELECT id,contact_email email,payment_deadline deadline FROM preorder_reservations r
    WHERE status IN ('allocated','awaiting_payment') AND payment_deadline > ? AND payment_deadline <= ?
    AND NOT EXISTS (SELECT 1 FROM preorder_events e WHERE e.id='payment-reminder-'||r.id||'-'||r.payment_deadline) LIMIT 100`)
    .bind(at,new Date(Date.now()+86400000).toISOString()).all<{id:string;email:string;deadline:string}>();
  for (const r of (reminders.results ?? [])) await eventStatement({id:`payment-reminder-${r.id}-${r.deadline}`,reservationId:r.id,actor:"system",kind:"payment_reminder",recipient:r.email,detail:{message:"Your items are held until the deadline below. If you miss the balance deadline, your preorder expires under its accepted deposit and cancellation terms.",paymentDeadline:r.deadline}}).run();
  const batches=await db.prepare("SELECT DISTINCT batch_id id FROM preorder_reservations WHERE status='reserved' AND consent_state='accepted' LIMIT 30").all<{id:string}>();
  for (const b of (batches.results ?? [])) await allocateBatch(b.id,"system");
  const watches = await db.prepare(`SELECT DISTINCT a.product_id id FROM availability_alerts a
    JOIN incoming_batches b ON b.listing_id=a.product_id
    WHERE a.status='active' AND b.status='open' AND b.opens_at <= ? AND b.cutoff_at > ? LIMIT 20`).bind(at,at).all<{id:string}>();
  for (const watch of (watches.results ?? [])) await notifyRestockSubscribers(watch.id);
  await recoverPreorderRefunds();
  await recoverPreorderOrderRefunds();
  await settleForfeitedPreorderDeposits();
  const delivery = await deliverPreorderNotices();
  const after = await previewPreorderMaintenance();
  const result = { ...delivery, expiry: { considered: expired.results?.length ?? 0, remaining: after.expiring }, reminders: { paymentCandidates: reminders.results?.length ?? 0, dispatchCandidates: approaching.results?.length ?? 0, sent: delivery.sent, considered: delivery.considered }, recovery: { before: before.refundPayments + before.refundRequests, remaining: after.refundPayments + after.refundRequests, pendingDeposits: after.depositCheckouts, pendingSettlements: after.retainedDeposits } };
  await eventStatement({ actor, kind: "maintenance_completed", detail: result }).run();
  return result;
}

export async function deliverPreorderNotices(limit=40) {
  const db=getD1(), at=new Date().toISOString();
  const pending=await db.prepare("SELECT id FROM preorder_events WHERE recipient IS NOT NULL AND delivery_status != 'sent' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT ?").bind(at,limit).all<{id:string}>();
  let sent=0;
  for (const candidate of (pending.results ?? [])) {
    const claim=await db.prepare(`UPDATE preorder_events SET delivery_status='sending',attempts=attempts+1,next_attempt_at=?
      WHERE id=? AND delivery_status != 'sent' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`)
      .bind(new Date(Date.now()+5*60000).toISOString(),candidate.id,at).run();
    if (!claim.meta.changes) continue;
    const event=await db.prepare("SELECT * FROM preorder_events WHERE id=?").bind(candidate.id).first<{id:string;reservation_id:string|null;kind:string;detail:string;recipient:string;attempts:number}>();
    if (!event) continue;
    const [r]=event.reservation_id?await getDb().select().from(preorderReservations).where(eq(preorderReservations.id,event.reservation_id)).limit(1):[];
    const [batch]=r?await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,r.batchId)).limit(1):[];
    const detail=JSON.parse(event.detail), terms=r?termsOf(r):null;
    const lines=[terms?`${terms.title} - ${terms.variant}. Sold by ${terms.sellerName}.`:"Preorder update",
      detail.message,detail.status?`Reservation status: ${detail.status}.`:null,
      detail.reason?`Reason: ${String(detail.reason).replaceAll("_"," ")}.`:null,
      detail.allocatedQuantity?`Inspected units allocated: ${detail.allocatedQuantity}.`:null,
      terms?`Original dispatch estimate: ${terms.dispatch.label}.`:null,
      batch?`Current dispatch estimate: ${termsOf(batch).dispatch.label}.`:null,
      detail.consent==="required"||event.kind==="consent_required"?`Accept the revised estimate or cancel by ${detail.consentDeadline??detail.responseDeadline}. ${terms?.paymentModel === "deposit_10" ? "Cancelling or not responding requests a full deposit refund." : "No response cancels your unpaid reservation without a fee."} Payment is blocked until you consent.`:null,
      detail.paymentDeadline?`Payment deadline: ${detail.paymentDeadline}.`:null,
      event.kind==="refund_update"?`Refund status: ${detail.status}. A pending or failed refund has not completed.`:null,
      detail.refundedCents!=null?`Returned: ${formatMoney(detail.refundedCents,detail.currency)}. Still owed: ${formatMoney(detail.outstandingCents,detail.currency)}. Pending: ${formatMoney(detail.pendingCents,detail.currency)}.`:null,
      detail.url??`${config.siteUrl}/account?view=orders`].filter(Boolean).join("\n\n");
    try {
      const result=await sendEmail({to:event.recipient,subject:`MCC preorder: ${event.kind.replaceAll("_"," ")}`,text:lines,html:`<h1>Preorder update</h1><p>${escapeHtml(lines).replaceAll("\n\n","</p><p>")}</p>`,idempotencyKey:`preorder-${event.id}`});
      if (!result.sent) throw new Error("Email not configured.");
      await db.prepare("UPDATE preorder_events SET delivery_status='sent',next_attempt_at=NULL WHERE id=?").bind(event.id).run(); sent++;
    } catch {
      await db.prepare("UPDATE preorder_events SET delivery_status='pending',next_attempt_at=? WHERE id=?").bind(new Date(Date.now()+Math.min(1440,2**Math.min(event.attempts,10))*60000).toISOString(),event.id).run();
    }
  }
  return {sent,considered:(pending.results ?? []).length};
}
