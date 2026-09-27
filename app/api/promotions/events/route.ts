import { getCollectorAuth } from "@/lib/auth";
import { readJsonObject } from "@/lib/http";
import { recordPromotionEvent } from "@/lib/promotion-placements";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  try {
    const payload = await readJsonObject(request);
    const session = await getCollectorAuth().api.getSession({ headers: request.headers });
    if (typeof payload.token !== "string" || typeof payload.kind !== "string") return Response.json({ error: "Invalid event." }, { status: 400 });
    await recordPromotionEvent(payload.token, payload.kind, session?.user?.id ?? null);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
