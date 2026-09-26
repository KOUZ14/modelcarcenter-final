import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import { changePromotionCampaign, getSellerPromotions, getPromotionCampaign } from "@/lib/promotions";
import { synchronizePromotionSession, startPromotionPurchase } from "@/lib/promotion-payments";
import { getD1 } from "@/db";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { requiredString, ValidationError } from "@/lib/validation";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (account.seller?.sellerType !== "professional") return Response.json({ error: "A professional store is required." }, { status: 403 });
  try { return Response.json(await getSellerPromotions(account.seller.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return routeError(error, "Promotions could not be loaded."); }
}

export async function POST(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (account.seller?.sellerType !== "professional") return Response.json({ error: "A professional store is required." }, { status: 403 });
  try {
    const payload = await readJsonObject(request), action = requiredString(payload.action, "action", 30);
    const id = requiredString(payload.campaignId, "campaignId", 100);
    if (action === "continue") {
      const c = await getPromotionCampaign(id, account.seller.id);
      const payment = await getD1().prepare("SELECT request_key FROM promotion_payments WHERE id=?").bind(c.payment_id).first<{ request_key: string }>();
      return Response.json(await startPromotionPurchase(account.seller.id, c.product_id, payment!.request_key, c.terms_version));
    } else if (action === "reconcile") {
      const c = await getPromotionCampaign(id, account.seller.id);
      if (c.session_id) await synchronizePromotionSession(id, await retrieveCheckoutSession(c.session_id));
    } else {
      if (account.seller.status !== "active" && action !== "end") throw new ValidationError("Your store is not active.");
      await changePromotionCampaign(id, account.seller.id, action, account.user.id);
    }
    return Response.json({ ok: true });
  } catch (error) { return routeError(error, "Promotion could not be updated."); }
}
