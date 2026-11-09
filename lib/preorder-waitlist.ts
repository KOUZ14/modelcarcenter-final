import { getD1 } from "@/db";
import { ownedBatch, publicPreorderOffers, holdPreorder, eventStatement, cancelPreorder, termsOf } from "./preorders";
import { whole } from "./preorder-rules";
import { ValidationError } from "./validation";

export async function joinPreorderWaitlist(user:{id:string;email:string},batchId:string,quantity:unknown) {
  const db=getD1();
  const batch=await db.prepare("SELECT b.listing_id listingId,s.owner_user_id ownerId FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id WHERE b.id=? AND b.supply_state != 'cancelled'").bind(batchId).first<{listingId:string;ownerId:string}>();
  if(!batch || batch.ownerId===user.id || !(await publicPreorderOffers(batch.listingId)).length)throw new ValidationError("This seller waitlist is not available.");
  await db.prepare(`INSERT INTO preorder_waitlist (id,batch_id,buyer_user_id,contact_email,quantity)
    SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM preorder_waitlist WHERE batch_id=? AND buyer_user_id=? AND status IN ('waiting','invited'))`)
    .bind(crypto.randomUUID(),batchId,user.id,user.email,whole(quantity,"waitlist quantity",1,10),batchId,user.id).run();
  return {joined:true};
}
export async function buyerWaitlist(userId:string) {
  return (await getD1().prepare(`SELECT w.id,w.quantity,w.status,w.reservation_id reservationId,p.title,s.store_name sellerName
    FROM preorder_waitlist w JOIN incoming_batches b ON b.id=w.batch_id JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id
    WHERE w.buyer_user_id=? ORDER BY w.sequence`).bind(userId).all<{id:string;quantity:number;status:string;reservationId:string|null;title:string;sellerName:string}>()).results??[];
}
export async function cancelWaitlist(userId:string,id:string) {
  const db=getD1(), row=await db.prepare("SELECT reservation_id reservationId FROM preorder_waitlist WHERE id=? AND buyer_user_id=? AND status IN ('waiting','invited')").bind(id,userId).first<{reservationId:string|null}>();
  if(row?.reservationId)await cancelPreorder(row.reservationId,userId,"waitlist_declined");
  await db.prepare("UPDATE preorder_waitlist SET status='cancelled' WHERE id=? AND buyer_user_id=? AND status IN ('waiting','invited')").bind(id,userId).run();
}
export async function inviteNextWaitlisted(userId:string,batchId:string) {
  const {batch}=await ownedBatch(userId,batchId),db=getD1();
  const next=await db.prepare("SELECT id,buyer_user_id buyerId,contact_email email,quantity FROM preorder_waitlist WHERE batch_id=? AND status='waiting' ORDER BY sequence LIMIT 1").bind(batchId).first<{id:string;buyerId:string;email:string;quantity:number}>();
  if(!next)throw new ValidationError("No buyers are waiting for this batch.");
  const hold=await holdPreorder({id:next.buyerId,email:next.email},{batchId,quantity:next.quantity,revision:batch.revision,idempotencyKey:`waitlist-${next.id}`},48*60);
  await db.batch([
    db.prepare("UPDATE preorder_waitlist SET status='invited',reservation_id=? WHERE id=? AND status='waiting'").bind(hold.id,next.id),
    eventStatement({id:`waitlist-invite-${next.id}`,batchId,reservationId:hold.id,actor:userId,kind:"waitlist_invitation",recipient:next.email,detail:{message:termsOf(hold).paymentModel === "deposit_10" ? "A preorder slot is held for 48 hours. Review the price and cancellation terms in My Orders and pay the 10% deposit to confirm. The slot is released if checkout expires or no deposit is paid." : "A reservation slot is held for 48 hours. Review the current seller, product, full price and terms in My Orders and explicitly accept to reserve. No payment is charged. Without acceptance this invitation expires.",responseDeadline:hold.holdExpiresAt}}),
  ]);
  return {invited:true};
}
