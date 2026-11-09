import { logSecurityEvent } from "@/lib/security-events";
import { getCollectorAuth } from "@/lib/auth";
import { getPromotionPlacements } from "@/lib/promotion-placements";
import { readMarketplaceFilters } from "@/lib/discovery";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return Response.json({ placements: [] }, { headers });
  try {
    const filters = readMarketplaceFilters(new URL(request.url).searchParams);
    const session = await getCollectorAuth().api.getSession({ headers: request.headers });
    const placements = await getPromotionPlacements(filters, session?.user?.id ?? null);
    return Response.json({ placements }, { headers });
  } catch {
    logSecurityEvent("operation_failed", { scope: "app/api/promotions/placements/route" });
    return Response.json({ placements: [] }, { headers });
  }
}
