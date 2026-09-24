import { env } from "cloudflare:workers";
import { requireCollectorApi } from "@/lib/collector-auth";
import { run } from "@/lib/community";
import { stripPhotoMetadata } from "@/lib/community-images";
import { parsePhotoCrop } from "@/lib/profile-photo";
import { routeError } from "@/lib/http";
import { ValidationError } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const collector = await requireCollectorApi(request);
    if (collector instanceof Response) return collector;
    const form = await request.formData(), photo = form.get("photo");
    if (!(photo instanceof File) || photo.size > 5 * 1024 * 1024) throw new ValidationError("Choose a photo up to 5 MB.");
    const bytes = stripPhotoMetadata(new Uint8Array(await photo.arrayBuffer()));
    const original = form.get("original"), cropValue = form.get("crop");
    let source: Uint8Array | null = null;
    let crop = null;
    if (original !== null || cropValue !== null) {
      if (!(original instanceof File) || original.size > 5 * 1024 * 1024) throw new ValidationError("Choose an original photo up to 5 MB.");
      try { crop = parsePhotoCrop(typeof cropValue === "string" ? JSON.parse(cropValue) : null); } catch { /* Invalid JSON is handled below. */ }
      if (!crop) throw new ValidationError("Choose a valid photo position and zoom.");
      source = stripPhotoMetadata(new Uint8Array(await original.arrayBuffer()));
    }
    const id = crypto.randomUUID();
    // Separate immutable objects keep public crops and owner-only originals apart.
    if (source && crop) await env.IMAGES.put(`community/${id}.original.jpg`, source, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { profileCrop: JSON.stringify(crop) } });
    await env.IMAGES.put(`community/${id}.jpg`, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    await run("INSERT INTO community_media (id,owner_id,created_at) VALUES (?,?,?)", id, collector.user.id, Date.now());
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
