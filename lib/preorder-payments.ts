import { and, eq, inArray } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { incomingBatches, orders, preorderCheckouts, preorderPaymentLedger, preorderReservations } from "@/db/schema";
import { buyerReservation, eventStatement, termsOf } from "./preorders";
import { buildCartReservation, loadAuthoritativeCartItems, sellerCartFromRows, attachStripeSession, releaseReservation } from "./inventory";
import { assertSellerPaymentsReady, createCheckoutSession, createOrderRefund, expireCheckoutSession, retrieveCheckoutSession, retrieveChargeRefunds, retrieveRefund, type StripeCheckoutSession } from "./stripe";
import { resolveCheckoutShipping, quoteCheckoutShipping } from "./checkout-shipping";
import { calculateServerTotals } from "./business";
import { parseCheckoutShippingAddress } from "./shipping-rules";
import { POLICY_VERSION } from "./legal";
import { ValidationError } from "./validation";
import { config } from "./config";
import { sendPaidOrderEmails } from "./email";
import type { preparePaidOrder } from "./orders";

const now = () => new Date().toISOString();
export async function preorderPaymentCart(userId: string, id: string) {
  const r = await buyerReservation(userId,id), terms = termsOf(r);
  const [batch] = await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,r.batchId)).limit(1);
  if (r.status !== "awaiting_payment" || r.allocatedQuantity !== r.quantity || r.consentState !== "accepted" || !r.paymentDeadline || r.paymentDeadline <= now() || r.acceptedRevision !== batch.revision || batch.supplyState === "cancelled" || !batch.dispatchEnd || batch.dispatchEnd <= now()) throw new ValidationError("Payment is not available. Review your allocation, deadline and any required consent in My Preorders.");
  const rows = await loadAuthoritativeCartItems([{productId:terms.listingId,quantity:r.allocatedQuantity}],true);
  const cart = sellerCartFromRows(rows.map(row=>({...row,priceCents:terms.priceCents,currency:terms.currency,title:terms.title,description:`${terms.variant}. ${terms.contents}`,scale:terms.scale,manufacturer:terms.manufacturer,sellerSku:terms.sellerSku,imageUrl:terms.imageUrl,releaseDate:null})));
  return { r,cart,terms };
}
export async function preorderShippingQuote(user:{id:string;email:string}, id:string, destination:unknown) {
  const {cart} = await preorderPaymentCart(user.id,id);
  return quoteCheckoutShipping(cart,destination,user.id,user.email);
}
export async function closePreorderPayment(userId:string,id:string) {
  const r=await buyerReservation(userId,id);
  if (!r.checkoutReservationId) return;
  const row=await getD1().prepare("SELECT stripe_checkout_session_id sessionId FROM checkout_reservations WHERE id=?").bind(r.checkoutReservationId).first<{sessionId:string|null}>();
  if (row?.sessionId) {
    const session=await retrieveCheckoutSession(row.sessionId);
    if(session.payment_status==='paid') throw new ValidationError("This payment is being reconciled; please wait for the order update.");
    if(session.status==='open') await expireCheckoutSession(session.id);
  }
  await releaseReservation(r.checkoutReservationId);
}
export async function startPreorderPayment(user:{id:string;email:string}, id:string, input:Record<string,unknown>) {
  const {r,cart:loaded,terms} = await preorderPaymentCart(user.id,id);
  if (input.acceptedFinalQuote !== true || input.policyVersion !== POLICY_VERSION) throw new ValidationError("Accept the final shipping quote and current checkout policies. Tax and the final total are accepted on the payment page.");
  if (r.checkoutReservationId) {
    const existing = await getD1().prepare("SELECT stripe_checkout_session_id sessionId FROM checkout_reservations WHERE id=? AND status='pending'").bind(r.checkoutReservationId).first<{sessionId:string|null}>();
    if (existing?.sessionId) {
      const session = await retrieveCheckoutSession(existing.sessionId);
      if (session.status === "open" && session.url) return {url:session.url,reservationId:r.checkoutReservationId,sessionId:session.id,returnToken:session.metadata?.return_token};
      if (session.payment_status === "paid") throw new ValidationError("Payment is being reconciled. Your reservation will update shortly.");
      await releaseReservation(r.checkoutReservationId);
    } else throw new ValidationError("Payment checkout is being prepared. Please try again shortly.");
  }
  // Stripe requires at least 30 minutes for a Checkout Session. Never extend the
  // disclosed allocation deadline to satisfy that provider constraint.
  if (Date.parse(r.paymentDeadline!)-Date.now()<31*60000) throw new ValidationError("The payment window is closing. Contact support; a new checkout cannot extend this allocation.");
  await assertSellerPaymentsReady(loaded.seller.sellerStripeAccountId!,loaded.seller.sellerName);
  const shipping = await resolveCheckoutShipping(loaded,input.shippingSelection,user.id,input.destination);
  if (Number(input.shippingCents) !== shipping.amountCents) throw new ValidationError("The shipping amount changed. Calculate and accept a fresh quote.");
  const cart = {...loaded,totals:calculateServerTotals(loaded.items,shipping.amountCents,loaded.fee.marketplaceFeeBps)};
  const expires = new Date(Math.min(Date.now()+config.checkoutExpirationMinutes*60000,Date.parse(r.paymentDeadline!)));
  const checkout = buildCartReservation(cart,user.id,POLICY_VERSION,shipping,null,expires,true);
  const db = getD1();
  await db.batch([
    ...checkout.statements,
    db.prepare(`UPDATE preorder_reservations SET checkout_reservation_id=?,actor=?,status=CASE WHEN status='awaiting_payment'
      AND consent_state='accepted' AND checkout_reservation_id IS NULL AND payment_deadline > ?
      AND accepted_revision=(SELECT revision FROM incoming_batches WHERE id=batch_id) THEN status ELSE NULL END WHERE id=?`)
      .bind(checkout.reservationId,user.id,now(),id),
    db.prepare("INSERT INTO preorder_checkouts (checkout_id,reservation_id,accepted_quote) VALUES (?,?,?)").bind(checkout.reservationId,id,JSON.stringify({shipping,quantity:r.quantity,priceCents:terms.priceCents,handlingDays:terms.handlingDays,policyVersion:POLICY_VERSION,acceptedAt:now(),taxBehavior:config.stripeTaxBehavior,tax:"Final tax and total accepted in Stripe Checkout"})),
  ]);
  let sessionId:string|null=null;
  try {
    const returnToken = crypto.randomUUID();
    const session = await createCheckoutSession({reservationId:checkout.reservationId,sellerId:cart.seller.sellerId,sellerStripeAccountId:cart.seller.sellerStripeAccountId!,items:cart.items,
      shippingCents:shipping.amountCents,marketplaceFeeBps:cart.fee.marketplaceFeeBps,platformFeeCents:cart.totals.platformFeeCents,expiresAt:expires,buyerUserId:user.id,buyerEmail:user.email,policyVersion:POLICY_VERSION,deliveryAddress:parseCheckoutShippingAddress(JSON.parse(shipping.quotedAddress!)),returnToken});
    sessionId=session.id;
    if (!session.url) throw new Error("Payment provider did not return a checkout URL.");
    await attachStripeSession(checkout.reservationId,session.id);
    return {url:session.url,reservationId:checkout.reservationId,sessionId:session.id,returnToken};
  } catch (error) {
    const closed = !sessionId || await expireCheckoutSession(sessionId).then(()=>true).catch(()=>false);
    if (closed) await releaseReservation(checkout.reservationId);
    throw error;
  }
}

export async function preorderForCheckout(checkoutId:string) {
  const [row] = await getDb().select({reservation:preorderReservations,checkout:preorderCheckouts,batch:incomingBatches}).from(preorderCheckouts)
    .innerJoin(preorderReservations,eq(preorderReservations.id,preorderCheckouts.reservationId)).innerJoin(incomingBatches,eq(incomingBatches.id,preorderReservations.batchId))
    .where(eq(preorderCheckouts.checkoutId,checkoutId)).limit(1);
  return row;
}
function payable(row:NonNullable<Awaited<ReturnType<typeof preorderForCheckout>>>) {
  const r=row.reservation;
  return r.status === "awaiting_payment" && r.consentState === "accepted" && r.allocatedQuantity === r.quantity && r.paymentDeadline! > now()
    && r.checkoutReservationId === row.checkout.checkoutId && r.acceptedRevision === row.batch.revision && row.batch.supplyState !== "cancelled" && row.batch.dispatchEnd! > now();
}
function paymentRefs(session:StripeCheckoutSession) {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const charge = typeof session.payment_intent === "object" && session.payment_intent ? (typeof session.payment_intent.latest_charge === "string" ? session.payment_intent.latest_charge : session.payment_intent.latest_charge?.id) : null;
  if (!intent || !Number.isSafeInteger(session.amount_total) || session.amount_total! < 0 || !session.currency) throw new Error("Paid preorder has incomplete payment evidence.");
  return {intent,charge:charge??null,amount:session.amount_total!,currency:session.currency};
}
export async function finalizePreorderPayment(event:{id:string;type:string}, session:StripeCheckoutSession, plan:typeof preparePaidOrder) {
  const row = await preorderForCheckout(session.metadata!.reservation_id);
  if (!row) throw new Error("Preorder checkout record is missing.");
  const {reservation:r,checkout} = row, refs=paymentRefs(session), db=getD1();
  const recorded = await getDb().select().from(preorderPaymentLedger).where(eq(preorderPaymentLedger.sessionId,session.id)).limit(1);
  if (recorded[0]) { await recoverPreorderRefunds(); await db.prepare("INSERT OR IGNORE INTO stripe_events (id,type) VALUES (?,?)").bind(event.id,event.type).run(); return {duplicateOrder:true}; }
  const cr = await db.prepare("SELECT stripe_checkout_session_id sessionId,subtotal_cents subtotal,shipping_cents shipping FROM checkout_reservations WHERE id=?").bind(checkout.checkoutId).first<{sessionId:string|null;subtotal:number;shipping:number}>();
  if (!cr || (cr.sessionId && cr.sessionId !== session.id) || session.currency !== termsOf(r).currency) throw new Error("Preorder payment does not match the checkout.");
  const quote=JSON.parse(checkout.acceptedQuote);
  const expectedTotal=cr.subtotal+cr.shipping+(quote.taxBehavior==="inclusive"?0:session.total_details?.amount_tax??0);
  if(refs.amount!==expectedTotal) return recordRecovery(event,session,r.id);
  if (!payable(row)) return recordRecovery(event,session,r.id);
  const planned = await plan(session,checkout.checkoutId);
  try {
    await db.batch([
      db.prepare(`UPDATE preorder_reservations SET status=CASE WHEN status='awaiting_payment' AND consent_state='accepted'
        AND allocated_quantity=quantity AND payment_deadline > ? AND checkout_reservation_id=?
        AND accepted_revision=(SELECT revision FROM incoming_batches WHERE id=batch_id)
        AND EXISTS (SELECT 1 FROM incoming_batches b WHERE b.id=batch_id AND b.supply_state != 'cancelled' AND b.dispatch_end > ?)
        THEN status ELSE NULL END WHERE id=?`).bind(now(),checkout.checkoutId,now(),r.id),
      ...planned.statements,
      db.prepare("UPDATE preorder_reservations SET status='converted',order_id=?,actor='stripe',updated_at=? WHERE id=?").bind(planned.orderId,now(),r.id),
      db.prepare("INSERT INTO preorder_payment_ledger (id,reservation_id,session_id,payment_intent_id,charge_id,amount_cents,currency,status) VALUES (?,?,?,?,?,?,?,'paid')").bind(crypto.randomUUID(),r.id,session.id,refs.intent,refs.charge,refs.amount,refs.currency),
      db.prepare("INSERT INTO stripe_events (id,type) VALUES (?,?)").bind(event.id,event.type),
    ]);
  } catch (error) {
    const fresh=await preorderForCheckout(checkout.checkoutId);
    if (fresh?.reservation.status === "converted" && fresh.reservation.checkoutReservationId === checkout.checkoutId) return {duplicateOrder:true};
    if (fresh && !payable(fresh)) return recordRecovery(event,session,r.id);
    throw error;
  }
  await sendPaidOrderEmails(planned.email);
  return {orderId:planned.orderId,orderNumber:planned.orderNumber};
}
async function recordRecovery(event:{id:string;type:string},session:StripeCheckoutSession,reservationId:string) {
  const refs=paymentRefs(session),db=getD1();
  const r=await db.prepare("SELECT contact_email email FROM preorder_reservations WHERE id=?").bind(reservationId).first<{email:string}>();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO preorder_payment_ledger (id,reservation_id,session_id,payment_intent_id,charge_id,amount_cents,currency,status,refund_status) VALUES (?,?,?,?,?,?,?,'recovery','required')").bind(crypto.randomUUID(),reservationId,session.id,refs.intent,refs.charge,refs.amount,refs.currency),
    db.prepare("INSERT OR IGNORE INTO stripe_events (id,type) VALUES (?,?)").bind(event.id,event.type),
    eventStatement({id:`recovery-${session.id}`,reservationId,actor:"stripe",kind:"payment_recovery",recipient:r?.email,detail:{message:"Payment could not be applied to the accepted allocation and total. No new stock promise was made. A full refund has been requested.",amountCents:refs.amount,currency:refs.currency}}),
  ]);
  await recoverPreorderRefunds();
  return {refundRequired:true};
}
export async function cancelPaidPreorders(batchId:string,actor:string,reason:string) {
  await getD1().batch([
    getD1().prepare(`UPDATE preorder_payment_ledger SET status='recovery',refund_status='required',updated_at=? WHERE reservation_id IN (
      SELECT r.id FROM preorder_reservations r JOIN orders o ON o.id=r.order_id WHERE r.batch_id=? AND o.fulfillment_status IN ('unfulfilled','processing') AND o.payment_status IN ('paid','partially_refunded')) AND refund_status='not_required'`).bind(now(),batchId),
    getD1().prepare(`UPDATE orders SET fulfillment_status='cancelled',seller_transfer_status=CASE WHEN stripe_transfer_id IS NULL THEN 'cancelled' ELSE seller_transfer_status END,updated_at=?
      WHERE id IN (SELECT order_id FROM preorder_reservations WHERE batch_id=?) AND fulfillment_status IN ('unfulfilled','processing')`).bind(now(),batchId),
    eventStatement({batchId,actor,kind:"paid_cancellation",detail:{reason,message:"Unshipped orders cancelled; refunds tracked separately. Shipped orders use the Resolution Center."}}),
  ]);
  await recoverPreorderRefunds();
}
export async function recoverPreorderRefunds() {
  const rows = await getDb().select({ledger:preorderPaymentLedger,r:preorderReservations}).from(preorderPaymentLedger).innerJoin(preorderReservations,eq(preorderReservations.id,preorderPaymentLedger.reservationId))
    .where(and(eq(preorderPaymentLedger.status,"recovery"),inArray(preorderPaymentLedger.refundStatus,["required","pending","requires_action"]))).limit(20);
  for (const {ledger:l,r} of rows) {
    try {
      if (!l.chargeId) {
        const refs=paymentRefs(await retrieveCheckoutSession(l.sessionId));
        if (!refs.charge) throw new Error("Charge evidence is not available yet.");
        await getD1().prepare("UPDATE preorder_payment_ledger SET charge_id=? WHERE id=?").bind(refs.charge,l.id).run();
        l.chargeId=refs.charge;
      }
      const balance=await reconcilePreorderRefund(l,r);
      if (balance.status!=="required") continue;
      const [order] = r.orderId ? await getDb().select().from(orders).where(eq(orders.id,r.orderId)).limit(1) : [];
      const matchesOrder=order?.stripeCheckoutSessionId===l.sessionId;
      const refund=await createOrderRefund({orderId:matchesOrder?order.id:`preorder-${l.sessionId}`,paymentIntentId:l.paymentIntentId,chargeId:l.chargeId,paymentFlow:"separate",totalCents:matchesOrder?order.totalCents:l.amountCents,
        refundedAmountCents:balance.refundedCents,stripeTransferId:matchesOrder?order.stripeTransferId:null,sellerTransferAmountCents:matchesOrder?order.sellerTransferAmountCents:0,sellerTransferReversedCents:matchesOrder?order.sellerTransferReversedCents:0,sellerProceedsCents:matchesOrder?order.sellerProceedsCents:null});
      await getD1().prepare("UPDATE preorder_payment_ledger SET refund_id=?,refund_status=?,error=NULL,updated_at=? WHERE id=?").bind(refund.id,refund.status==="succeeded"?"required":refund.status,now(),l.id).run();
      // A concurrent partial refund can own the shared idempotency key. Its
      // success is not evidence that the entire cancellation was refunded.
      await reconcilePreorderRefund({...l,refundId:refund.id},r);
    } catch {
      await getD1().prepare("UPDATE preorder_payment_ledger SET error='Refund submission or transfer recovery needs retry',updated_at=? WHERE id=?").bind(now(),l.id).run();
    }
  }
}

async function reconcilePreorderRefund(l:typeof preorderPaymentLedger.$inferSelect,r:typeof preorderReservations.$inferSelect) {
  if (!l.chargeId) throw new Error("Refund charge needs payment reconciliation.");
  const refunds=await retrieveChargeRefunds(l.chargeId);
  const refundedCents=refunds.filter(f=>f.status==="succeeded").reduce((sum,f)=>sum+f.amount,0);
  const pendingCents=refunds.filter(f=>f.status==="pending"||f.status==="requires_action").reduce((sum,f)=>sum+f.amount,0);
  const last=refunds.find(f=>f.id===l.refundId);
  const failed=last?.status==="failed"||last?.status==="canceled";
  const status=refundedCents>=l.amountCents?"succeeded":pendingCents>0?"pending":failed?last.status:"required";
  const error=failed?"Refund failed or was cancelled at the provider; operations review required":null;
  await getD1().batch([
    getD1().prepare("UPDATE preorder_payment_ledger SET refund_status=?,error=?,updated_at=? WHERE id=? AND (refund_status!='succeeded' OR ?='succeeded')").bind(status,error,now(),l.id,status),
    eventStatement({id:`refund-balance-${l.id}-${status}-${refundedCents}-${pendingCents}`,reservationId:r.id,batchId:r.batchId,actor:"system",kind:"refund_update",recipient:r.contactEmail,
      detail:{status,amountCents:l.amountCents,refundedCents,pendingCents,outstandingCents:Math.max(0,l.amountCents-refundedCents),currency:l.currency,message:status==="required"?"A refund balance remains due and will be retried.":undefined}}),
  ]);
  return {status,refundedCents};
}
export async function syncPreorderRefund(refund:{id?:string;status?:string;failure_reason?:string}) {
  if (!refund.id) return;
  const [ledger]=await getDb().select().from(preorderPaymentLedger).where(eq(preorderPaymentLedger.refundId,refund.id)).limit(1);
  if(!ledger)return;
  // Re-read the provider's current state so delayed webhook delivery cannot turn
  // a failed refund into completed or overwrite a later state with stale data.
  await retrieveRefund(refund.id);
  const [r]=await getDb().select().from(preorderReservations).where(eq(preorderReservations.id,ledger.reservationId)).limit(1);
  await reconcilePreorderRefund(ledger,r);
}
