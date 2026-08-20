import { requireCollectorApi } from "@/lib/collector-auth";
import { routeError } from "@/lib/http";
import { getOwnedLabelUrl } from "@/lib/shipping";
import { ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  try {
    const shipmentId = new URL(request.url).searchParams.get("shipment_id")?.trim();
    if (!shipmentId || shipmentId.length > 100)
      throw new ValidationError("Invalid shipment.");
    const labelUrl = await getOwnedLabelUrl(account.user.id, shipmentId);
    return new Response(null, {
      status: 302,
      headers: {
        Location: labelUrl,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return routeError(error, "The shipping label is unavailable.");
  }
}
