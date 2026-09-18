import { requireAdminApi } from "@/lib/admin-auth";
import { getAdminPromotions, changePromotionCampaign, savePromotionSettings, requirePromotionReason } from "@/lib/promotions";
import { queuePromotionRefund, processPromotions } from "@/lib/promotion-payments";
import { readJsonObject, routeError } from "@/lib/http";
import { requiredString, ValidationError } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET() {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try { return Response.json(await getAdminPromotions(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return routeError(error, "Promotion administration is unavailable."); }
}
export async function POST(request: Request) {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try {
    const p = await readJsonObject(request), action = requiredString(p.action, "action", 30), reason = requirePromotionReason(p.reason);
    if (action === "settings") await savePromotionSettings(p, identity.email);
    else if (action === "maintenance") await processPromotions();
    else {
      const id = requiredString(p.campaignId, "campaignId", 100);
      if (action === "refund") {
        await queuePromotionRefund(id, Number(p.amountCents), requiredString(p.requestKey, "requestKey", 100), reason, identity.email);
        await processPromotions();
      } else if (["pause", "reinstate", "end"].includes(action)) await changePromotionCampaign(id, null, action, identity.email, reason);
      else throw new ValidationError("Unknown promotion action.");
    }
    return Response.json({ ok: true });
  } catch (error) { return routeError(error, "Promotion action could not be completed."); }
}
