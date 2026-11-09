import { getD1 } from "@/db";
import { env } from "cloudflare:workers";
import { PRODUCT_IMAGE_WIDTHS } from "@/lib/product-image-sources";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] | string }> },
) {
  const raw = (await params).key;
  const key = Array.isArray(raw) ? raw.join("/") : raw;
  if ((!key.startsWith("listings/") && !/^store-logos\/[^/]+\/[a-f0-9-]+\.jpg$/.test(key)) || key.includes("..")) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const width = url.searchParams.has("w") ? Number(url.searchParams.get("w")) : null;
  if (width !== null && (!key.startsWith("listings/") || !(PRODUCT_IMAGE_WIDTHS as readonly number[]).includes(width))) return new Response("Unsupported image width", { status: 400 });
  if (key.startsWith("listings/") && await getD1().prepare("SELECT 1 FROM purchase_evidence_media WHERE storage_key=? LIMIT 1").bind(key).first()) {
    const published = await getD1().prepare("SELECT 1 FROM product_images WHERE storage_key=? UNION SELECT 1 FROM products WHERE primary_image_url=? LIMIT 1").bind(key,`/media/${key}`).first();
    if (!published) return new Response("Not found", {status:404,headers:{"Cache-Control":"private, no-store"}});
  }
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  if (width !== null) {
    // Authorization and source existence are checked before consulting the
    // derivative cache, so retained purchase evidence cannot become public.
    const variantEtag = `W/"${object.httpEtag.replaceAll('"', '')}-display-v1-${width}"`;
    const variantHeaders = new Headers({ "ETag": variantEtag, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    if (request.headers.get("if-none-match") === variantEtag) return new Response(null, { status: 304, headers: variantHeaders });
    url.search = `?w=${width}&variant=1`;
    const cacheKey = new Request(url.toString());
    const cache = typeof caches === "undefined" ? undefined : (caches as CacheStorage & { default?: Cache }).default;
    const cached = await cache?.match(cacheKey).catch(() => undefined);
    if (cached) return cached;
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    const mime = object.httpMetadata?.contentType || "image/jpeg";
    try {
      const { resizeListingImage } = await import("@/lib/product-image-variants");
      const variant = resizeListingImage(bytes, width, mime);
      variantHeaders.set("Content-Type", variant.mime);
      const response = new Response(new Uint8Array(variant.bytes), { headers: variantHeaders });
      // Cache storage is optional; an unavailable cache must not break a photo.
      await cache?.put(cacheKey, response.clone()).catch(() => {});
      return response;
    } catch {
      return new Response(bytes, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
    }
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
