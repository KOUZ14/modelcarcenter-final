import { env } from "cloudflare:workers";
import { requireCollectorApi } from "@/lib/collector-auth";
import { stripPhotoMetadata } from "@/lib/community-images";
import { routeError } from "@/lib/http";
import { ValidationError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const account = await requireCollectorApi(request);
    if (account instanceof Response) return account;
    if (!account.seller || account.seller.sellerType !== "professional") return Response.json({ error: "A professional store is required." }, { status: 403 });
    if (account.seller.status === "suspended") return Response.json({ error: "This store cannot change its logo while suspended." }, { status: 403 });
    const photo = (await request.formData()).get("photo");
    if (!(photo instanceof File) || !photo.size || photo.size > 5 * 1024 * 1024) throw new ValidationError("Choose one image up to 5 MB.");
    const bytes = stripPhotoMetadata(new Uint8Array(await photo.arrayBuffer()));
    const key = `store-logos/${encodeURIComponent(account.seller.id)}/${crypto.randomUUID()}.jpg`;
    await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    return Response.json({ url: `/media/${key}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error, "The logo could not be uploaded."); }
}
