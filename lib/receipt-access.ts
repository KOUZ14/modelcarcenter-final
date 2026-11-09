const RECEIPT_TTL_SECONDS = 24 * 60 * 60;
const validSession = (value: string) => /^cs_[a-zA-Z0-9_]{1,200}$/.test(value);
const encoder = new TextEncoder();

async function receiptKey(secret: string) {
  if (secret.length < 32 || /replace[_ -]|change[_ -]?me|development-only|placeholder/i.test(secret)) throw new Error("Receipt signing is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function cookieName(sessionId: string, secure: boolean) {
  return `${secure ? "__Secure-" : ""}mcc-receipt-${sessionId}`;
}

export async function receiptCookie(sessionId: string, secret: string, secure: boolean, now = Date.now()) {
  if (!validSession(sessionId)) throw new Error("Invalid checkout session.");
  const expires = Math.floor(now / 1000) + RECEIPT_TTL_SECONDS;
  const signature = await crypto.subtle.sign("HMAC", await receiptKey(secret), encoder.encode(`receipt-v1:${sessionId}:${expires}`));
  const hex = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${cookieName(sessionId, secure)}=${expires}.${hex}; Path=/api/orders; HttpOnly; SameSite=Lax; Max-Age=${RECEIPT_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function hasReceiptAccess(headers: Headers, sessionId: string, secret: string, secure: boolean, now = Date.now()) {
  if (!validSession(sessionId)) return false;
  const name = cookieName(sessionId, secure);
  const value = headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const match = value?.match(/^(\d{10})\.([a-f0-9]{64})$/);
  if (!match) return false;
  const seconds = Math.floor(now / 1000), expires = Number(match[1]);
  if (expires <= seconds || expires > seconds + RECEIPT_TTL_SECONDS) return false;
  const signature = Uint8Array.from(match[2].match(/../g)!, pair => parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", await receiptKey(secret), signature, encoder.encode(`receipt-v1:${sessionId}:${expires}`));
}

export function maskedReceiptEmail(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}***@${email.slice(at + 1)}` : "your checkout email";
}
