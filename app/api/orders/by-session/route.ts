import { logSecurityEvent } from "@/lib/security-events";
import { getAuthorizedOrderReceipt } from "@/lib/orders";
import { measureConfirmedPurchase } from "@/lib/measurement";
import { getCollectorAuth } from "@/lib/auth";
import { hasReceiptAccess } from "@/lib/receipt-access";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) return Response.json({ error: "Invalid session." }, { status: 400 });
  try {
    const guestAuthorized = await hasReceiptAccess(request.headers, sessionId, config.betterAuthSecret, config.siteUrl.startsWith("https:"));
    const session = guestAuthorized ? null : await getCollectorAuth().api.getSession({ headers: request.headers });
    if (!guestAuthorized && !session?.user.emailVerified) return Response.json({ error: "Open this receipt in the browser used for checkout, or sign in with your checkout email." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    const order = await getAuthorizedOrderReceipt(sessionId, { guestAuthorized, userId: session?.user.id, verifiedEmail: session?.user.emailVerified ? session.user.email : undefined });
    if (!order && !guestAuthorized) return Response.json({ error: "Receipt unavailable for this account." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    if (!order) return Response.json({ pending: true }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    await measureConfirmedPurchase(request, sessionId, order.items.reduce((sum, item) => sum + item.quantity, 0), order.createdAt);
    return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    logSecurityEvent("operation_failed", { scope: "app/api/orders/by-session/route" });
    return Response.json({ error: "Order confirmation is temporarily unavailable." }, { status: 503 });
  }
}
