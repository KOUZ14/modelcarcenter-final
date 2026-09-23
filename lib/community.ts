import { getD1 } from "@/db";
import { getCatalogProduct, searchCatalogProducts } from "./catalog-products";
import { ValidationError } from "./validation";

type Value = string | number | null;
export const one = <T>(sql: string, ...values: Value[]) => getD1().prepare(sql).bind(...values).first<T>();
export async function rows<T>(sql: string, ...values: Value[]):Promise<T[]> { return (await getD1().prepare(sql).bind(...values).all<T>()).results??[]; }
export const run = (sql: string, ...values: Value[]) => getD1().prepare(sql).bind(...values).run();
export const text = (v: unknown, max = 200) => typeof v === "string" ? v.trim().slice(0,max) : "";
export function required(v: unknown, label: string, max = 200) { const s=text(v,max); if(!s) throw new ValidationError(`${label} is required.`); return s; }
export const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))].slice(0,8) : [];
export const photos = (v: string) => JSON.parse(v) as string[];
export type Piece = {id:string;ownerId:string;catalogId:string|null;listingId:string|null;title:string;scale:string;maker:string;carMake:string;color:string;story:string;condition:string;visibility:string;availability:string;photos:string;minimumCents:number;commentsEnabled:number;pinned:number;version:number;handle:string|null;displayName:string;listingSlug:string|null;priceCents:number|null;currency:string|null;shippingMode:string|null;shippingCents:number|null;handlingDays:number|null;privateNotes?:string;purchaseCost?:string};
export type Collector = {userId:string;handle:string;displayName:string;bio:string;interests:string;region:string;published:number;count:number;followers:number;following:number;isFollowing:number};
export type Post = {id:string;ownerId:string;body:string;photos:string;topic:string;prompt:string;catalogId:string|null;itemId:string|null;commercial:number;createdAt:number;handle:string;displayName:string;likes:number;saves:number;comments:number;liked:number;saved:number;itemTitle:string|null;availability:string|null;modelTitle:string|null;modelScale:string|null;modelManufacturer:string|null;modelColor:string|null;modelImageUrl:string|null;reason?:string};
export type CommunityComment = {id:string;body:string;displayName:string;handle:string|null;avatarUrl:string|null;ownerId:string;createdAt:number};
export const blockSQL = (ownerExpression: string) => `NOT EXISTS (SELECT 1 FROM collector_relationships b WHERE b.kind='block' AND ((b.owner_id=${ownerExpression} AND b.target_id=?) OR (b.owner_id=? AND b.target_id=${ownerExpression})))`;
const pieceSelect = `i.id,i.owner_id ownerId,i.catalog_id catalogId,i.listing_id listingId,i.title,i.scale,i.maker,i.car_make carMake,i.color,i.story,CASE WHEN p.id IS NOT NULL THEN p.condition || CASE WHEN p.condition_notes!='' THEN ': '||p.condition_notes ELSE '' END ELSE i.condition END condition,i.visibility,
 CASE WHEN p.inventory_quantity=0 AND i.listing_id IS NOT NULL THEN 'previously_owned' WHEN p.reserved_quantity>0 AND i.listing_id IS NOT NULL THEN 'reserved' ELSE i.availability END availability,
 i.photos,i.minimum_cents minimumCents,i.comments_enabled commentsEnabled,i.pinned,i.version,c.handle,c.display_name displayName,p.slug listingSlug,p.price_cents priceCents,p.currency,CASE WHEN seller.seller_type='collector' THEN 'calculated' ELSE seller.shipping_mode END shippingMode,seller.default_shipping_cents shippingCents,seller.handling_time_business_days handlingDays`;
const pieceJoin = `FROM collection_items i JOIN collector_profiles c ON c.user_id=i.owner_id LEFT JOIN community_settings s ON s.user_id=i.owner_id LEFT JOIN products p ON p.id=i.listing_id LEFT JOIN sellers seller ON seller.id=p.seller_id`;
export async function settings(userId:string) {
  await run("INSERT OR IGNORE INTO community_settings (user_id) VALUES (?)",userId);
  return (await one<{published:number;visibility:string;interests:string;region:string;contact:string;social_notifications:number;discovery_notifications:number;cover_id:string|null}>("SELECT * FROM community_settings WHERE user_id=?",userId))!;
}
export async function assertContact(a:string,b:string) {
  if(a===b) throw new ValidationError("Choose another collector.");
  if(await one("SELECT id FROM collector_relationships WHERE kind='block' AND ((owner_id=? AND target_id=?) OR (owner_id=? AND target_id=?))",a,b,b,a)) throw new ValidationError("This interaction is unavailable.");
}
export async function getPiece(id:string, viewer:string|null, visitor=false) {
  const item=await one<Piece>(`SELECT ${pieceSelect} ${pieceJoin} WHERE i.id=? AND ((i.visibility='public' AND s.published=1) OR i.owner_id=?) AND ${blockSQL("i.owner_id")}`,id,visitor?null:viewer,viewer,viewer);
  if(!item) return null;
  if(item.ownerId===viewer&&!visitor) Object.assign(item,await one("SELECT private_notes privateNotes,purchase_cost purchaseCost FROM collection_items WHERE id=?",id));
  return item;
}
export async function getCollection(ownerId:string,viewer:string|null,visitor=false) {
  return rows<Piece>(`SELECT ${pieceSelect} ${pieceJoin} WHERE i.owner_id=? AND ((i.visibility='public' AND s.published=1) OR i.owner_id=?) AND ${blockSQL("i.owner_id")} ORDER BY i.pinned DESC,i.created_at DESC LIMIT 500`,ownerId,visitor?null:viewer,viewer,viewer);
}
export async function getShelves(ownerId:string,viewer:string|null,visitor=false) {
  return rows<{id:string;name:string;itemId:string}>(`SELECT s.id,s.name,m.item_id itemId FROM collection_shelves s LEFT JOIN shelf_members m ON m.shelf_id=s.id LEFT JOIN collection_items i ON i.id=m.item_id WHERE s.owner_id=? AND (s.owner_id=? OR (i.visibility='public' AND EXISTS(SELECT 1 FROM community_settings c WHERE c.user_id=s.owner_id AND c.published=1))) AND ${blockSQL("s.owner_id")}`,ownerId,visitor?null:viewer,viewer,viewer);
}
export async function collectors(viewer:string|null,q="") {
  return rows<Collector>(`SELECT c.user_id userId,c.handle,c.display_name displayName,c.bio,s.interests,s.region,s.published,
  (SELECT count(*) FROM collection_items i LEFT JOIN products p ON p.id=i.listing_id WHERE i.owner_id=c.user_id AND i.visibility='public' AND i.availability!='previously_owned' AND (p.id IS NULL OR p.inventory_quantity>0)) count,
  (SELECT count(*) FROM collector_relationships r WHERE r.target_id=c.user_id AND r.kind='follow') followers,
  (SELECT count(*) FROM collector_relationships r WHERE r.owner_id=c.user_id AND r.kind='follow') following,
  EXISTS(SELECT 1 FROM collector_relationships r WHERE r.owner_id=? AND r.target_id=c.user_id AND r.kind='follow') isFollowing
  FROM collector_profiles c JOIN community_settings s ON s.user_id=c.user_id WHERE s.published=1 AND c.handle IS NOT NULL AND (c.display_name LIKE ? OR c.handle LIKE ? OR s.interests LIKE ?) AND ${blockSQL("c.user_id")} ORDER BY c.created_at DESC LIMIT 60`,viewer,`%${text(q)}%`,`%${text(q)}%`,`%${text(q)}%`,viewer,viewer);
}
export async function profile(handle:string,viewer:string|null,visitor=false) {
  const row=await one<{userId:string;handle:string;displayName:string;bio:string;avatarUrl:string|null}>(`SELECT user_id userId,handle,display_name displayName,bio,avatar_url avatarUrl FROM collector_profiles WHERE handle=?`,handle);
  if(!row) return null;
  const setting=await settings(row.userId);
  if((!setting.published&&(row.userId!==viewer||visitor))||await one(`SELECT id FROM collector_relationships WHERE kind='block' AND ((owner_id=? AND target_id=?) OR (owner_id=? AND target_id=?))`,row.userId,viewer,viewer,row.userId)) return null;
  const counts=await one<{followers:number;following:number;isFollowing:number}>(`SELECT (SELECT count(*) FROM collector_relationships WHERE target_id=? AND kind='follow') followers,(SELECT count(*) FROM collector_relationships WHERE owner_id=? AND kind='follow') following,EXISTS(SELECT 1 FROM collector_relationships WHERE owner_id=? AND target_id=? AND kind='follow') isFollowing`,row.userId,row.userId,viewer,row.userId);
  return {...row,coverId:setting.cover_id,interests:setting.interests,region:setting.region,published:setting.published,...counts!};
}
export async function notify(ownerId:string,actorId:string,category:string,label:string,href:string) {
  if(ownerId===actorId)return;
  const s=await settings(ownerId);
  if(category==='social'&&!s.social_notifications)return;
  // Group repeated activity on the same destination; never copy user text into notifications.
  await run("DELETE FROM community_notifications WHERE owner_id=? AND actor_id=? AND label=? AND href=? AND read_at IS NULL",ownerId,actorId,label,href);
  await run("INSERT INTO community_notifications (id,owner_id,actor_id,category,label,href,created_at) VALUES (?,?,?,?,?,?,?)",crypto.randomUUID(),ownerId,actorId,category,label,href,Date.now());
}
async function attachMedia(userId:string,list:string[],field:"item_id"|"post_id"|"thread_id",id:string,validateOnly=false) {
  for(const photo of list) {
    const media=await one<{owner_id:string;item_id:string|null;post_id:string|null;thread_id:string|null}>("SELECT * FROM community_media WHERE id=?",photo);
    if(!media||media.owner_id!==userId||[media.item_id,media.post_id,media.thread_id].some(v=>v&&v!==id))throw new ValidationError("Choose one of your unused photos.");
  }
  if(!validateOnly)for(const photo of list)await run(`UPDATE community_media SET ${field}=? WHERE id=? AND owner_id=?`,id,photo,userId);
}
export async function savePiece(userId:string,p:Record<string,unknown>) {
  const id=text(p.id)||crypto.randomUUID(); const existing=text(p.id)?await getPiece(id,userId):null;
  if(p.id&&(!existing||existing.ownerId!==userId))throw new ValidationError("Collection item unavailable.");
  const s=await settings(userId); const visibility=p.visibility==='public'?'public':'private';
  if(visibility==='public'&&(!existing||existing.visibility==='private')&&p.publishConfirmed!==true)throw new ValidationError("Confirm that this piece and its photos may be published.");
  if(visibility==='public'&&!s.published)throw new ValidationError("Publish your collector profile first, or save this piece privately.");
  const catalog=text(p.catalogId)?await getCatalogProduct(text(p.catalogId)):null;
  if(p.catalogId&&!catalog)throw new ValidationError("Catalog model unavailable.");
  const title=catalog?.title||required(p.title,"Model name"); const scale=catalog?.scale||required(p.scale,"Scale"); const maker=catalog?.modelManufacturer||required(p.maker,"Manufacturer");
  const photoIds=ids(p.photos); if(!catalog&&!photoIds.length)throw new ValidationError("Add a personal photo for an unmatched model.");
  const availability=existing?.listingId?(await one<{availability:string}>('SELECT availability FROM collection_items WHERE id=?',existing.id))!.availability:p.availability==='previously_owned'?'previously_owned':'not_for_sale';
  if(existing?.listingId&&catalog?.id!==existing.catalogId)throw new ValidationError('A linked piece must retain its catalog identity.');
  const shelves=ids(p.shelves);
  for(const shelf of shelves)if(!await one("SELECT id FROM collection_shelves WHERE id=? AND owner_id=?",shelf,userId))throw new ValidationError("Shelf unavailable.");
  await attachMedia(userId,photoIds,"item_id",id,true);
  const stmt=getD1().prepare(`INSERT INTO collection_items (id,owner_id,catalog_id,title,scale,maker,car_make,color,story,condition,visibility,availability,photos,private_notes,purchase_cost,comments_enabled,pinned,created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET catalog_id=excluded.catalog_id,title=excluded.title,scale=excluded.scale,maker=excluded.maker,car_make=excluded.car_make,color=excluded.color,story=excluded.story,condition=excluded.condition,visibility=excluded.visibility,availability=excluded.availability,photos=excluded.photos,private_notes=excluded.private_notes,purchase_cost=excluded.purchase_cost,comments_enabled=excluded.comments_enabled,pinned=excluded.pinned,version=collection_items.version+1 WHERE collection_items.owner_id=excluded.owner_id AND collection_items.version=?`).bind(id,userId,catalog?.id??null,title,scale,maker,catalog?.vehicleMake||text(p.carMake),catalog?.color||text(p.color),text(p.story,3000),text(p.condition,1000),visibility,availability,JSON.stringify(photoIds),text(p.privateNotes,3000),text(p.purchaseCost,100),p.commentsEnabled===false?0:1,p.pinned===true?1:0,Date.now(),existing?Number(p.version):1);
  const result=await stmt.run();if(!result.meta.changes)throw new ValidationError("This piece changed. Reload before saving.");
  await attachMedia(userId,photoIds,"item_id",id);
  await run("DELETE FROM shelf_members WHERE item_id=?",id);
  for(const shelf of shelves)await run("INSERT INTO shelf_members (id,shelf_id,item_id) VALUES (?,?,?)",crypto.randomUUID(),shelf,id);
  return {id,version:(existing?Number(p.version):0)+1};
}
export async function feed(viewer:string|null, input:{tab?:string;topic?:string;limit?:number;before?:number;beforeId?:string;order?:"newest";ownerId?:string;catalogId?:string;q?:string;postId?:string}={}) {
  const args:Value[]=[viewer,viewer,viewer,viewer];
  let where=`p.status='public' AND s.published=1 AND ${blockSQL("p.owner_id")} AND NOT EXISTS(SELECT 1 FROM collector_relationships r WHERE r.owner_id=? AND r.target_id=p.owner_id AND r.kind='mute') AND NOT EXISTS(SELECT 1 FROM community_post_actions a WHERE a.owner_id=? AND a.post_id=p.id AND a.kind='hide')`;
  args.push(viewer,viewer,viewer,viewer);
  if(input.tab==='following'){where+=` AND EXISTS(SELECT 1 FROM collector_relationships r WHERE r.owner_id=? AND r.target_id=p.owner_id AND r.kind='follow')`;args.push(viewer);}
  if(input.tab==='saved'){where+=` AND EXISTS(SELECT 1 FROM community_post_actions a WHERE a.owner_id=? AND a.post_id=p.id AND a.kind='save')`;args.push(viewer);}
  for(const [column,val] of [["p.topic",input.topic],["p.owner_id",input.ownerId],["p.catalog_id",input.catalogId],["p.id",input.postId]] as const)if(val){where+=` AND ${column}=?`;args.push(val);}
  if(input.q){where+=" AND p.body LIKE ?";args.push(`%${text(input.q)}%`);}
  const before=input.before||Date.now();
  if(input.beforeId){where+=" AND (p.created_at<? OR (p.created_at=? AND p.id<?))";args.push(before,before,input.beforeId);}
  else {where+=" AND p.created_at<=?";args.push(before);}
  const limit=Math.min(100,Math.max(1,input.limit||20));args.push(input.tab==='following'||input.order==='newest'?limit:Math.min(200,limit*3));
  const result=await rows<Post>(`SELECT p.id,p.owner_id ownerId,p.body,p.photos,p.topic,p.prompt,p.catalog_id catalogId,
  CASE WHEN i.visibility='public' THEN i.id ELSE NULL END itemId,p.commercial,p.created_at createdAt,c.handle,c.display_name displayName,
  (SELECT count(*) FROM community_post_actions a WHERE a.post_id=p.id AND a.kind='like') likes,(SELECT count(*) FROM community_post_actions a WHERE a.post_id=p.id AND a.kind='save') saves,
  (SELECT count(*) FROM community_comments a WHERE a.post_id=p.id AND a.status='public') comments,
  EXISTS(SELECT 1 FROM community_post_actions a WHERE a.post_id=p.id AND a.kind='like' AND a.owner_id=?) liked,
  EXISTS(SELECT 1 FROM community_post_actions a WHERE a.post_id=p.id AND a.kind='save' AND a.owner_id=?) saved,
  CASE WHEN i.visibility='public' AND ${blockSQL("i.owner_id")} THEN i.title ELSE NULL END itemTitle,
  CASE WHEN i.visibility='public' THEN CASE WHEN pr.inventory_quantity=0 THEN 'previously_owned' WHEN pr.reserved_quantity>0 THEN 'reserved' ELSE i.availability END ELSE NULL END availability,
  cat.title modelTitle,cat.primary_image_url modelImageUrl,
  COALESCE(cat.scale,CASE WHEN i.visibility='public' THEN i.scale END) modelScale,
  COALESCE(cat.model_car_manufacturer,CASE WHEN i.visibility='public' THEN i.maker END) modelManufacturer,
  COALESCE(cat.color,CASE WHEN i.visibility='public' THEN i.color END) modelColor
  FROM community_posts p JOIN collector_profiles c ON c.user_id=p.owner_id JOIN community_settings s ON s.user_id=p.owner_id
  LEFT JOIN collection_items i ON i.id=p.item_id AND i.owner_id=p.owner_id LEFT JOIN products pr ON pr.id=i.listing_id LEFT JOIN catalog_products cat ON cat.id=p.catalog_id WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`,...args);
  if(input.order==='newest'||input.tab==='following'||input.tab==='saved'||input.postId)return result;
  const interests=viewer?(await settings(viewer)).interests.toLowerCase().split(",").map(v=>v.trim()).filter(Boolean):[];
  const followed=viewer?await rows<{target_id:string}>("SELECT target_id FROM collector_relationships WHERE owner_id=? AND kind='follow'",viewer):[];
  const wish=viewer?await rows<{catalog_id:string}>("SELECT catalog_id FROM model_wishlist WHERE owner_id=?",viewer):[];
  const seen=new Map<string,number>();
  return result.map((p)=>{const interest=interests.some(v=>(p.topic+' '+p.body).toLowerCase().includes(v)),follow=followed.some(v=>v.target_id===p.ownerId),saved=wish.some(v=>v.catalog_id===p.catalogId);const repeat=seen.get(p.ownerId)||0;seen.set(p.ownerId,repeat+1);return {...p,reason:follow?'You follow this collector':saved?'A model on your wishlist':interest?'Matches your collecting interests':'Recent collector contribution',score:p.createdAt/86400000+(follow?2:0)+(interest?2:0)+(saved?2:0)+Math.min(3,p.saves+p.comments)/10-repeat*3};}).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export async function comments(viewer:string|null,postId?:string,itemId?:string) {
  if(postId&&!(await feed(viewer,{postId})).length)return [];
  if(itemId&&!await getPiece(itemId,viewer))return [];
  return rows<CommunityComment>(`SELECT a.id,a.body,c.display_name displayName,c.handle,c.avatar_url avatarUrl,a.owner_id ownerId,a.created_at createdAt FROM community_comments a JOIN collector_profiles c ON c.user_id=a.owner_id WHERE a.status='public' AND ${postId?'a.post_id':'a.item_id'}=? AND ${blockSQL("a.owner_id")} ORDER BY a.created_at,a.id LIMIT 100`,postId||itemId||null,viewer,viewer);
}
export async function communityAction(userId:string,p:Record<string,unknown>) {
  const action=required(p.action,"Action");const now=Date.now();
  if(action==='settings'){
    const handle=required(p.handle,"Handle",30).toLowerCase();if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(handle))throw new ValidationError("Use 3–30 letters, numbers, underscores or hyphens for your handle.");
    const s=await settings(userId);if(p.published===true&&!s.published&&p.publishConfirmed!==true)throw new ValidationError("Confirm publication of your profile.");
    const avatarId=text(p.avatarId)||null,coverId=text(p.coverId)||null;for(const id of [avatarId,coverId])if(id&&!await one('SELECT id FROM community_media WHERE id=? AND owner_id=? AND item_id IS NULL AND post_id IS NULL AND thread_id IS NULL',id,userId))throw new ValidationError('Choose a profile photo that you uploaded.');
    const changes=[
      getD1().prepare("UPDATE collector_profiles SET handle=?,display_name=?,bio=? WHERE user_id=?").bind(handle,required(p.displayName,"Display name",100),text(p.bio,500),userId),
      getD1().prepare("UPDATE community_settings SET published=?,visibility=?,interests=?,region=?,contact=?,social_notifications=?,discovery_notifications=? WHERE user_id=?").bind(p.published===true?1:0,p.visibility==='public'?'public':'private',text(p.interests,300),text(p.region,80),['everyone','following','existing'].includes(String(p.contact))?String(p.contact):'requests',p.socialNotifications===false?0:1,p.discoveryNotifications===true?1:0,userId),
    ];
    if(p.avatarId!==undefined)changes.push(getD1().prepare('UPDATE collector_profiles SET avatar_url=? WHERE user_id=?').bind(avatarId?'/community/media/'+avatarId:null,userId));
    if(p.coverId!==undefined)changes.push(getD1().prepare('UPDATE community_settings SET cover_id=? WHERE user_id=?').bind(coverId,userId));
    // A rejected handle or invalid setting must not partially publish new profile images.
    await getD1().batch(changes);return {handle};
  }
  if(action==='piece')return savePiece(userId,p);
  if(action==='shelf'){const id=crypto.randomUUID();await run("INSERT INTO collection_shelves (id,owner_id,name,created_at) VALUES (?,?,?,?)",id,userId,required(p.name,"Shelf name",80),now);return {id};}
  if(action==='relationship'){
    const target=required(p.targetId,"Collector");await assertContact(userId,target).catch(e=>{if(p.kind!=='block')throw e;});
    const kind=String(p.kind);if(!['follow','mute','block'].includes(kind)||target===userId)throw new ValidationError("Invalid relationship.");
    if(p.enabled===false)await run("DELETE FROM collector_relationships WHERE owner_id=? AND target_id=? AND kind=?",userId,target,kind);
    else {if(!await one(kind==='follow'?"SELECT user_id FROM community_settings WHERE user_id=? AND published=1":"SELECT user_id FROM collector_profiles WHERE user_id=?",target))throw new ValidationError("Collector unavailable.");await run("INSERT OR IGNORE INTO collector_relationships (id,owner_id,target_id,kind,created_at) VALUES (?,?,?,?,?)",crypto.randomUUID(),userId,target,kind,now);if(kind==='block')await run("DELETE FROM collector_relationships WHERE kind='follow' AND ((owner_id=? AND target_id=?) OR(owner_id=? AND target_id=?))",userId,target,target,userId);if(kind==='follow')await notify(target,userId,'social','New follower','/profile');}return {};
  }
  if(action==='post'){
    if(!(await settings(userId)).published)throw new ValidationError("Publish your profile before sharing a post.");
    const id=crypto.randomUUID(),catalogId=text(p.catalogId)||null,itemId=text(p.itemId)||null,photoIds=ids(p.photos),body=required(p.body,"Caption or question",4000);
    if(catalogId&&!await getCatalogProduct(catalogId))throw new ValidationError("Model unavailable.");
    if(itemId){const item=await getPiece(itemId,userId);if(!item||item.ownerId!==userId||item.visibility!=='public'||(catalogId&&catalogId!==item.catalogId))throw new ValidationError("Tag a public piece from your own collection with its exact catalog identity.");}
    // Post photos are independent uploads: private item photos cannot be copied into public tags.
    for(const photo of photoIds)if(!await one("SELECT id FROM community_media WHERE id=? AND owner_id=? AND item_id IS NULL AND post_id IS NULL AND thread_id IS NULL",photo,userId))throw new ValidationError("Choose an unused photo for this post.");
    await run("INSERT INTO community_posts (id,owner_id,body,photos,topic,prompt,catalog_id,item_id,commercial,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",id,userId,body,JSON.stringify(photoIds),text(p.topic,80),text(p.prompt,80),catalogId,itemId,p.commercial===true?1:0,now);
    await attachMedia(userId,photoIds,'post_id',id);return {id};
  }
  if(action==='post_action'){
    const postId=required(p.postId,"Post"),kind=String(p.kind);if(!['like','save','hide'].includes(kind))throw new ValidationError("Invalid post action.");
    if(p.enabled===false)await run("DELETE FROM community_post_actions WHERE owner_id=? AND post_id=? AND kind=?",userId,postId,kind);
    else {if(!(await feed(userId,{postId})).length)throw new ValidationError("Post unavailable.");await run("INSERT OR IGNORE INTO community_post_actions (id,owner_id,post_id,kind,created_at) VALUES (?,?,?,?,?)",crypto.randomUUID(),userId,postId,kind,now);}return {};
  }
  if(action==='wishlist'){const catalogId=required(p.catalogId,"Model");if(!await getCatalogProduct(catalogId))throw new ValidationError("Model unavailable.");if(p.enabled===false)await run("DELETE FROM model_wishlist WHERE owner_id=? AND catalog_id=?",userId,catalogId);else await run("INSERT OR IGNORE INTO model_wishlist (id,owner_id,catalog_id,created_at) VALUES (?,?,?,?)",crypto.randomUUID(),userId,catalogId,now);return {};}
  if(action==='comment'){
    const postId=text(p.postId)||null,itemId=text(p.itemId)||null;if(Boolean(postId)===Boolean(itemId))throw new ValidationError("Choose a post or a piece.");
    const target=postId?(await feed(userId,{postId}))[0]:await getPiece(itemId!,userId);
    if(!target||('commentsEnabled' in target&&!target.commentsEnabled))throw new ValidationError("New comments are unavailable.");await assertContact(userId,target.ownerId).catch(e=>{if(userId!==target.ownerId)throw e;});
    if(!(await settings(userId)).published)throw new ValidationError("Publish your profile before commenting.");
    await run("INSERT INTO community_comments (id,owner_id,post_id,item_id,body,created_at) VALUES (?,?,?,?,?,?)",crypto.randomUUID(),userId,postId,itemId,required(p.body,"Comment",2000),now);await notify(target.ownerId,userId,'social','New reply',postId?`/community/posts/${postId}`:`/collection/${itemId}`);return {};
  }
  if(action==='report'){const type=String(p.targetType);if(!['post','comment','collector','message'].includes(type))throw new ValidationError("Invalid report target.");await run("INSERT INTO community_reports (id,owner_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)",crypto.randomUUID(),userId,type,required(p.targetId,"Target"),required(p.reason,"Reason",1000),now);return {};}
  if(action==='read_notifications'){await run("UPDATE community_notifications SET read_at=? WHERE owner_id=? AND read_at IS NULL",now,userId);return {};}
  throw new ValidationError("Unknown community action.");
}
export async function searchCommunity(viewer:string|null,q:string,type:string) {
  if(type==='collectors')return {collectors:await collectors(viewer,q)};
  if(type==='posts')return {posts:await feed(viewer,{q})};
  return {models:await searchCatalogProducts(q)};
}
