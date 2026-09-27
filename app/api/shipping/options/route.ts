import { getCurrentCollector } from "@/lib/collector-auth";
import { quoteCheckoutShipping } from "@/lib/checkout-shipping";
import { readJsonObject, routeError } from "@/lib/http";
import { loadAuthoritativeCart } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJsonObject(request);
    const collector = await getCurrentCollector(request.headers).catch(() => null);
    const items = Array.isArray(payload.items)
      ? payload.items.slice(0, 25).map((entry) => {
          const item =
            entry && typeof entry === "object"
              ? (entry as Record<string, unknown>)
              : {};
          return {
            productId: String(item.productId ?? ""),
            quantity: Number(item.quantity),
          };
        })
      : [];
    const cart = await loadAuthoritativeCart(items);
    const result = await quoteCheckoutShipping(
      cart,
      payload.destination,
      collector?.user.id ?? null,
      collector?.user.email ?? null,
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cart|product|inventory|available|seller|payment/i.test(message))
      return Response.json({ error: message }, { status: 400 });
    return routeError(error, "Shipping options could not be calculated.");
  }
}
