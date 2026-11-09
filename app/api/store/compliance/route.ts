import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject,routeError } from "@/lib/http";
import { certifySeller } from "@/lib/seller-compliance";
export async function POST(request:Request) {
  try{const account=await requireCollectorApi(request);if(account instanceof Response)return account;await certifySeller(account.user.id,await readJsonObject(request));return Response.json({ok:true});}catch(error){return routeError(error);}
}
