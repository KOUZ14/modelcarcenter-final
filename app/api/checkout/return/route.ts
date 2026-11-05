import { logSecurityEvent } from "@/lib/security-events";
import { checkoutReturnCookie, checkoutResponseHeaders, closePreviousCheckout } from "@/lib/checkout-return";
import { config } from "@/lib/config";
import { readJsonObject } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const reservationId = new URL(request.url).searchParams.get("reservation_id") ?? "";
  // A navigation (including a cross-site GET carrying Lax cookies) must never
  // expire a payment session. Closing it requires the return page's button.
  const path = /^[a-f0-9-]{36}$/.test(reservationId)
    ? `/checkout/return?reservation_id=${encodeURIComponent(reservationId)}` : "/cart";
  return new Response(null, { status: 303, headers: { Location: `${config.siteUrl}${path}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    const { reservationId } = await readJsonObject(request);
    const result = await closePreviousCheckout(request, reservationId);
    if (result?.completedSessionId) return Response.json(result, { headers: await checkoutResponseHeaders(String(reservationId), result.completedSessionId) });
    return Response.json(result ?? {}, { headers: {
      "Cache-Control": "no-store",
      ...(typeof reservationId === "string" && /^[a-f0-9-]{36}$/.test(reservationId) ? { "Set-Cookie": checkoutReturnCookie(reservationId) } : {}),
    } });
  } catch {
    logSecurityEvent("operation_failed", { scope: "app/api/checkout/return/route" });
    return Response.json({ error: "Previous checkout could not be closed. Please try again before continuing." }, { status: 503 });
  }
}
