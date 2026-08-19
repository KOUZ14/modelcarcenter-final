import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { config } from "./config";
import { sendAuthMagicLinkEmail } from "./email";
import { collectorAuthPolicy, secureAuthCookiesFor } from "./auth-policy";

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
    trustedOrigins: [config.siteUrl],
    session: {
      expiresIn: collectorAuthPolicy.sessionExpiresInSeconds,
      updateAge: collectorAuthPolicy.sessionUpdateAgeSeconds,
    },
    advanced: {
      cookiePrefix: "mcc",
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
          const delivery = await sendAuthMagicLinkEmail({ email, url });
          if (!delivery.sent) {
            throw new Error("Magic-link email delivery is not configured.");
          }
        },
      }),
    ],
  });
}

export function getCollectorAuth() {
  if (process.env.NODE_ENV === "production" && !config.betterAuthSecret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required for collector authentication.",
    );
  }
  collectorAuth ??= createCollectorAuth();
  return collectorAuth;
}

export type CollectorSession = ReturnType<
  typeof getCollectorAuth
>["$Infer"]["Session"];
