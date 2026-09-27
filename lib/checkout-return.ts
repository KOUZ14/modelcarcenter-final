import { releaseReservation } from "./inventory";
import { expireCheckoutSession, retrieveCheckoutSession } from "./stripe";
import { config } from "./config";

const COOKIE_NAME = "mcc-checkout-return";

export function checkoutReturnCookie(reservationId: string, sessionId = "", token = "") {
  const value = sessionId ? encodeURIComponent(JSON.stringify({ sessionId, token })) : "";
  return `${COOKIE_NAME}-${reservationId}=${value}; Path=/api/checkout; HttpOnly; SameSite=Lax; Max-Age=${sessionId ? 86400 : 0}${config.siteUrl.startsWith("https:") ? "; Secure" : ""}`;
}

export async function closePreviousCheckout(request: Request, reservationId: unknown) {
  if (typeof reservationId !== "string" || !/^[a-f0-9-]{36}$/.test(reservationId)) return;
  const cookieName = `${COOKIE_NAME}-${reservationId}`;
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!value) return;
  let saved: { sessionId?: unknown; token?: unknown };
  try { saved = JSON.parse(decodeURIComponent(value)); } catch { return; }
  if (!saved || typeof saved.sessionId !== "string" || !/^cs_[a-zA-Z0-9_]+$/.test(saved.sessionId) || typeof saved.token !== "string") return;
  let session = await retrieveCheckoutSession(saved.sessionId);
  if (!saved.token || session.metadata?.return_token !== saved.token || session.metadata?.reservation_id !== reservationId) {
    throw new Error("Checkout could not be verified. Please return using the original browser.");
  }
  if (session.status === "open") session = await expireCheckoutSession(session.id);
  if (session.status === "complete" || session.payment_status === "paid") {
    return { completedSessionId: session.id };
  }
  if (session.status !== "expired") throw new Error("Previous checkout could not be closed. Please try again.");
  // Never release inventory while its payment page can still accept payment.
  if (session.metadata?.reservation_id) await releaseReservation(session.metadata.reservation_id);
}
