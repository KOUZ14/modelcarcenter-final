import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import {
  purchaseOwnedLabel,
  quoteOwnedOrders,
  syncOwnedShipment,
} from "@/lib/shipping";
import { cleanText, requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (!account.seller)
    return Response.json(
      { error: "This account is not connected to a seller profile." },
      { status: 403 },
    );
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 40);
    if (action === "quote")
      return Response.json({
        ok: true,
        ...(await quoteOwnedOrders(account.user.id, payload)),
      });
    if (action === "buy_label")
      return Response.json({
        ok: true,
        ...(await purchaseOwnedLabel(account.user.id, payload)),
      });
    if (action === "sync_tracking") {
      const shipmentId = cleanText(payload.shipmentId, 100);
      if (!shipmentId) throw new ValidationError("Choose a shipment to sync.");
      return Response.json({
        ok: true,
        ...(await syncOwnedShipment(account.user.id, shipmentId)),
      });
    }
    throw new ValidationError("Unknown shipping action.");
  } catch (error) {
    return routeError(error, "The shipping request could not be completed.");
  }
}
