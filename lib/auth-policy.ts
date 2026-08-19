export const collectorAuthPolicy = {
  magicLinkExpiresInSeconds: 10 * 60,
  magicLinkTokenStorage: "hashed" as const,
  sessionExpiresInSeconds: 30 * 24 * 60 * 60,
  sessionUpdateAgeSeconds: 24 * 60 * 60,
  cookieSameSite: "lax" as const,
};

export function secureAuthCookiesFor(nodeEnv: string | undefined) {
  return nodeEnv === "production";
}
