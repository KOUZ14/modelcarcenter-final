/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { processResolutionNotifications } from "../lib/resolution-notifications";
import { processEligibleSellerTransfers } from "../lib/seller-transfers";
import { config } from "../lib/config";
import { protectRequest, requestSecurityFailure, securityPath } from "../lib/request-security";
import { pruneSecurityRateLimits } from "../lib/security-rate-limit";
import { logSecurityEvent } from "../lib/security-events";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
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
    try {
      const guarded = await protectRequest(request, {
        database: env.DB,
        siteUrl: config.siteUrl,
        secret: config.betterAuthSecret,
        production: process.env.NODE_ENV === "production",
      });
      if (guarded instanceof Response) return withSecurityHeaders(guarded, request);
      request = guarded;
    } catch (error) {
      return withSecurityHeaders(requestSecurityFailure(error), request);
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
      return withSecurityHeaders(response, request);
    }

    const response = await handler.fetch(request, env, ctx);
    const path = securityPath(request);
    if (path.startsWith("/api/")) {
      if ([401, 403].includes(response.status)) logSecurityEvent("access_denied", { status: response.status });
      if (path.startsWith("/api/admin") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        logSecurityEvent("admin_mutation", { status: response.status });
      }
      if (path.startsWith("/api/auth/") && path !== "/api/auth/get-session") {
        logSecurityEvent("auth_result", { status: response.status });
      }
    }
    return withSecurityHeaders(response, request);
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(runScheduledMaintenance(env.DB, now));
  },
};

async function runScheduledMaintenance(database: D1Database, now: Date) {
  try {
    const [notifications, transfers] = await Promise.all([
      processResolutionNotifications({ database, now }),
      processEligibleSellerTransfers({ database, now }),
      pruneSecurityRateLimits(database, now.getTime()),
    ]);
    console.info(
      "Scheduled marketplace maintenance completed.",
      JSON.stringify({
        scheduledAt: now.toISOString(),
        notifications,
        transfers,
      }),
    );
  } catch (error) {
    console.error("Scheduled marketplace maintenance failed.", error);
    throw error;
  }
}

function withSecurityHeaders(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  );
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  // This application has no cross-origin API consumers. Authentication and
  // private API responses must never enter shared caches or leak link tokens.
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  let path = "";
  try { path = securityPath(request); } catch { /* Rejected malformed path. */ }
  if (path.startsWith("/api/")) headers.set("Cache-Control", "private, no-store");
  if (path.startsWith("/api/auth/")) headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default worker;
