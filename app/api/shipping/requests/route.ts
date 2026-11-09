import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject,routeError } from "@/lib/http";
import { requestShippingDelay,respondToShippingDelay,cancelRefundablePreorderOrder } from "@/lib/consumer-shipping";
import { requiredString } from "@/lib/validation";
export async function POST(request:Request) {
  try {
    const account=await requireCollectorApi(request);if(account instanceof Response)return account;
    const input=await readJsonObject(request);
    if(input.action==='request')return Response.json(await requestShippingDelay(account.user.id,input));
    if(input.action==='cancel_preorder')await cancelRefundablePreorderOrder(account.user.id,requiredString(input.orderId,'order',100));
    else await respondToShippingDelay(account.user.id,input);
    return Response.json({ok:true});
  }catch(error){return routeError(error);}
}
