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

export function trustedAuthOriginsFor(siteUrl: string, nodeEnv: string | undefined) {
  const site = new URL(siteUrl);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (nodeEnv !== "development" || !loopbackHosts.includes(site.hostname)) {
    return [site.origin];
  }
  // Vite can be opened through any loopback address. Trust only those aliases
  // with the configured protocol and port; never expand the production list.
  return loopbackHosts.map((hostname) => {
    const origin = new URL(site.origin);
    origin.hostname = hostname;
    return origin.origin;
  });
}
