import { getD1 } from "@/db";
import { config } from "./config";
import type { StripeCheckoutSession } from "./stripe";
export async function guardCollectionPayment(checkoutId:string,sessionId:string,session?:StripeCheckoutSession){
  const db=getD1(),offer=await db.prepare('SELECT o.id,o.status,o.checkout_id,o.payment_deadline FROM collection_offer_checkouts c JOIN collection_offers o ON o.id=c.offer_id WHERE c.checkout_id=?').bind(checkoutId).first<{id:string;status:string;checkout_id:string|null;payment_deadline:number}>();
  if(!offer)return;if(offer.status==='completed'&&offer.checkout_id===checkoutId)return;
  const checkout=await db.prepare('SELECT status,currency,subtotal_cents,shipping_cents,stripe_checkout_session_id FROM checkout_reservations WHERE id=?').bind(checkoutId).first<{status:string;currency:string;subtotal_cents:number;shipping_cents:number;stripe_checkout_session_id:string|null}>();
  const paymentMismatch=session&&checkout&&(session.currency!==checkout.currency||(checkout.stripe_checkout_session_id&&checkout.stripe_checkout_session_id!==sessionId)||session.amount_total!==checkout.subtotal_cents+checkout.shipping_cents+(config.stripeTaxBehavior==='inclusive'?0:session.total_details?.amount_tax||0));
  if(paymentMismatch||offer.status!=='reserved'||offer.checkout_id!==checkoutId||offer.payment_deadline<=Date.now()||checkout?.status!=='pending'){
    await db.prepare('INSERT OR IGNORE INTO community_payment_exceptions (session_id,offer_id,reason,created_at) VALUES (?,?,?,?)').bind(sessionId,offer.id,'Payment arrived outside the valid exclusive reservation. Reconcile or refund before fulfillment.',Date.now()).run();
    throw new Error('Collection offer payment requires reconciliation before fulfillment.');
  }
}
