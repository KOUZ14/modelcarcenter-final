const encoder = new TextEncoder();

export async function verifyShippoSignature(raw: string, signature: string | null, secret: string, now = Date.now()) {
  if (!secret || !signature || signature.length > 512) return false;
  const entries = signature.split(",").map(part => part.trim());
  const timestamps = entries.filter(part => /^t=\d{10}$/.test(part));
  const signatures = entries.filter(part => /^v1=[a-fA-F0-9]{64}$/.test(part));
  if (timestamps.length !== 1 || signatures.length !== 1 || entries.length !== 2) return false;
  const timestamp = timestamps[0].slice(2);
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const bytes = Uint8Array.from(signatures[0].slice(3).match(/../g)!, pair => parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${raw}`));
}
