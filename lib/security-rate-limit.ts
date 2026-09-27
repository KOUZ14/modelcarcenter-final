import { isIP } from "node:net";

export type RateLimitRule = { scope: string; max: number; windowSeconds: number };

export function clientRateLimitIdentity(headers: Headers) {
  // Cloudflare overwrites this header at ingress. Never trust client-supplied
  // X-Forwarded-For or X-Real-IP. Missing ingress identity shares a limited bucket.
  const ip = headers.get("cf-connecting-ip") ?? "";
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) === 6) {
    const canonical = new URL(`https://[${ip}]/`).hostname.slice(1, -1);
    const [left, right = ""] = canonical.split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const groups = canonical.includes("::")
      ? [...start, ...Array(8 - start.length - end.length).fill("0"), ...end]
      : start;
    // Group IPv6 clients by /64 so changing an interface address cannot reset limits.
    return groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":");
  }
  return "unknown-ingress";
}

export async function consumeRateLimit(
  database: D1Database,
  rule: RateLimitRule,
  identity: string,
  secret: string,
  now = Date.now(),
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${rule.scope}:${identity}`));
  const identifier = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = now + rule.windowSeconds * 1000;
  // One atomic statement on D1: concurrent Worker instances share the same
  // bounded counter. Rejected attempts do not extend the cooldown.
  const row = await database.prepare(`
    INSERT INTO security_rate_limits (id, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= ? OR count < ?
    RETURNING count
  `).bind(identifier, expiresAt, now, now, now, rule.max).first<{ count: number }>();
  return { allowed: row !== null, retryAfter: rule.windowSeconds };
}

export async function pruneSecurityRateLimits(database: D1Database, now = Date.now()) {
  await database.prepare("DELETE FROM security_rate_limits WHERE expires_at <= ?").bind(now).run();
}
