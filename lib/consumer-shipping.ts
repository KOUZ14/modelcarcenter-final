import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { orders } from "@/db/schema";
import { config } from "./config";
import { requiredString, ValidationError } from "./validation";
import { createFullRefund } from "./preorder-order-refunds";
import { retrieveChargeRefunds } from "./stripe";
import { legalNotice } from "./legal-notifications";
import { trackingEvidence } from "./tracking-evidence";
export { legalNotice, deliverLegalNotices } from "./legal-notifications";
export { assertExternalShippingAllowed } from "./shipping-compliance";

export async function requestShippingDelay(userId: string, payload: Record<string,unknown>) {
  const orderId = requiredString(payload.orderId,"order",100);
  const proposedAt = requiredString(payload.proposedAt,"revised ship date",40);
  const reason = requiredString(payload.reason,"reason for delay",2000);
  const now = new Date().toISOString();
  const row = await getD1().prepare(`SELECT o.*,s.contact_email FROM orders o JOIN sellers s ON s.id=o.seller_id
    WHERE o.id=? AND s.owner_user_id=? AND o.payment_status IN ('paid','partially_refunded')
    AND o.shipped_at IS NULL AND o.fulfillment_status IN ('unfulfilled','processing')`).bind(orderId,userId).first<{ship_by_at:string;buyer_email:string;order_number:string}>();
  if (!row || !row.ship_by_at || Date.parse(row.ship_by_at)<=Date.now()) throw new ValidationError("Request a supported revised date before the current shipping deadline. An overdue order needs cancellation and refund review.");
  if (!Number.isFinite(Date.parse(proposedAt)) || Date.parse(proposedAt)<=Date.parse(row.ship_by_at) || !/(Z|[+-]\d\d:\d\d)$/.test(proposedAt)) throw new ValidationError("Enter a later ship date with a timezone.");
  const id=crypto.randomUUID();
  await getD1().batch([
    getD1().prepare(`INSERT INTO order_shipping_delays(id,order_id,promised_at,proposed_at,response_by,reason,requested_by,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id,orderId,row.ship_by_at,new Date(proposedAt).toISOString(),row.ship_by_at,reason,userId,now),
    legalNotice(`delay:${id}`,row.buyer_email,`Shipping delay: ${row.order_number}`,`${reason}\nProposed ship date: ${proposedAt}. Accept the revised date or cancel for a full refund at ${config.siteUrl}/shipping/requests before ${row.ship_by_at}. Without your explicit acceptance, we will cancel and refund the unshipped order. You can also reply to this email for help.`),
  ]);
  return {id};
}

export async function respondToShippingDelay(userId:string,payload:Record<string,unknown>) {
  const id=requiredString(payload.id,"request",100), accept=payload.action==="accept";
  if (!accept && payload.action!=="cancel") throw new ValidationError("Choose accept or cancel.");
  const now=new Date().toISOString(),db=getD1();
  const result=await db.prepare(`UPDATE order_shipping_delays SET status=?,responded_at=? WHERE id=? AND status='pending'
    AND (?=0 OR (julianday(response_by)>julianday(?) AND julianday(proposed_at)>julianday(?)))
    AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.buyer_user_id=? AND o.shipped_at IS NULL
      AND o.payment_status IN ('paid','partially_refunded')) RETURNING order_id,proposed_at`).bind(accept?"accepted":"cancel_requested",now,id,accept?1:0,now,now,userId).first<{order_id:string;proposed_at:string}>();
  if (!result) throw new ValidationError("This request is no longer available. Refresh the order or contact support.");
  // The accepted proposal is authoritative even if this update is interrupted.
  if (accept) await db.prepare("UPDATE orders SET ship_by_at=?,updated_at=? WHERE id=? AND shipped_at IS NULL").bind(result.proposed_at,now,result.order_id).run();
}

export async function cancelRefundablePreorderOrder(userId:string,orderId:string) {
  const row=await getD1().prepare(`SELECT o.id,o.ship_by_at FROM orders o JOIN preorder_reservations r ON r.order_id=o.id
    WHERE o.id=? AND o.buyer_user_id=? AND json_extract(r.terms,'$.policyVersion')='mcc-preorder-deposit-2026-09-v3'
    AND o.shipped_at IS NULL AND o.fulfillment_status IN ('unfulfilled','processing') AND o.payment_status IN ('paid','partially_refunded')`)
    .bind(orderId,userId).first<{id:string;ship_by_at:string}>();
  if (!row) throw new ValidationError("This order is no longer eligible for cancellation before shipment. Contact support for review.");
  const now=new Date().toISOString();
  await getD1().prepare(`INSERT INTO order_shipping_delays(id,order_id,promised_at,proposed_at,response_by,reason,status,requested_by,created_at)
    VALUES(?,?,?,?,?,?,'cancel_requested',?,?) ON CONFLICT DO NOTHING`).bind(`buyer-cancel:${orderId}`,orderId,row.ship_by_at??now,now,now,"Buyer cancellation under refundable preorder terms",userId,now).run();
  await getD1().prepare("UPDATE order_shipping_delays SET status='cancel_requested' WHERE order_id=? AND status='pending'").bind(orderId).run();
}

export async function processShippingDelays(now=new Date()) {
  const db=getD1(),at=now.toISOString();
  // Recover a consent write interrupted before its order update. Never replace it with an older proposal.
  await db.prepare(`UPDATE orders SET ship_by_at=(SELECT proposed_at FROM order_shipping_delays d WHERE d.order_id=orders.id AND d.status='accepted' ORDER BY responded_at DESC LIMIT 1)
    WHERE shipped_at IS NULL AND EXISTS(SELECT 1 FROM order_shipping_delays d WHERE d.order_id=orders.id AND d.status='accepted' AND julianday(d.proposed_at)>julianday(orders.ship_by_at))`).run();
  const approaching=await db.prepare(`SELECT o.id,o.order_number,o.ship_by_at,s.contact_email FROM orders o JOIN sellers s ON s.id=o.seller_id
    WHERE o.shipped_at IS NULL AND o.payment_status IN ('paid','partially_refunded') AND o.fulfillment_status IN ('unfulfilled','processing')
    AND julianday(o.ship_by_at) BETWEEN julianday(?) AND julianday(?,'+1 day') LIMIT 100`).bind(at,at).all<{id:string;order_number:string;ship_by_at:string;contact_email:string}>();
  for(const o of approaching.results??[]) await legalNotice(`ship-warning:${o.id}:${o.ship_by_at}`,o.contact_email,`Ship-by deadline: ${o.order_number}`,`Carrier acceptance is due by ${o.ship_by_at}. If you cannot meet it, request buyer consent before that deadline at ${config.siteUrl}/shipping/requests. A label alone is not shipment.`).run();
  await db.prepare("UPDATE order_shipping_delays SET status='fulfilled' WHERE status IN ('pending','accepted') AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.shipped_at IS NOT NULL)").run();
  await db.prepare(`UPDATE order_shipping_delays SET status='cancel_requested'  WHERE status='pending' AND julianday(response_by)<=julianday(?)`).bind(at).run();
  // Historical orders without this workflow need individual review of any off-platform consent.
  await db.prepare(`INSERT OR IGNORE INTO order_shipping_delays(id,order_id,promised_at,proposed_at,response_by,reason,status,requested_by,created_at)
    SELECT 'overdue:'||o.id,o.id,o.ship_by_at,o.ship_by_at,o.ship_by_at,'Shipping deadline passed without accepted delay','cancel_requested','system',?
    FROM orders o WHERE o.protection_policy_version='delivery-14-v2' AND o.shipped_at IS NULL
    AND o.fulfillment_status IN ('unfulfilled','processing') AND o.payment_status IN ('paid','partially_refunded')
    AND julianday(o.ship_by_at)<=julianday(?) AND NOT EXISTS(SELECT 1 FROM order_shipping_delays d WHERE d.order_id=o.id AND d.status IN ('pending','cancel_requested','refunding'))`).bind(at,at).run();
  const due=await db.prepare("SELECT id,order_id,created_at FROM order_shipping_delays WHERE status IN ('cancel_requested','refunding') ORDER BY created_at LIMIT 30").all<{id:string;order_id:string;created_at:string}>();
  for (const task of due.results??[]) {
    try {
      const [o]=await getDb().select().from(orders).where(eq(orders.id,task.order_id)).limit(1);
      if (!o) continue;
      if (o.trackingNumber && o.carrier && !o.shippedAt && o.paymentStatus!=="refunded") {
        const {retrieveShippoTracking}=await import("./shippo");
        const tracking=await retrieveShippoTracking(o.carrier,o.trackingNumber);
        if (tracking.carrier?.toLowerCase()!==o.carrier.toLowerCase() || tracking.tracking_number!==o.trackingNumber) throw new Error("Carrier tracking identity needs review");
        const evidence=trackingEvidence(tracking,now);
        if (evidence.shippedAt) {
          if (Date.parse(evidence.shippedAt)<=Date.parse(task.created_at)) {
            await db.prepare("UPDATE order_shipping_delays SET status='fulfilled',error='Carrier acceptance predates cancellation; review notice timing' WHERE id=?").bind(task.id).run();
            const {recordOrderTrackingUpdate}=await import("./shipping");await recordOrderTrackingUpdate([o.id],tracking);continue;
          }
        }
        if (evidence.hasUndatedDispatch) throw new Error("Carrier acceptance date needs review");
      }
      if (o.shippedAt && o.paymentStatus!=="refunded") {
        await db.prepare("UPDATE order_shipping_delays SET status='fulfilled',error='Shipment occurred before cancellation; support review required' WHERE id=?").bind(task.id).run(); continue;
      }
      await db.prepare("UPDATE order_shipping_delays SET status='refunding',attempts=attempts+1 WHERE id=?").bind(task.id).run();
      if (o.paymentStatus!=="refunded") {
        if (!o.stripePaymentIntentId || !['paid','partially_refunded'].includes(o.paymentStatus)) throw new Error("Payment review required");
        let returned=o.refundedAmountCents;
        if (!o.preorderDepositCents && o.stripeChargeId) {
          const allRefunds=await retrieveChargeRefunds(o.stripeChargeId);
          if(o.checkoutGroupId && allRefunds.some(r=>!r.metadata?.order_id&&!['failed','canceled'].includes(r.status))) throw new Error("Shared-charge refund requires attribution review");
          const refunds=o.checkoutGroupId?allRefunds.filter(r=>r.metadata?.order_id===o.id):allRefunds;
          if(refunds.some(r=>['pending','requires_action'].includes(r.status))) throw new Error("Refund pending");
          returned=Math.max(returned,refunds.filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount,0));
        }
        const refund=returned>=o.totalCents ? {id:o.stripeRefundId,status:'succeeded',sellerTransferReversedCents:o.sellerTransferReversedCents} : await createFullRefund({orderId:o.id,paymentIntentId:o.stripePaymentIntentId,chargeId:o.stripeChargeId,totalCents:o.totalCents,refundedAmountCents:returned,paymentFlow:o.paymentFlow,stripeTransferId:o.stripeTransferId,sellerTransferAmountCents:o.sellerTransferAmountCents,sellerTransferReversedCents:o.sellerTransferReversedCents,shippingLabelCostCents: o.shippingLabelCostCents, sellerProceedsCents:o.sellerProceedsCents});
        if(refund.status!=='succeeded') throw new Error("Refund awaiting settlement");
        await db.prepare(`UPDATE orders SET payment_status='refunded',refunded_amount_cents=total_cents,stripe_refund_id=?,fulfillment_status='cancelled',seller_transfer_reversed_cents=MAX(seller_transfer_reversed_cents,?),seller_transfer_status=CASE WHEN stripe_transfer_id IS NULL THEN 'cancelled' WHEN ?>=seller_transfer_amount_cents AND seller_transfer_amount_cents>0 THEN 'reversed' ELSE seller_transfer_status END,updated_at=? WHERE id=?`).bind(refund.id,refund.sellerTransferReversedCents,refund.sellerTransferReversedCents,at,o.id).run();
      }
      await db.prepare("UPDATE orders SET fulfillment_status='cancelled' WHERE id=? AND payment_status='refunded' AND shipped_at IS NULL").bind(o.id).run();
      await db.batch([db.prepare("UPDATE order_shipping_delays SET status='refunded' ,error=NULL WHERE id=?").bind(task.id),legalNotice(`delay-refund:${o.id}`,o.buyerEmail,`Refund issued: ${o.orderNumber}`,`Your unshipped order was cancelled and fully refunded to the original payment method. Your bank controls when the credit appears. Contact ${config.supportEmail} with questions.`)]);
    } catch {
      await db.batch([db.prepare("UPDATE order_shipping_delays SET error='Refund pending; review payment provider before retrying manually' WHERE id=?").bind(task.id),legalNotice(`refund-alert:${task.id}`,config.supportEmail,"Shipping refund needs review",`Review order ${task.order_id} in /admin/compliance. The refund workflow will retry; verify the provider before issuing a separate refund.`)]);
    }
  }
  return {reviewed:due.results?.length??0};
}
