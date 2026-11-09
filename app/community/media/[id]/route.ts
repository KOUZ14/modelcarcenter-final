import { env } from "cloudflare:workers";
import { getCurrentCollector } from "@/lib/collector-auth";
import { blockSQL, one } from "@/lib/community";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,viewer=(await getCurrentCollector(request.headers))?.user.id??null;
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Type':'image/jpeg'};
  if(new URL(request.url).searchParams.get('original')==='1'){
    if(!viewer||!await one('SELECT id FROM community_media WHERE id=? AND owner_id=?',id,viewer))return new Response('Not found',{status:404,headers});
    const original=await env.IMAGES.get(`community/${id}.original.jpg`);
    // Older uploads already contain the full image and have no saved crop.
    const object=original||await env.IMAGES.get(`community/${id}.jpg`);
    if(!object)return new Response('Not found',{status:404,headers});
    return new Response(object.body,{headers:{...headers,...(original?.customMetadata?.profileCrop?{'X-Profile-Crop':original.customMetadata.profileCrop}:{})}});
  }
  const allowed=await one(`SELECT m.id FROM community_media m LEFT JOIN collection_items i ON i.id=m.item_id LEFT JOIN community_posts p ON p.id=m.post_id LEFT JOIN community_settings s ON s.user_id=m.owner_id LEFT JOIN collector_profiles cp ON cp.user_id=m.owner_id LEFT JOIN collector_threads t ON t.id=m.thread_id
    WHERE m.id=? AND ${blockSQL('m.owner_id')} AND (m.owner_id=? OR (s.published=1 AND (s.cover_id=m.id OR cp.avatar_url='/community/media/'||m.id OR (i.visibility='public' AND EXISTS(SELECT 1 FROM json_each(i.photos) WHERE value=m.id)) OR (p.status='public' AND EXISTS(SELECT 1 FROM json_each(p.photos) WHERE value=m.id)))) OR (t.status='accepted' AND (t.sender_id=? OR t.recipient_id=?)))`,id,viewer,viewer,viewer,viewer,viewer);
  if(!allowed)return new Response('Not found',{status:404,headers});const object=await env.IMAGES.get(`community/${id}.jpg`);if(!object)return new Response('Not found',{status:404,headers});return new Response(object.body,{headers});
}
