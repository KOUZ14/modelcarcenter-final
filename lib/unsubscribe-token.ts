export type UnsubscribeScope = "community" | "hunt" | "restock";
const encoder = new TextEncoder();
const scopes = new Set(["community", "hunt", "restock"]);

async function signingKey(secret: string) {
  if (secret.length < 32) throw new Error("An unsubscribe signing secret is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createUnsubscribeToken(scope: UnsubscribeScope, id: string, secret: string) {
  if (!scopes.has(scope) || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error("Invalid subscription identifier.");
  const payload = `v1.${scope}.${id}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${payload}.${hex}`;
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<{ scope: UnsubscribeScope; id: string } | null> {
  const match = /^v1\.(community|hunt|restock)\.([a-zA-Z0-9-]{1,100})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const signature = Uint8Array.from(match[3].match(/../g)!, (hex) => Number.parseInt(hex, 16));
  const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), signature, encoder.encode(`v1.${match[1]}.${match[2]}`));
  return valid ? { scope: match[1] as UnsubscribeScope, id: match[2] } : null;
}
