import { requireCollectorApi } from "@/lib/collector-auth";
import { collectorInbox,collectorMessageAction,threadMessages } from "@/lib/collector-messaging";
import { readJsonObject,routeError } from "@/lib/http";
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const c=await requireCollectorApi(request);if(c instanceof Response)return c;const id=new URL(request.url).searchParams.get('id');return Response.json({threads:await collectorInbox(c.user.id),messages:id?await threadMessages(c.user.id,id):[]},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{const c=await requireCollectorApi(request);if(c instanceof Response)return c;return Response.json(await collectorMessageAction(c.user.id,await readJsonObject(request)));}catch(e){return routeError(e);}}
