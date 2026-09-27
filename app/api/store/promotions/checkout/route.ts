import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import { startPromotionPurchase } from "@/lib/promotion-payments";
import { requiredString } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (account.seller?.sellerType !== "professional" || account.seller.status !== "active") return Response.json({ error: "An active professional store is required." }, { status: 403 });
  try {
    const p = await readJsonObject(request);
    return Response.json(await startPromotionPurchase(account.seller.id, requiredString(p.productId, "productId", 100), requiredString(p.requestKey, "requestKey", 100), requiredString(p.termsVersion, "termsVersion", 40)));
  } catch (error) { return routeError(error, "Promotion checkout could not be started. Refresh campaigns before retrying."); }
}
