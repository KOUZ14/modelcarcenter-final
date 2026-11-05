import { env } from "cloudflare:workers";
import { requireCollectorApi } from "@/lib/collector-auth";
import { run } from "@/lib/community";
import { sanitizeUploadedImage } from "@/lib/image-sanitization";
import { assertUploadRate, putManagedUpload, deleteManagedUpload } from "@/lib/managed-uploads";
import { getD1 } from "@/db";
import { config } from "@/lib/config";
import { parsePhotoCrop } from "@/lib/profile-photo";
import { routeError } from "@/lib/http";
import { ValidationError } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const collector = await requireCollectorApi(request);
    if (collector instanceof Response) return collector;
    const form = await request.formData(), photo = form.get("photo");
    if (!(photo instanceof File) || photo.size > 5 * 1024 * 1024) throw new ValidationError("Choose a photo up to 5 MB.");
    await assertUploadRate(getD1(), collector.user.id, config.betterAuthSecret);
    const { bytes } = sanitizeUploadedImage(new Uint8Array(await photo.arrayBuffer()), photo.type, true);
    const original = form.get("original"), cropValue = form.get("crop");
    let source: Uint8Array | null = null;
    let crop = null;
    if (original !== null || cropValue !== null) {
      if (!(original instanceof File) || original.size > 5 * 1024 * 1024) throw new ValidationError("Choose an original photo up to 5 MB.");
      try { crop = parsePhotoCrop(typeof cropValue === "string" ? JSON.parse(cropValue) : null); } catch { /* Invalid JSON is handled below. */ }
      if (!crop) throw new ValidationError("Choose a valid photo position and zoom.");
      source = sanitizeUploadedImage(new Uint8Array(await original.arrayBuffer()), original.type, true).bytes;
    }
    const id = crypto.randomUUID();
    // Separate immutable objects keep public crops and owner-only originals apart.
    const saved: string[] = [];
    const save = async (key: string, bytes: Uint8Array, metadata?: Record<string, string>) => {
      await putManagedUpload({ database: getD1(), storage: env.IMAGES, ownerId: collector.user.id, key, bytes, mime: "image/jpeg", metadata });
      saved.push(key);
    };
    try {
      if (source && crop) await save(`community/${id}.original.jpg`, source, { profileCrop: JSON.stringify(crop) });
      await save(`community/${id}.jpg`, bytes);
      await run("INSERT INTO community_media (id,owner_id,created_at) VALUES (?,?,?)", id, collector.user.id, Date.now());
    } catch (error) {
      await Promise.allSettled(saved.map(key => deleteManagedUpload(getD1(), env.IMAGES, key)));
      throw error;
    }
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
