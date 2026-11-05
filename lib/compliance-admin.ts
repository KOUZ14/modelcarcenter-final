import { getD1 } from "@/db";
import { config } from "./config";
import { requiredString, ValidationError } from "./validation";
import { legalNotice } from "./legal-notifications";
import { addBusinessDays } from "./reputation-rules";
import { requestDepositRefund } from "./preorder-deposits";
import { assessSellerCompliance } from "./seller-compliance";

export async function complianceAction(actor:string,input:Record<string,unknown>) {
  const action=requiredString(input.action,'action',60),id=requiredString(input.id,'record',100),reason=requiredString(input.reason,'review findings and reason',4000),db=getD1(),now=new Date();
  const audit=(detail=reason)=>db.prepare("INSERT INTO compliance_audit(id,subject_id,actor,action,detail) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,actor,action,detail);
  if(action==='verify_seller') {
    if(input.verified!==true)throw new ValidationError('Confirm independent verification of contact, identity, bank and tax information.');
    const reference=requiredString(input.reference,'secure verification record reference',500);
    const row=await db.prepare("SELECT * FROM seller_compliance WHERE seller_id=? AND status='submitted'").bind(id).first<{disclosure_required:number;information:string}>();
    if(!row)throw new ValidationError('Review a submitted seller certification.');
    const disclosure=typeof input.disclosure==='string'?input.disclosure.trim():'';
    if(row.disclosure_required&&!disclosure)throw new ValidationError('Provide the legally required public business name, address (or approved limited location), and direct contact method.');
    const info=JSON.parse(row.information),exemption=info.homeAddressException==='requested'?requiredString(input.exemptionReason,'home-address exception determination',2000):null;
    await db.batch([db.prepare("UPDATE seller_compliance SET status='verified',verified_at=?,reviewed_by=?,verification_reference=?,public_disclosure=?,exemption_reason=? WHERE seller_id=? AND status='submitted'").bind(now.toISOString(),actor,reference,disclosure||null,exemption,id),audit(JSON.stringify({reason,reference,disclosure,exemption}))]);
    await assessSellerCompliance(id);return;
  }
  if(action==='suspend_seller') {
    if(!await db.prepare("SELECT 1 FROM sellers WHERE id=?").bind(id).first())throw new ValidationError('Seller not found.');
    await db.batch([db.prepare("UPDATE seller_compliance SET status='suspended',suspended_at=? WHERE seller_id=?").bind(now.toISOString(),id),db.prepare("UPDATE sellers SET status='suspended',updated_at=? WHERE id=?").bind(now.toISOString(),id),audit()]);return;
  }
  if(action==='late_hold'||action==='late_release') {
    if(!await db.prepare("SELECT 1 FROM resolution_late_reviews WHERE case_id=?").bind(id).first())throw new ValidationError('Late review case not found.');
    await db.batch([db.prepare("UPDATE resolution_late_reviews SET payout_hold=?,reviewed_by=?,decision_reason=?,reviewed_at=? WHERE case_id=?").bind(action==='late_hold'?1:0,actor,reason,now.toISOString(),id),audit()]);return;
  }
  if(action==='refund_legacy_deposit') {
    const r=await db.prepare("SELECT id FROM preorder_reservations WHERE id=? AND status IN ('cancelled','expired') AND order_id IS NULL").bind(id).first();
    if(!r)throw new ValidationError('Review a cancelled deposit reservation without a converted order.');
    await audit().run();await requestDepositRefund(id,actor,reason);return;
  }
  if(action==='cancel_overdue') {
    if(!await db.prepare("SELECT 1 FROM orders WHERE id=? AND shipped_at IS NULL AND payment_status IN ('paid','partially_refunded') AND julianday(ship_by_at)<=julianday(?)").bind(id,now.toISOString()).first())throw new ValidationError('A paid overdue unshipped order is required.');
    await db.batch([db.prepare(`INSERT INTO order_shipping_delays(id,order_id,promised_at,proposed_at,response_by,reason,status,requested_by,created_at)
      SELECT ?,id,ship_by_at,ship_by_at,ship_by_at,?,'cancel_requested',?,? FROM orders WHERE id=? AND shipped_at IS NULL
      AND payment_status IN ('paid','partially_refunded') AND julianday(ship_by_at)<=julianday(?)`).bind(crypto.randomUUID(),reason,actor,now.toISOString(),id,now.toISOString()),audit()]);return;
  }
  const report=await db.prepare("SELECT * FROM marketplace_reports WHERE id=?").bind(id).first<{kind:string;email:string;related_id:string|null;subject_url:string;details:string;signature:string;status:string;restore_after:string|null;litigation_at:string|null}>();
  if(!report)throw new ValidationError('Report not found.');
  if(action==='forward_counter') {
    if(report.kind!=='counter_notice'||report.status!=='received'||input.verified!==true)throw new ValidationError('Review and confirm a complete, valid counter-notice.');
    const original=await db.prepare("SELECT email FROM marketplace_reports WHERE id=? AND status='removed'").bind(report.related_id).first<{email:string}>();
    if(!original)throw new ValidationError('Original removal record not found.');
    // Clock starts only after successful forwarding, reconciled by maintenance.
    await db.batch([legalNotice(`counter-forward:${id}`,original.email,'Copyright counter-notice received',`A reviewed counter-notice for report ${report.related_id} follows. Unless we receive notice of a filed court action seeking to restrain the activity, material may be restored 10–14 business days after this counter-notice is forwarded. Reply to ${config.supportEmail}.\n${report.details}\nSigned: ${report.signature}\nContact: ${report.email}`),db.prepare("UPDATE marketplace_reports SET status='forward_pending',reviewed_by=?,decision=? WHERE id=?").bind(actor,reason,id),audit()]);return;
  }
  if(action==='litigation') {
    if(report.kind!=='counter_notice')throw new ValidationError('Select the counter-notice.');
    await db.batch([db.prepare("UPDATE marketplace_reports SET litigation_at=?,status='litigation',decision=?,reviewed_by=? WHERE id=?").bind(now.toISOString(),reason,actor,id),audit()]);return;
  }
  if(action==='remove_listing') {
    if(report.status==='removed')throw new ValidationError('This removal is already recorded.');
    const url=new URL(report.subject_url),slug=url.pathname.match(/^\/products\/([^/]+)\/?$/)?.[1];
    if(url.origin!==new URL(config.siteUrl).origin||!slug)throw new ValidationError('Use the existing content moderation controls for this content, then record the decision here. Automated removal supports MCC listing URLs.');
    const product=await db.prepare("SELECT id,seller_id FROM products WHERE slug=?").bind(decodeURIComponent(slug)).first<{id:string;seller_id:string}>();
    if(!product)throw new ValidationError('Listing not found.');
    const seller=await db.prepare("SELECT contact_email FROM sellers WHERE id=?").bind(product.seller_id).first<{contact_email:string}>();
    await db.batch([db.prepare("UPDATE products SET status='inactive',updated_at=? WHERE id=?").bind(now.toISOString(),product.id),db.prepare("UPDATE marketplace_reports SET status='removed',seller_id=?,reviewed_by=?,decision=? WHERE id=?").bind(product.seller_id,actor,reason,id),audit(),...(seller?[legalNotice(`removal:${id}`,seller.contact_email,'Listing removed after report',`Listing ${report.subject_url} was removed following report ${id}. Findings: ${reason}. ${report.kind==='copyright'?`The complaint identifies: ${report.details}. Signed: ${report.signature}. Contact: ${report.email}. Submit a counter-notice at ${config.siteUrl}/copyright if removal was mistaken.`:'Contact support to request review.'}`)]:[])]);return;
  }
  if(action==='restore_reviewed') {
    if(report.kind!=='counter_notice'||report.status!=='forwarded'||!report.restore_after||Date.parse(report.restore_after)>Date.now()||report.litigation_at||input.verified!==true)throw new ValidationError('Restoration requires a forwarded valid counter-notice, the waiting period, no litigation notice, and confirmation that content was restored after review.');
    // A human restores through listing/community moderation after checking other restrictions.
    await db.batch([db.prepare("UPDATE marketplace_reports SET status='restored',reviewed_by=?,decision=? WHERE id=?").bind(actor,reason,id),audit()]);return;
  }
  if(action==='close_report') {
    await db.batch([db.prepare("UPDATE marketplace_reports SET status='closed',reviewed_by=?,decision=? WHERE id=?").bind(actor,reason,id),audit()]);return;
  }
  throw new ValidationError('Unknown compliance action.');
}

export async function reconcileCounterNotices() {
  const db=getD1();
  const rows=await db.prepare("SELECT r.id,n.sent_at FROM marketplace_reports r JOIN legal_notifications n ON n.id='counter-forward:'||r.id WHERE r.status='forward_pending' AND n.sent_at IS NOT NULL").all<{id:string;sent_at:string}>();
  for(const r of rows.results??[])await db.prepare("UPDATE marketplace_reports SET status='forwarded',counter_forwarded_at=?,restore_after=?,restore_by=? WHERE id=? AND status='forward_pending'").bind(r.sent_at,addBusinessDays(new Date(r.sent_at),10).toISOString(),addBusinessDays(new Date(r.sent_at),14).toISOString(),r.id).run();
  const due=await db.prepare("SELECT id FROM marketplace_reports WHERE status='forwarded' AND litigation_at IS NULL AND julianday(restore_after)<=julianday('now')").all<{id:string}>();
  for(const r of due.results??[])await legalNotice(`restore-review:${r.id}`,config.supportEmail,'Copyright restoration review due',`Counter-notice ${r.id} reached its restoration window. Check for court-action notices and restore eligible material no later than the displayed deadline. Review /admin/compliance.`).run();
}
