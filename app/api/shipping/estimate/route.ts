import { estimateProductShipping } from "@/lib/checkout-shipping";
import { readJsonObject, routeError } from "@/lib/http";
import { loadAuthoritativeCart } from "@/lib/inventory";
import { parseEstimateZip } from "@/lib/shipping-rules";
import { ShippoApiError } from "@/lib/shippo";
import { ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJsonObject(request);
    const zip = parseEstimateZip(payload.zip);
    if (typeof payload.productId !== "string" || !payload.productId.trim() || payload.productId.length > 100)
      throw new ValidationError("Choose a product to estimate shipping.");
    const cart = await loadAuthoritativeCart([{ productId: payload.productId, quantity: 1 }]);
    const estimate = await estimateProductShipping(cart, zip);
    return Response.json(estimate, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ShippoApiError)
      return Response.json({ error: "A ZIP-only estimate is unavailable right now. Try again, or enter your complete delivery address in the cart for carrier options." }, { status: 502 });
    const message = error instanceof Error ? error.message : "";
    if (/cart|product|inventory|available|seller|payment/i.test(message))
      return Response.json({ error: message }, { status: 400 });
    return routeError(error, "Shipping could not be estimated. Try again shortly.");
  }
}
