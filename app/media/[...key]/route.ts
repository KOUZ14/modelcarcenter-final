import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] | string }> },
) {
  const raw = (await params).key;
  const key = Array.isArray(raw) ? raw.join("/") : raw;
  if ((!key.startsWith("listings/") && !/^store-logos\/[^/]+\/[a-f0-9-]+\.jpg$/.test(key)) || key.includes("..")) return new Response("Not found", { status: 404 });
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
