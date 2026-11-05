/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { processShippingDelays, deliverLegalNotices } from "../lib/consumer-shipping";
import { processSellerCompliance } from "../lib/seller-compliance";
import { reconcileCounterNotices } from "../lib/compliance-admin";
import { processResolutionNotifications } from "../lib/resolution-notifications";
import { processEligibleSellerTransfers } from "../lib/seller-transfers";
import { config } from "../lib/config";
import { protectRequest, requestSecurityFailure, securityPolicyPath } from "../lib/request-security";
import { pruneSecurityRateLimits } from "../lib/security-rate-limit";
import { pruneMeasurementRecords } from "../lib/measurement-retention";
import { logSecurityEvent } from "../lib/security-events";
import { processPreorders } from "../lib/preorder-maintenance";
import { processPromotions } from "../lib/promotion-payments";
import { expireCollectionOffersIn } from "../lib/collection-offer-maintenance";
import { requestWithScriptNonce } from "../lib/content-security-policy";
import { pruneManagedUploads } from "../lib/managed-uploads";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: R2Bucket & {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const security = requestWithScriptNonce(request, process.env.NODE_ENV === "production");
    request = security.request;
    try {
      const guarded = await protectRequest(request, {
        database: env.DB,
        siteUrl: config.siteUrl,
        secret: config.betterAuthSecret,
        production: process.env.NODE_ENV === "production",
      });
      if (guarded instanceof Response) return withSecurityHeaders(guarded, request, security.policy);
      request = guarded;
    } catch (error) {
      return withSecurityHeaders(requestSecurityFailure(error), request, security.policy);
    }
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, request, security.policy);
    }

    const response = await handler.fetch(request, env, ctx);
    const path = securityPolicyPath(request);
    if (path.startsWith("/api/")) {
      if ([401, 403].includes(response.status)) logSecurityEvent("access_denied", { status: response.status });
      if (path.startsWith("/api/admin") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        logSecurityEvent("admin_mutation", { status: response.status });
      }
      if (path.startsWith("/api/auth/") && path !== "/api/auth/get-session") {
        logSecurityEvent("auth_result", { status: response.status });
      }
    }
    return withSecurityHeaders(response, request, security.policy);
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(runScheduledMaintenance(env.DB, env.IMAGES, now));
  },
};

async function runScheduledMaintenance(database: D1Database, storage: R2Bucket, now: Date) {
  try {
    await processShippingDelays(now);
    await processSellerCompliance(now);
    await deliverLegalNotices();
    await reconcileCounterNotices();
    const [notifications, transfers, , , promotions] = await Promise.all([
      processResolutionNotifications({ database, now }),
      processEligibleSellerTransfers({ database, now }),
      pruneSecurityRateLimits(database, now.getTime()),
      processPreorders(),
      processPromotions(now.getTime()),
      expireCollectionOffersIn(database,now.getTime()),
      pruneMeasurementRecords(database, now),
      pruneManagedUploads(database, storage, now.getTime()),
    ]);
    console.info(
      "Scheduled marketplace maintenance completed.",
      JSON.stringify({
        scheduledAt: now.toISOString(),
        notifications,
        transfers,
        promotions,
      }),
    );
  } catch (error) {
    logSecurityEvent("operation_failed", { scope: "scheduled-maintenance" });
    throw error;
  }
}

function withSecurityHeaders(response: Response, request: Request, policy: string) {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    policy,
  );
  const routePolicy = response.headers.get("Content-Security-Policy");
  if (routePolicy) headers.append("Content-Security-Policy", routePolicy);
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  // Preserve stricter policies on private downloads and provider redirects.
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  // This application has no cross-origin API consumers. Authentication and
  // private API responses must never enter shared caches or leak link tokens.
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  let path = "";
  try { path = securityPolicyPath(request); } catch { /* Rejected malformed path. */ }
  const privatePath = /^\/(api|account|admin|store|resolution|sell|cart|wishlist|checkout|sign-in|unsubscribe|community|collectors|collection|profile|messages|notifications|search)(\/|$)/.test(path);
  const personalized = request.headers.has("cookie") || request.headers.has("authorization") ||
    request.headers.has("oai-authenticated-user-email") || headers.has("set-cookie");
  const nonceDocument = headers.get("content-type")?.includes("text/html") || headers.get("content-type")?.includes("text/x-component");
  if (privatePath || personalized || nonceDocument) {
    headers.set("Cache-Control", "private, no-store");
    // CDN-specific policies take precedence over Cache-Control at some hosts.
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    headers.set("Surrogate-Control", "no-store");
  }
  // These documents/redirects carry bearer links in their URLs. Do not send
  // those URLs as Referer even on subsequent same-origin requests.
  if (/^\/(?:api\/(?:auth|checkout|orders\/by-session|unsubscribe)|checkout|sign-in|unsubscribe)(\/|$)/.test(path)) {
    headers.set("Referrer-Policy", "no-referrer");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default worker;
