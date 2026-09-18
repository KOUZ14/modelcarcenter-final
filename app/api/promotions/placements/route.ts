import { getCollectorAuth } from "@/lib/auth";
import { getPromotionPlacements } from "@/lib/promotion-placements";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return Response.json({ placements: [] }, { headers });
  try {
    const p = new URL(request.url).searchParams, sort = p.get("sort");
    const session = await getCollectorAuth().api.getSession({ headers: request.headers });
    const placements = await getPromotionPlacements({ q: (p.get("q") ?? "").slice(0, 200), scale: p.get("scale") ?? "", manufacturer: p.get("manufacturer") ?? "", condition: p.get("condition") ?? "", availability: p.get("availability") ?? "", seller: p.get("seller") ?? "", page: Number(p.get("page") ?? 1), sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest" }, session?.user?.id ?? null);
    return Response.json({ placements }, { headers });
  } catch (error) {
    console.error("Promotion placements unavailable", error instanceof Error ? error.name : "Error");
    return Response.json({ placements: [] }, { headers });
  }
}
