import { previewPreorderMaintenance } from "@/lib/preorder-preview";
import { requireCollectorApi } from "@/lib/collector-auth";
import { requireAdminApi } from "@/lib/admin-auth";
import { readJsonObject, routeError } from "@/lib/http";
import { buyerPreorders, sellerPreorders, publicPreorderOffers, holdPreorder, confirmPreorder, updateBuyerPreorder, createIncomingBatch, changeBatch, adminPreorderAction, preorderOperations, eventStatement } from "@/lib/preorders";
import { preorderShippingQuote, startPreorderPayment, closePreorderPayment } from "@/lib/preorder-payments";
import { getD1 } from "@/db";
import { required } from "@/lib/preorder-rules";
import { requireAdultConsent } from "@/lib/form-consent";
import { checkoutReturnCookie } from "@/lib/checkout-return";
import { deliverPreorderNotices, processPreorders } from "@/lib/preorder-maintenance";
import { joinPreorderWaitlist, buyerWaitlist, cancelWaitlist, inviteNextWaitlisted } from "@/lib/preorder-waitlist";
import { startPreorderDeposit, refundPreorderDeposit } from "@/lib/preorder-deposits";

export const dynamic = "force-dynamic";
export async function GET(request:Request) {
  try {
    const query=new URL(request.url).searchParams;
    if (query.has("listingId")) return Response.json({offers:await publicPreorderOffers(required(query.get("listingId"),"listing",100))});
    if (query.get("view")==="admin") {
      const admin=await requireAdminApi(); if(admin instanceof Response) return admin;
      const db=getD1();
      const [batches,policies,access,exceptions,notices,sellerOptions]=await Promise.all([
        db.prepare("SELECT b.*,p.title,s.store_name FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id ORDER BY b.created_at DESC LIMIT 200").all(),
        db.prepare("SELECT * FROM preorder_policies").all(),db.prepare("SELECT * FROM preorder_seller_access").all(),
        db.prepare(`SELECT id,reservation_id,refund_status,error FROM preorder_payment_ledger WHERE status='recovery' AND refund_status!='succeeded'
          UNION ALL SELECT id,order_id AS reservation_id,status AS refund_status,error FROM preorder_refund_requests WHERE status!='succeeded' LIMIT 100`).all(),
        db.prepare("SELECT id,kind,delivery_status,attempts,created_at FROM preorder_events WHERE recipient IS NOT NULL AND delivery_status != 'sent' ORDER BY created_at LIMIT 100").all(),
        db.prepare("SELECT id,store_name,status FROM sellers WHERE seller_type='professional' ORDER BY store_name").all(),
      ]);
      return Response.json({maintenance:await previewPreorderMaintenance(),batches:batches.results,policies:policies.results,access:access.results,exceptions:exceptions.results,notices:notices.results,sellers:sellerOptions.results,...await preorderOperations()});
    }
    const account=await requireCollectorApi(request); if(account instanceof Response) return account;
    return Response.json(query.get("view")==="seller"?await sellerPreorders(account.user.id):{reservations:await buyerPreorders(account.user.id),waitlist:await buyerWaitlist(account.user.id)});
  } catch(error) { return routeError(error,"Preorders could not be loaded."); }
}
export async function POST(request:Request) {
  try {
    const input=await readJsonObject(request),action=String(input.action??"");
    if(input.view==="admin") {
      const admin=await requireAdminApi(); if(admin instanceof Response) return admin;
      if(action==="maintenance") {
        const reason=required(input.reason,"maintenance reason");
        await eventStatement({actor:admin.email,kind:"maintenance_requested",detail:{reason}}).run();
        try {
          const result = await processPreorders(admin.email);
          return Response.json({ok:true,result});
        } catch (error) {
          await eventStatement({actor:admin.email,kind:"maintenance_failed",detail:{reason,error:error instanceof Error ? error.message : "Maintenance failed"}}).run();
          throw error;
        }
      }
      else await adminPreorderAction(admin.email,input);
      return Response.json({ok:true});
    }
    const account=await requireCollectorApi(request); if(account instanceof Response) return account;
    const user=account.user;
    let result:unknown={ok:true};
    if(action==="create_batch") result=await createIncomingBatch(user.id,input);
    else if(action==="refund_deposit" && input.view==="seller") await refundPreorderDeposit(user.id,required(input.id,"preorder",100),required(input.reason,"refund reason"));
    else if(action==="invite_next" && input.view==="seller") result=await inviteNextWaitlisted(user.id,required(input.batchId,"batch",100));
    else if(input.view==="seller") await changeBatch(user.id,required(input.batchId,"batch",100),input);
    else if(action==="waitlist") { requireAdultConsent(input.adultConsent); result=await joinPreorderWaitlist(user,required(input.batchId,"batch",100),input.quantity); }
    else if(action==="cancel_waitlist") await cancelWaitlist(user.id,required(input.id,"waitlist ID",100));
    else if(action==="hold") { requireAdultConsent(input.adultConsent); result=await holdPreorder(user,input); }
    else if(action==="confirm") result=await confirmPreorder(user.id,required(input.id,"reservation",100),input.acceptedTerms);
    else if(action==="deposit") { requireAdultConsent(input.adultConsent); result=await startPreorderDeposit(user,required(input.id,"reservation",100),input.acceptedTerms); }
    else if(action==="close_checkout") await closePreorderPayment(user.id,required(input.id,"reservation",100));
    else if(action==="quote") result=await preorderShippingQuote(user,required(input.id,"reservation",100),input.destination);
    else if(action==="pay") {
      requireAdultConsent(input.adultConsent);
      const checkout=await startPreorderPayment(user,required(input.id,"reservation",100),input);
      return Response.json({url:checkout.url},{headers:{"Set-Cookie":checkoutReturnCookie(checkout.reservationId,checkout.sessionId,checkout.returnToken)}});
    } else await updateBuyerPreorder(user.id,required(input.id,"reservation",100),input);
    await deliverPreorderNotices(3);
    return Response.json(result);
  } catch(error) {
    const message=error instanceof Error?`${error.message} ${error.cause??""}`:"";
    if(/Preorder capacity|Reservation hold expired|queue priority changed|preorder_reservations.status|incoming_batches.revision/.test(message)) return Response.json({error:"The allocation, deadline or accepted terms changed. Refresh and review the current offer."},{status:409});
    return routeError(error,"The preorder could not be updated. Refresh the offer and try again.");
  }
}
