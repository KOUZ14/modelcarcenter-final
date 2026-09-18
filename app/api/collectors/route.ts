import { getCurrentCollector, requireCollectorApi } from "@/lib/collector-auth";
import { communityAction, collectors, comments, feed, getCollection, getPiece, getShelves, one, rows, searchCommunity, settings } from "@/lib/community";
import { readJsonObject, routeError } from "@/lib/http";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
export async function GET(request:Request){try{
  const c=await getCurrentCollector(request.headers),user=c?.user.id??null,q=new URL(request.url).searchParams,view=q.get('view');
  if(view==='feed')return Response.json({posts:await feed(user,{tab:q.get('tab')||undefined,topic:q.get('topic')||undefined,limit:Number(q.get('limit'))||20,before:Number(q.get('before'))||undefined}),collectors:await collectors(user),editorial:await one("SELECT * FROM community_editorial ORDER BY created_at DESC LIMIT 1")},{headers});
  if(view==='search')return Response.json(await searchCommunity(user,q.get('q')||'',q.get('type')||'models'),{headers});
  if(view==='comments')return Response.json({comments:await comments(user,q.get('post')||undefined,q.get('item')||undefined)},{headers});
  if(view==='piece'){const piece=await getPiece(q.get('id')||'',user);return Response.json({piece},{status:piece?200:404,headers});}
  if(!user)return Response.json({error:'Sign in to continue.'},{status:401,headers});
  if(view==='notifications')return Response.json({notifications:await rows("SELECT id,category,label,href,read_at readAt,created_at createdAt FROM community_notifications n WHERE owner_id=? AND (actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM collector_relationships b WHERE kind='block' AND ((b.owner_id=n.owner_id AND b.target_id=n.actor_id) OR (b.target_id=n.owner_id AND b.owner_id=n.actor_id)))) ORDER BY created_at DESC LIMIT 100",user)},{headers});
  if(view==='wishlist')return Response.json({models:await rows("SELECT c.id,c.title,c.scale,c.model_car_manufacturer modelManufacturer,c.primary_image_url primaryImageUrl FROM model_wishlist w JOIN catalog_products c ON c.id=w.catalog_id WHERE w.owner_id=? ORDER BY w.created_at DESC",user)},{headers});
  return Response.json({items:await getCollection(user,user),shelves:await getShelves(user,user),settings:await settings(user),profile:{handle:c!.profile.handle,displayName:c!.profile.displayName,bio:c!.profile.bio},listings:await rows("SELECT p.id,p.title,p.catalog_product_id catalogId FROM products p JOIN sellers s ON s.id=p.seller_id WHERE s.owner_user_id=? AND p.status='active' AND p.inventory_quantity=1",user)},{headers});
}catch(e){return routeError(e);}}
export async function POST(request:Request){try{const c=await requireCollectorApi(request);if(c instanceof Response)return c;return Response.json({ok:true,...await communityAction(c.user.id,await readJsonObject(request))},{headers});}catch(e){return routeError(e);}}
