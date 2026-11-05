import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { getCurrentCollector } from "@/lib/collector-auth";
import { getAdminIdentity } from "@/lib/admin-auth";
import { purchaseEvidenceForOrder } from "@/lib/purchase-evidence";
import { routeError } from "@/lib/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const query=new URL(request.url).searchParams,id=query.get('order')??'',user=await getCurrentCollector(request.headers);
    const owned=user&&await getD1().prepare("SELECT 1 FROM orders o JOIN sellers s ON s.id=o.seller_id WHERE o.id=? AND (o.buyer_user_id=? OR s.owner_user_id=?)").bind(id,user.user.id,user.user.id).first();
    if(!owned&&!await getAdminIdentity())return Response.json({error:'Order access required.'},{status:403});
    const evidence=await purchaseEvidenceForOrder(id),key=query.get('file');
    if(key) {
      const allowed=await getD1().prepare(`SELECT 1 FROM purchase_evidence_media m JOIN purchase_evidence e ON e.id=m.evidence_id
        WHERE m.storage_key=? AND (e.checkout_id=(SELECT checkout_reservation_id FROM orders WHERE id=?) OR e.preorder_id IN (SELECT id FROM preorder_reservations WHERE order_id=?)) LIMIT 1`).bind(key,id,id).first();
      if(!allowed)return new Response('Not found',{status:404});
      const object=await env.IMAGES.get(key);if(!object)return new Response('Not found',{status:404});
      return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    return Response.json({evidence,note:evidence.length?'Captured when checkout or the preorder reservation was created. External image URLs are references, not archived files.':'No checkout-time detailed snapshot exists for this historical order.'},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return routeError(error);}
}
