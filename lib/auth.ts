import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { getD1, getDb } from "@/db";
import * as schema from "@/db/schema";
import { config } from "./config";
import { sendAuthMagicLinkEmail } from "./email";
import { collectorAuthPolicy, secureAuthCookiesFor, trustedAuthOriginsFor } from "./auth-policy";
import { consumeRateLimit } from "./security-rate-limit";
import { logSecurityEvent } from "./security-events";

let collectorAuth: ReturnType<typeof createCollectorAuth> | undefined;

function createCollectorAuth() {
  const secret =
    config.betterAuthSecret ||
    "development-only-model-car-center-secret-change-me";
  return betterAuth({
    appName: "Model Car Center",
    baseURL: config.siteUrl,
    secret,
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        ...schema,
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    trustedOrigins: trustedAuthOriginsFor(config.siteUrl, process.env.NODE_ENV),
    emailAndPassword: { enabled: false },
    // Worker ingress adds atomic D1 limits across instances. Keep Better Auth's
    // own endpoint limits as an additional layer, including during development.
    rateLimit: { enabled: true },
    session: {
      expiresIn: collectorAuthPolicy.sessionExpiresInSeconds,
      updateAge: collectorAuthPolicy.sessionUpdateAgeSeconds,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "mcc",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: secureAuthCookiesFor(process.env.NODE_ENV),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: collectorAuthPolicy.cookieSameSite,
        secure: secureAuthCookiesFor(process.env.NODE_ENV),
        path: "/",
      },
    },
    plugins: [
      magicLink({
        expiresIn: collectorAuthPolicy.magicLinkExpiresInSeconds,
        storeToken: collectorAuthPolicy.magicLinkTokenStorage,
        async sendMagicLink({ email, url }) {
          const normalizedEmail = email.trim().toLowerCase();
          const decision = await consumeRateLimit(getD1(), {
            scope: "magic-link-email", max: 3, windowSeconds: 600,
          }, normalizedEmail, secret);
          logSecurityEvent("magic_link_requested");
          // Same success response whether an account exists or email delivery
          // is suppressed by the cooldown. Never lock the account itself.
          if (!decision.allowed) {
            logSecurityEvent("rate_limited", { scope: "magic-link-email" });
            return;
          }
          try {
            const delivery = await sendAuthMagicLinkEmail({ email: normalizedEmail, url });
            if (!delivery.sent) logSecurityEvent("magic_link_delivery_failed");
          } catch {
            logSecurityEvent("magic_link_delivery_failed");
          }
        },
      }),
    ],
  });
}

export function getCollectorAuth() {
  if (process.env.NODE_ENV === "production" && (
    config.betterAuthSecret.length < 32 || /replace[_ -]|change[_ -]?me|development-only|placeholder/i.test(config.betterAuthSecret)
  )) {
    throw new Error(
      "A strong BETTER_AUTH_SECRET is required for collector authentication.",
    );
  }
  collectorAuth ??= createCollectorAuth();
  return collectorAuth;
}

export type CollectorSession = ReturnType<
  typeof getCollectorAuth
>["$Infer"]["Session"];
