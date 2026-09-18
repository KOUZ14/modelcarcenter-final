import { eq } from "drizzle-orm";
import { getDb, getD1 } from "@/db";
import { orders, preorderRefundRequests } from "@/db/schema";
import { createOrderRefund as refundCharge, retrieveChargeRefunds, reverseSellerTransfer, sellerTransferReversalTarget } from "./stripe";
import { ValidationError } from "./validation";

type Input = Parameters<typeof refundCharge>[0];
type Payment = { id:string;chargeId:string;paymentIntentId:string;amountCents:number;kind:string };
async function paymentBalances(order:typeof orders.$inferSelect) {
  const payments=await getD1().prepare(`SELECT l.id,l.charge_id chargeId,l.payment_intent_id paymentIntentId,l.amount_cents amountCents,l.kind
    FROM preorder_payment_ledger l JOIN preorder_reservations r ON r.id=l.reservation_id
    LEFT JOIN preorder_deposit_checkouts d ON d.reservation_id=r.id
    WHERE r.order_id=? AND l.charge_id IS NOT NULL AND (l.session_id=? OR l.session_id=d.session_id) ORDER BY l.kind ASC`)
    .bind(order.id,order.stripeCheckoutSessionId).all<Payment>();
  if ((payments.results ?? []).reduce((n,p)=>n+p.amountCents,0) !== order.totalCents) throw new Error("Order payment totals require reconciliation.");
  return Promise.all((payments.results ?? []).map(async p=>{
    const refunds=await retrieveChargeRefunds(p.chargeId);
    return {...p,refunds,returned:refunds.filter(f=>f.status === "succeeded").reduce((n,f)=>n+f.amount,0),pending:refunds.filter(f=>["pending","requires_action"].includes(f.status)).reduce((n,f)=>n+f.amount,0)};
  }));
}

export async function createPreorderOrderRefund(input:Input) {
  const [order]=await getDb().select().from(orders).where(eq(orders.id,input.orderId)).limit(1);
  if (!order?.preorderDepositCents) return refundCharge(input);
  const target=(input.refundedAmountCents ?? order.refundedAmountCents)+(input.amountCents ?? order.totalCents-(input.refundedAmountCents ?? order.refundedAmountCents));
  if(!Number.isSafeInteger(target)||target<1||target>order.totalCents) throw new ValidationError("Refund must fit within the order's paid total.");
  const id=`preorder-refund-${order.id}-${target}`;
  const pending=await getD1().prepare("SELECT id,target_cents target FROM preorder_refund_requests WHERE order_id=? AND status='pending' LIMIT 1").bind(order.id).first<{id:string;target:number}>();
  if(pending && pending.target !== target) throw new ValidationError("A refund is already processing. Wait for it to finish before requesting another.");
  await getDb().insert(preorderRefundRequests).values({id,orderId:order.id,targetCents:target,createdAt:new Date().toISOString()}).onConflictDoNothing();
  await processRefundRequest(id);
  const [request]=await getDb().select().from(preorderRefundRequests).where(eq(preorderRefundRequests.id,id)).limit(1);
  if (!request) throw new ValidationError("A refund is already processing. Wait for it to finish before requesting another.");
  const [fresh]=await getDb().select().from(orders).where(eq(orders.id,order.id)).limit(1);
  return {id,status:request.status,sellerTransferReversedCents:fresh.sellerTransferReversedCents};
}
export const createOrderRefund=createPreorderOrderRefund;
export const createFullRefund=createPreorderOrderRefund;

async function processRefundRequest(id:string) {
  const [request]=await getDb().select().from(preorderRefundRequests).where(eq(preorderRefundRequests.id,id)).limit(1);
  if(!request || request.status !== "pending") return;
  const [order]=await getDb().select().from(orders).where(eq(orders.id,request.orderId)).limit(1);
  try {
    const payments=await paymentBalances(order);
    let required=request.targetCents-payments.reduce((n,p)=>n+p.returned+p.pending,0);
    for(const p of payments) {
      if(required<=0) break;
      const amount=Math.min(required,p.amountCents-p.returned-p.pending);
      if(amount<=0) continue;
      const result=await refundCharge({orderId:`${id}-${p.id}`,paymentIntentId:p.paymentIntentId,chargeId:p.chargeId,amountCents:amount,totalCents:p.amountCents,refundedAmountCents:p.returned+p.pending,paymentFlow:"separate"});
      if(["failed","canceled"].includes(result.status)) {
        await getD1().prepare("UPDATE preorder_refund_requests SET status='failed',error='The payment provider rejected a refund; review required' WHERE id=?").bind(id).run();
        break;
      }
      required-=amount;
    }
    await reconcilePreorderOrderRefunds(order.id);
  } catch {
    await getD1().prepare("UPDATE preorder_refund_requests SET error='Refund reconciliation will retry' WHERE id=?").bind(id).run();
  }
}

export async function reconcilePreorderOrderRefunds(orderId:string) {
  const [order]=await getDb().select().from(orders).where(eq(orders.id,orderId)).limit(1);
  if(!order?.preorderDepositCents) return false;
  const payments=await paymentBalances(order),returned=payments.reduce((n,p)=>n+p.returned,0);
  let reversed=order.sellerTransferReversedCents;
  if(order.stripeTransferId) {
    const target=sellerTransferReversalTarget({totalCents:order.totalCents,refundedAmountCents:returned,sellerTransferAmountCents:order.sellerTransferAmountCents,sellerProceedsCents:order.sellerProceedsCents ?? order.sellerTransferAmountCents});
    if(target>reversed) {
      await reverseSellerTransfer({transferId:order.stripeTransferId,orderId,amountCents:target-reversed,targetReversedCents:target});
      reversed=target;
    }
  }
  const db=getD1();
  const statements=payments.map(p=>db.prepare(`UPDATE preorder_payment_ledger SET refunded_cents=?,refund_status=CASE
    WHEN ?>=amount_cents THEN 'succeeded' WHEN ?>0 THEN 'pending' WHEN status='recovery' THEN 'required' ELSE 'not_required' END,updated_at=? WHERE id=?`)
    .bind(p.returned,p.returned,p.pending,new Date().toISOString(),p.id));
  for (const p of payments) for (const refund of p.refunds) {
    if (!["failed","canceled"].includes(refund.status)) continue;
    statements.push(db.prepare("UPDATE preorder_refund_requests SET status='failed',error='The payment provider rejected a refund; review required' WHERE order_id=? AND status='pending' AND ?=id || '-' || ?")
      .bind(orderId,refund.metadata?.order_id ?? "",p.id));
  }
  statements.push(db.prepare(`UPDATE orders SET refunded_amount_cents=?,payment_status=CASE WHEN ?>=total_cents THEN 'refunded'
    WHEN payment_status='disputed' THEN payment_status WHEN ?>0 THEN 'partially_refunded' ELSE 'paid' END,
    seller_transfer_reversed_cents=MAX(seller_transfer_reversed_cents,?),seller_transfer_status=CASE
    WHEN stripe_transfer_id IS NULL AND ?>=total_cents THEN 'cancelled'
    WHEN stripe_transfer_id IS NOT NULL AND ?>=seller_transfer_amount_cents THEN 'reversed' ELSE seller_transfer_status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(returned,returned,returned,reversed,returned,reversed,orderId));
  statements.push(db.prepare("UPDATE preorder_refund_requests SET status='succeeded',error=NULL WHERE order_id=? AND target_cents<=?").bind(orderId,returned));
  statements.push(db.prepare("UPDATE resolution_refunds SET status=(SELECT status FROM preorder_refund_requests WHERE id=stripe_refund_id) WHERE stripe_refund_id IN (SELECT id FROM preorder_refund_requests WHERE order_id=?)").bind(orderId));
  statements.push(db.prepare(`UPDATE resolution_cases SET status='resolved',resolved_at=COALESCE(resolved_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE status='under_review' AND id IN (SELECT case_id FROM resolution_refunds WHERE status='succeeded'
      AND stripe_refund_id IN (SELECT id FROM preorder_refund_requests WHERE order_id=? AND status='succeeded'))`).bind(orderId));
  await db.batch(statements);
  return true;
}

export async function recoverPreorderOrderRefunds() {
  const rows=await getD1().prepare("SELECT id FROM preorder_refund_requests WHERE status='pending' ORDER BY created_at LIMIT 30").all<{id:string}>();
  for(const row of rows.results ?? []) await processRefundRequest(row.id);
}
