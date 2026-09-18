import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { preorderDepositCheckouts, preorderPaymentLedger, preorderReservations, sellers } from "@/db/schema";
import { buyerReservation, cancelPreorder, eventStatement, ownedBatch, termsOf } from "./preorders";
import { assertSellerPaymentsReady, buildPreorderDepositBody, createPreorderDepositCheckout, findPreorderDepositCheckout, retrieveChargeRefunds, retrieveCheckoutSession, retrievePromotionDispute, createSellerTransfer, findSellerTransfer, reverseSellerTransfer, type CheckoutSessionInput, type StripeCheckoutSession } from "./stripe";
import { determineMarketplaceFee } from "./fees";
import { config } from "./config";
import { ValidationError } from "./validation";
import { POLICY_VERSION } from "./legal";

const now = () => new Date().toISOString();
type DepositRequest = { input: Omit<CheckoutSessionInput,"expiresAt"> & {expiresAt:string}; body:string; taxBehavior:string };
export async function paidPreorderDeposit(reservationId:string) {
  const [row] = await getDb().select().from(preorderPaymentLedger).where(and(eq(preorderPaymentLedger.reservationId,reservationId),eq(preorderPaymentLedger.kind,"deposit"))).limit(1);
  return row;
}
export async function startPreorderDeposit(user:{id:string;email:string},id:string,accepted:unknown) {
  const r = await buyerReservation(user.id,id), terms = termsOf(r);
  if (terms.paymentModel !== "deposit_10" || accepted !== true) throw new ValidationError("Accept the 10% deposit and cancellation terms before payment.");
  if (r.status !== "hold" || r.holdExpiresAt <= now()) throw new ValidationError("This checkout hold has ended. Start a new preorder from the listing.");
  const [seller] = await getDb().select().from(sellers).where(eq(sellers.id,terms.sellerId)).limit(1);
  if (!seller?.stripeAccountId || seller.status !== "active") throw new ValidationError("This seller cannot accept payments right now.");
  await assertSellerPaymentsReady(seller.stripeAccountId,seller.storeName);
  let [saved] = await getDb().select().from(preorderDepositCheckouts).where(eq(preorderDepositCheckouts.reservationId,id)).limit(1);
  if (!saved) {
    if (Date.parse(r.holdExpiresAt)-Date.now() < 31*60000) throw new ValidationError("This hold is too close to expiry. Start a new preorder from the listing.");
    const input:CheckoutSessionInput = {reservationId:id,sellerId:seller.id,sellerStripeAccountId:seller.stripeAccountId,
      items:[{title:`10% preorder deposit: ${terms.title}`,description:terms.policyText,imageUrl:terms.imageUrl,priceCents:terms.depositUnitCents!,currency:terms.currency,quantity:r.quantity}],
      shippingCents:0,marketplaceFeeBps:determineMarketplaceFee(seller).marketplaceFeeBps,platformFeeCents:0,
      expiresAt:new Date(Math.min(Date.parse(r.holdExpiresAt),Date.now()+35*60000)),buyerUserId:user.id,buyerEmail:user.email,policyVersion:terms.policyVersion};
    const request:DepositRequest = {input:{...input,expiresAt:input.expiresAt.toISOString()},body:buildPreorderDepositBody(input).toString(),taxBehavior:config.stripeTaxBehavior};
    await getDb().insert(preorderDepositCheckouts).values({reservationId:id,request:JSON.stringify(request),createdAt:now()}).onConflictDoNothing();
    [saved] = await getDb().select().from(preorderDepositCheckouts).where(eq(preorderDepositCheckouts.reservationId,id)).limit(1);
  }
  const request:DepositRequest = JSON.parse(saved.request);
  if (saved.status !== "pending" || !["none","won","warning_closed"].includes(saved.disputeStatus)) throw new ValidationError("This deposit is being reconciled. Check My Preorders for its status.");
  if (!saved.sessionId && request.input.expiresAt <= now()) throw new ValidationError("This payment checkout has expired. Start a new preorder from the listing.");
  const session = saved.sessionId ? await retrieveCheckoutSession(saved.sessionId) : await createPreorderDepositCheckout({...request.input,expiresAt:new Date(request.input.expiresAt)},request.body);
  await getD1().prepare("UPDATE preorder_deposit_checkouts SET session_id=? WHERE reservation_id=? AND (session_id IS NULL OR session_id=?)").bind(session.id,id,session.id).run();
  if (session.payment_status === "paid") { await finalizePreorderDeposit(session); return {url:"/preorders"}; }
  if (session.status !== "open" || !session.url) throw new ValidationError("This payment checkout has ended. Start a new preorder from the listing.");
  return {url:session.url};
}

export async function finalizePreorderDeposit(session:StripeCheckoutSession) {
  const id = session.metadata?.preorder_reservation_id;
  if (!id || session.payment_status !== "paid") return;
  const [saved] = await getDb().select().from(preorderDepositCheckouts).where(eq(preorderDepositCheckouts.reservationId,id)).limit(1);
  const [r] = await getDb().select().from(preorderReservations).where(eq(preorderReservations.id,id)).limit(1);
  if (!saved || !r || (saved.sessionId && saved.sessionId !== session.id)) throw new Error("Deposit does not match a saved checkout.");
  if (await paidPreorderDeposit(id)) return;
  const request:DepositRequest = JSON.parse(saved.request), terms=termsOf(r);
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = intent?.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  if (!intent?.id || !charge?.id || !Number.isSafeInteger(session.amount_total) || !session.currency) throw new Error("Deposit payment evidence is incomplete.");
  const subtotal = terms.depositUnitCents!*r.quantity, tax=session.total_details?.amount_tax ?? 0;
  const valid = session.metadata?.purpose === "preorder_deposit" && session.metadata?.seller_id === terms.sellerId && session.metadata?.buyer_user_id === r.buyerUserId && session.metadata?.policy_version === terms.policyVersion && session.currency === terms.currency && session.amount_subtotal === subtotal && session.amount_total === subtotal+(request.taxBehavior === "inclusive" ? 0 : tax);
  const refunded = (await retrieveChargeRefunds(charge.id)).some(f => !["failed","canceled"].includes(f.status));
  const fee = typeof charge.balance_transaction === "object" && charge.balance_transaction ? charge.balance_transaction.fee : null;
  const ledger = {id:crypto.randomUUID(),reservationId:id,sessionId:session.id,paymentIntentId:intent.id,chargeId:charge.id,amountCents:session.amount_total!,currency:session.currency,kind:"deposit",subtotalCents:subtotal,taxCents:tax,processingFeeCents:fee,status:"paid",refundStatus:"not_required"};
  const db=getD1();
  if (valid && !refunded && r.status === "hold" && r.holdExpiresAt > now() && saved.disputeStatus === "none") {
    const insert=getDb().insert(preorderPaymentLedger).values(ledger).toSQL();
    try {
      await db.batch([
        db.prepare(`UPDATE preorder_reservations SET status=CASE WHEN status='hold' AND hold_expires_at>?
          AND EXISTS (SELECT 1 FROM sellers WHERE id=? AND seller_terms_version=? AND seller_terms_accepted_at IS NOT NULL)
          THEN status ELSE NULL END WHERE id=?`).bind(now(),terms.sellerId,POLICY_VERSION,id),
        db.prepare(insert.sql).bind(...insert.params),
        db.prepare("UPDATE preorder_reservations SET status='reserved',accepted_at=?,accepted_sequence=(SELECT COALESCE(MAX(accepted_sequence),0)+1 FROM preorder_reservations),actor='stripe',updated_at=? WHERE id=?").bind(now(),now(),id),
        db.prepare("UPDATE preorder_deposit_checkouts SET status='paid',session_id=?,error=NULL WHERE reservation_id=?").bind(session.id,id),
        db.prepare("UPDATE preorder_waitlist SET status='reserved' WHERE reservation_id=? AND status='invited'").bind(id),
        eventStatement({id:`deposit-paid-${id}`,reservationId:id,batchId:r.batchId,actor:"stripe",kind:"deposit_paid",recipient:r.contactEmail,detail:{message:"Your 10% deposit is paid and your preorder is confirmed. We will notify you when the remaining balance is ready to pay.",amountCents:session.amount_total,currency:terms.currency}}),
      ]);
      return;
    } catch (error) {
      if (await paidPreorderDeposit(id)) return;
      const message=String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error);
      if (!/constraint|capacity|eligibility|expired|changed/i.test(message)) throw error;
    }
  }
  const insert = getDb().insert(preorderPaymentLedger).values({...ledger,status:"recovery",refundStatus:"required"}).onConflictDoNothing().toSQL();
  await db.batch([db.prepare(insert.sql).bind(...insert.params),db.prepare("UPDATE preorder_deposit_checkouts SET status='refund_pending',session_id=? WHERE reservation_id=?").bind(session.id,id),eventStatement({id:`deposit-recovery-${id}`,reservationId:id,batchId:r.batchId,actor:"stripe",kind:"payment_recovery",recipient:r.contactEmail,detail:{message:"Your deposit could not confirm this preorder. A full refund has been requested."}})]);
  await cancelPreorder(id,"system","deposit_not_confirmed");
  const {recoverPreorderRefunds}=await import("./preorder-payments"); await recoverPreorderRefunds();
}

export async function refundPreorderDeposit(userId:string,reservationId:string,reason:string) {
  const [r]=await getDb().select().from(preorderReservations).where(eq(preorderReservations.id,reservationId)).limit(1);
  if(!r) throw new ValidationError("Preorder not found.");
  await ownedBatch(userId,r.batchId);
  if(r.orderId) throw new ValidationError("Refund the completed order from Orders so both payments are returned together.");
  await cancelPreorder(reservationId,userId,"seller_refund");
  await requestDepositRefund(reservationId,userId,reason);
  const {recoverPreorderRefunds}=await import("./preorder-payments"); await recoverPreorderRefunds();
}
export async function requestDepositRefund(id:string,actor:string,reason:string) {
  await getD1().batch([
    getD1().prepare("UPDATE preorder_payment_ledger SET status='recovery',refund_status=CASE WHEN refund_status='succeeded' THEN refund_status ELSE 'required' END,updated_at=? WHERE reservation_id=? AND kind='deposit'").bind(now(),id),
    eventStatement({id:`deposit-refund-${id}`,reservationId:id,actor,kind:"deposit_refund_requested",detail:{reason,message:"Deposit refund requested."}}),
  ]);
}

type StripeEvent={id:string;type:string;data:{object:Record<string,unknown>}};
export async function processPreorderDepositStripeEvent(event:StripeEvent) {
  const object=event.data.object;
  const metadata=object.metadata as Record<string,string>|undefined;
  if(event.type.startsWith("checkout.session.") && metadata?.purpose === "preorder_deposit") {
    const session=await retrieveCheckoutSession(String(object.id));
    if(session.payment_status === "paid") await finalizePreorderDeposit(session);
    else if(session.status === "expired" || event.type === "checkout.session.async_payment_failed") {
      await cancelPreorder(metadata.preorder_reservation_id,"stripe","deposit_checkout_expired");
      await getD1().prepare("UPDATE preorder_deposit_checkouts SET status='expired' WHERE reservation_id=? AND status='pending'").bind(metadata.preorder_reservation_id).run();
    }
    return {depositProcessed:true};
  }
  if(!/^(charge\.refunded|refund\.|charge\.dispute\.)/.test(event.type)) return null;
  const chargeId = typeof object.charge === "string" ? object.charge : event.type === "charge.refunded" ? String(object.id) : "";
  const row=await getD1().prepare("SELECT r.id,r.order_id orderId,l.kind FROM preorder_payment_ledger l JOIN preorder_reservations r ON r.id=l.reservation_id WHERE l.charge_id=? LIMIT 1").bind(chargeId).first<{id:string;orderId:string|null;kind:string}>();
  if(!row) return null;
  if(event.type.startsWith("charge.dispute.")) {
    if(row.kind === "deposit") {
      const dispute=await retrievePromotionDispute(String(object.id));
      await getD1().prepare("UPDATE preorder_deposit_checkouts SET dispute_status=? WHERE reservation_id=?").bind(dispute.status,row.id).run();
      object.status=dispute.status;
      if (!["won","prevented","warning_closed"].includes(dispute.status)) await reverseRetainedDeposit(row.id);
      if(!row.orderId) return {depositDisputeUpdated:true};
    }
    return null;
  }
  if(row.orderId) {
    const {reconcilePreorderOrderRefunds}=await import("./preorder-order-refunds");
    if(!await reconcilePreorderOrderRefunds(row.orderId)) return null;
  } else if(row.kind === "deposit") {
    const refunds=await retrieveChargeRefunds(chargeId);
    if(refunds.some(f=>!["failed","canceled"].includes(f.status))) {
      await cancelPreorder(row.id,"stripe","deposit_refunded");
      await requestDepositRefund(row.id,"stripe","Deposit refunded at payment provider");
      const {recoverPreorderRefunds}=await import("./preorder-payments"); await recoverPreorderRefunds();
    }
  }
  return {preorderRefundUpdated:true};
}

// Refunds and disputes can arrive after a cancellation deposit was paid out.
export async function reverseRetainedDeposit(reservationId:string) {
  const [checkout]=await getDb().select().from(preorderDepositCheckouts).where(eq(preorderDepositCheckouts.reservationId,reservationId)).limit(1);
  if (!checkout?.sellerTransferId || checkout.sellerTransferReversedCents >= checkout.sellerTransferAmountCents) return;
  await reverseSellerTransfer({transferId:checkout.sellerTransferId,orderId:`preorder-deposit-${reservationId}`,amountCents:checkout.sellerTransferAmountCents-checkout.sellerTransferReversedCents,targetReversedCents:checkout.sellerTransferAmountCents});
  await getD1().prepare("UPDATE preorder_deposit_checkouts SET seller_transfer_reversed_cents=seller_transfer_amount_cents WHERE reservation_id=?").bind(reservationId).run();
}

export async function recoverPreorderDeposits() {
  const pending=await getDb().select().from(preorderDepositCheckouts).where(eq(preorderDepositCheckouts.status,"pending")).limit(30);
  for(const saved of pending) {
    try {
      const request:DepositRequest=JSON.parse(saved.request);
      let session=saved.sessionId ? await retrieveCheckoutSession(saved.sessionId) : null;
      if(!session) session=await findPreorderDepositCheckout(saved.reservationId,saved.createdAt);
      if(session) {
        await getD1().prepare("UPDATE preorder_deposit_checkouts SET session_id=? WHERE reservation_id=?").bind(session.id,saved.reservationId).run();
        if(session.payment_status === "paid") await finalizePreorderDeposit(await retrieveCheckoutSession(session.id));
        else if(session.status === "expired") {
          await cancelPreorder(saved.reservationId,"system","deposit_checkout_expired");
          await getD1().prepare("UPDATE preorder_deposit_checkouts SET status='expired' WHERE reservation_id=? AND status='pending'").bind(saved.reservationId).run();
        }
      } else if(request.input.expiresAt <= now()) await getD1().prepare("UPDATE preorder_deposit_checkouts SET status='expired' WHERE reservation_id=?").bind(saved.reservationId).run();
    } catch { await getD1().prepare("UPDATE preorder_deposit_checkouts SET error='Payment reconciliation will retry' WHERE reservation_id=?").bind(saved.reservationId).run(); }
  }
}

export async function settleForfeitedPreorderDeposits() {
  const db=getD1();
  const rows=await db.prepare(`SELECT r.id,r.terms,l.charge_id chargeId,l.amount_cents amountCents,l.subtotal_cents subtotalCents,l.tax_cents taxCents,l.session_id sessionId,
    d.request,d.seller_transfer_id transferId,s.stripe_account_id accountId
    FROM preorder_reservations r JOIN preorder_payment_ledger l ON l.reservation_id=r.id AND l.kind='deposit'
    JOIN preorder_deposit_checkouts d ON d.reservation_id=r.id JOIN incoming_batches b ON b.id=r.batch_id
    JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id
    WHERE r.status IN ('cancelled','expired') AND r.reason IN ('buyer_change_of_mind','payment_deadline_expired','account_deleted')
    AND julianday(r.updated_at) < julianday('now','-7 days') AND r.order_id IS NULL AND b.supply_state != 'cancelled'
    AND l.status='paid' AND l.refund_status='not_required' AND l.refunded_cents=0 AND d.seller_transfer_id IS NULL
    AND d.dispute_status IN ('none','won','warning_closed') AND s.status='active' AND s.stripe_payouts_enabled=1 LIMIT 20`)
    .all<{id:string;terms:string;chargeId:string;amountCents:number;subtotalCents:number;taxCents:number;sessionId:string;request:string;transferId:string|null;accountId:string}>();
  for(const row of rows.results ?? []) {
    try {
      if((await retrieveChargeRefunds(row.chargeId)).some(f=>!["failed","canceled"].includes(f.status))) continue;
      const session=await retrieveCheckoutSession(row.sessionId);
      const charge=typeof session.payment_intent === "object" && session.payment_intent && typeof session.payment_intent.latest_charge === "object" ? session.payment_intent.latest_charge : null;
      if(!charge || typeof charge.balance_transaction !== "object" || !charge.balance_transaction) continue;
      const request:DepositRequest=JSON.parse(row.request),terms=termsOf(row);
      const amount=Math.max(0,row.amountCents-row.taxCents-charge.balance_transaction.fee-Math.round(row.subtotalCents*request.input.marketplaceFeeBps/10000));
      if(amount<1) continue;
      const orderId=`preorder-deposit-${row.id}`,group=`MCC_${orderId}`;
      const transfer=await findSellerTransfer(group,orderId) ?? await createSellerTransfer({orderId,orderNumber:"Retained preorder deposit",sellerId:terms.sellerId,sellerStripeAccountId:row.accountId,chargeId:row.chargeId,transferGroup:group,amountCents:amount,currency:terms.currency});
      if(transfer.amount !== amount) throw new Error("Deposit transfer does not match the recorded proceeds.");
      await db.prepare("UPDATE preorder_deposit_checkouts SET seller_transfer_id=?,seller_transfer_amount_cents=?,seller_transfer_reversed_cents=?,error=NULL WHERE reservation_id=?").bind(transfer.id,amount,transfer.amount_reversed,row.id).run();
      const current=await paidPreorderDeposit(row.id);
      const saved=await db.prepare("SELECT dispute_status status FROM preorder_deposit_checkouts WHERE reservation_id=?").bind(row.id).first<{status:string}>();
      if(current?.status !== "paid" || current.refundStatus !== "not_required" || !saved || !["none","won","warning_closed"].includes(saved.status)) await reverseRetainedDeposit(row.id);
    } catch { await db.prepare("UPDATE preorder_deposit_checkouts SET error='Deposit settlement will retry' WHERE reservation_id=?").bind(row.id).run(); }
  }
}
