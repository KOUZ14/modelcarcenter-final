import { checkoutReturnCookie, closePreviousCheckout } from "@/lib/checkout-return";
import { config } from "@/lib/config";
import { readJsonObject } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const reservationId = new URL(request.url).searchParams.get("reservation_id") ?? "";
  try {
    const result = await closePreviousCheckout(request, reservationId);
    const path = result?.completedSessionId
      ? `/checkout/success?session_id=${encodeURIComponent(result.completedSessionId)}`
      : "/cart?checkout=cancelled";
    return new Response(null, { status: 303, headers: {
      Location: `${config.siteUrl}${path}`, "Cache-Control": "no-store",
      ...(/^[a-f0-9-]{36}$/.test(reservationId) ? { "Set-Cookie": checkoutReturnCookie(reservationId) } : {}),
    } });
  } catch (error) {
    console.error("Unable to close returned checkout", error);
    return new Response(null, { status: 303, headers: {
      Location: `${config.siteUrl}/cart?checkout=retry`, "Cache-Control": "no-store",
    } });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    const { reservationId } = await readJsonObject(request);
    const result = await closePreviousCheckout(request, reservationId);
    return Response.json(result ?? {}, { headers: {
      "Cache-Control": "no-store",
      ...(typeof reservationId === "string" && /^[a-f0-9-]{36}$/.test(reservationId) ? { "Set-Cookie": checkoutReturnCookie(reservationId) } : {}),
    } });
  } catch (error) {
    console.error("Unable to close previous checkout", error);
    return Response.json({ error: "Previous checkout could not be closed. Please try again before continuing." }, { status: 503 });
  }
}
