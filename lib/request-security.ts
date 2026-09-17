import { logSecurityEvent } from "./security-events.ts";
import { clientRateLimitIdentity, consumeRateLimit, type RateLimitRule } from "./security-rate-limit.ts";

const KiB = 1024;
const MiB = 1024 * KiB;
const webhookPaths = new Set(["/api/stripe/webhook", "/api/stripe/webhook-connect", "/api/shippo/webhook"]);

export class RequestSecurityError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(reason);
    this.status = status;
    this.reason = reason;
  }
}

export function securityPath(request: Request) {
  try {
    return decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "") || "/";
  } catch {
    throw new RequestSecurityError(400, "invalid_path");
  }
}

export function isWebhookRequest(request: Request) {
  return request.method === "POST" && webhookPaths.has(securityPath(request));
}

export function assertRequestOrigin(request: Request, siteUrl: string, production: boolean) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || isWebhookRequest(request)) return;
  const expected = new URL(production ? siteUrl : request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let source: string | null = origin;
  if (!source && referer) {
    try { source = new URL(referer).origin; } catch { /* Fail closed below. */ }
  }
  if (source !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestSecurityError(403, "invalid_origin");
  }
}

export function requestBodyLimit(request: Request) {
  const path = securityPath(request);
  if (path.startsWith("/api/auth/")) return 16 * KiB;
  if (path === "/api/addresses/autocomplete") return 4 * KiB;
  if (webhookPaths.has(path)) return MiB;
  const multipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");
  if (multipart && ["/api/listings/images", "/api/admin/images", "/api/resolution"].includes(path)) return 11 * MiB;
  // Room for the existing 5 MB CSV import and JSON framing.
  if (["/api/admin", "/api/store"].includes(path)) return 6 * MiB;
  return 64 * KiB;
}

export async function boundRequestBody(request: Request, limit = requestBodyLimit(request)) {
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") throw new RequestSecurityError(415, "unsupported_content_encoding");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new RequestSecurityError(413, "body_too_large");
  }
  if (!request.body) return request;
  // Read the stream with a byte counter BEFORE JSON/multipart parsing or side
  // effects; Content-Length can be absent or dishonest. Do not clone/tee it.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => undefined);
        throw new RequestSecurityError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request, { body: bytes });
}

export function requestRateRules(request: Request): RateLimitRule[] {
  const path = securityPath(request);
  if (!path.startsWith("/api/") || isWebhookRequest(request) || request.method === "OPTIONS") return [];
  const rules: RateLimitRule[] = [{ scope: "api", max: 300, windowSeconds: 60 }];
  if (path.startsWith("/api/auth/") && !["/api/auth/get-session", "/api/auth/ok"].includes(path)) {
    rules.push({ scope: "authentication", max: 20, windowSeconds: 60 });
    if (request.method === "POST" && path === "/api/auth/sign-in/magic-link") {
      rules.push({ scope: "magic-link-ip", max: 5, windowSeconds: 600 });
    }
  } else if (["/api/community", "/api/model-hunts", "/api/seller-applications", "/api/availability-alerts"].includes(path)) {
    rules.push({ scope: "public-submissions", max: 10, windowSeconds: 600 });
  } else if (path === "/api/checkout") {
    rules.push({ scope: "checkout", max: 10, windowSeconds: 60 });
  } else if (path === "/api/addresses/autocomplete" || path.startsWith("/api/shipping")) {
    rules.push({ scope: "shipping-address", max: 60, windowSeconds: 60 });
  }
  return rules;
}

export async function protectRequest(request: Request, options: { database: D1Database; siteUrl: string; secret: string; production: boolean }) {
  assertRequestOrigin(request, options.siteUrl, options.production);
  // Reject declared oversized payloads without database work.
  const length = request.headers.get("content-length");
  if (length && Number(length) > requestBodyLimit(request)) throw new RequestSecurityError(413, "body_too_large");
  const rules = requestRateRules(request);
  if (rules.length && options.production && !options.secret) throw new Error("Security secret unavailable");
  for (const rule of rules) {
    const decision = await consumeRateLimit(options.database, rule, clientRateLimitIdentity(request.headers), options.secret || "local-development-security");
    if (!decision.allowed) {
      logSecurityEvent("rate_limited", { scope: rule.scope, status: 429 });
      return Response.json({ error: "Too many requests. Please try again later." }, {
        status: 429, headers: { "Retry-After": String(decision.retryAfter), "Cache-Control": "no-store" },
      });
    }
  }
  return boundRequestBody(request);
}

export function requestSecurityFailure(error: unknown) {
  const status = error instanceof RequestSecurityError ? error.status : 503;
  logSecurityEvent(error instanceof RequestSecurityError ? "request_rejected" : "security_control_unavailable", {
    status, reason: error instanceof RequestSecurityError ? error.reason : "request_guard_failed",
  });
  const messages: Record<number, string> = {
    400: "Invalid request.", 403: "Invalid request origin.", 413: "Request body is too large.",
    415: "Unsupported request encoding.", 503: "This service is temporarily unavailable. Please try again later.",
  };
  return Response.json({ error: messages[status] }, { status, headers: { "Cache-Control": "no-store" } });
}
