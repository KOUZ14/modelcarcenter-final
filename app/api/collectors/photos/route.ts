import { env } from "cloudflare:workers";
import { requireCollectorApi } from "@/lib/collector-auth";
import { run } from "@/lib/community";
import { stripPhotoMetadata } from "@/lib/community-images";
import { routeError } from "@/lib/http";
import { ValidationError } from "@/lib/validation";
export async function POST(request:Request){try{const c=await requireCollectorApi(request);if(c instanceof Response)return c;const f=(await request.formData()).get('photo');if(!(f instanceof File)||f.size>5*1024*1024)throw new ValidationError('Choose a photo up to 5 MB.');const bytes=stripPhotoMetadata(new Uint8Array(await f.arrayBuffer())),id=crypto.randomUUID();await env.IMAGES.put(`community/${id}.jpg`,bytes,{httpMetadata:{contentType:'image/jpeg'}});await run('INSERT INTO community_media (id,owner_id,created_at) VALUES (?,?,?)',id,c.user.id,Date.now());return Response.json({id},{headers:{'Cache-Control':'no-store'}});}catch(e){return routeError(e);}}
