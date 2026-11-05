import { getD1 } from "@/db";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] | string }> },
) {
  const raw = (await params).key;
  const key = Array.isArray(raw) ? raw.join("/") : raw;
  if ((!key.startsWith("listings/") && !/^store-logos\/[^/]+\/[a-f0-9-]+\.jpg$/.test(key)) || key.includes("..")) return new Response("Not found", { status: 404 });
  if (key.startsWith("listings/") && await getD1().prepare("SELECT 1 FROM purchase_evidence_media WHERE storage_key=? LIMIT 1").bind(key).first()) {
    const published = await getD1().prepare("SELECT 1 FROM product_images WHERE storage_key=? UNION SELECT 1 FROM products WHERE primary_image_url=? LIMIT 1").bind(key,`/media/${key}`).first();
    if (!published) return new Response("Not found", {status:404,headers:{"Cache-Control":"private, no-store"}});
  }
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
