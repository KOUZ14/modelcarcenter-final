export type ProductionConfig = {
  marketplaceMode: "test" | "live";
  siteUrl: string;
  betterAuthSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeConnectWebhookSecret: string;
  shippoApiKey: string;
  shippoWebhookSecret: string;
  resendApiKey: string;
  emailFrom: string;
  supportEmail: string;
};

export type ReadinessCheck = { id: string; label: string; passed: boolean };

function usableSecret(value: string, minimumLength = 20) {
  return value.length >= minimumLength &&
    !/replace[_ -]|change[_ -]?me|development-only|example|placeholder/i.test(value);
}

export function productionReadiness(input: ProductionConfig) {
  let publicOrigin = false;
  try {
    const url = new URL(input.siteUrl);
    publicOrigin = url.protocol === "https:" && url.origin === input.siteUrl &&
      !url.username && !url.password &&
      !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) &&
      !/\.(invalid|example|test|localhost)$/.test(url.hostname);
  } catch { /* Invalid origins fail the check below. */ }

  const checks: ReadinessCheck[] = [
    { id: "live_mode", label: "Live marketplace mode is enabled", passed: input.marketplaceMode === "live" },
    { id: "public_origin", label: "A public HTTPS origin is configured", passed: publicOrigin },
    { id: "auth_secret", label: "A non-placeholder authentication secret is configured", passed: usableSecret(input.betterAuthSecret, 32) },
    { id: "stripe_live_key", label: "A live Stripe API key is configured", passed: /^(sk|rk)_live_/.test(input.stripeSecretKey) && usableSecret(input.stripeSecretKey) },
    { id: "stripe_platform_webhook", label: "The platform Stripe webhook secret is configured", passed: input.stripeWebhookSecret.startsWith("whsec_") && usableSecret(input.stripeWebhookSecret) },
    { id: "stripe_connect_webhook", label: "A separate Connect webhook secret is configured", passed: input.stripeConnectWebhookSecret.startsWith("whsec_") && usableSecret(input.stripeConnectWebhookSecret) && input.stripeConnectWebhookSecret !== input.stripeWebhookSecret },
    { id: "shippo_live_key", label: "A live Shippo API key is configured", passed: input.shippoApiKey.startsWith("shippo_live_") && usableSecret(input.shippoApiKey) },
    { id: "shippo_webhook", label: "A separate shipping webhook secret is configured", passed: usableSecret(input.shippoWebhookSecret, 32) && input.shippoWebhookSecret !== input.shippoApiKey },
    { id: "email_key", label: "Transactional email credentials are configured", passed: input.resendApiKey.startsWith("re_") && usableSecret(input.resendApiKey) },
    { id: "email_sender", label: "Sender and support email addresses are configured", passed: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.supportEmail) && /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/.test(input.emailFrom) && !/example\.(com|org)|resend\.dev/i.test(input.emailFrom + input.supportEmail) },
  ];
  return { configurationReady: checks.every((check) => check.passed), checks };
}

export class LiveCheckoutUnavailable extends Error {
  constructor() {
    super("Checkout is temporarily unavailable while we complete our payment setup. Please try again later.");
    this.name = "LiveCheckoutUnavailable";
  }
}

export function assertLiveCheckoutConfigured(input: ProductionConfig) {
  if (input.marketplaceMode !== "live") return;
  const report = productionReadiness(input);
  if (!report.configurationReady) {
    console.error("Live checkout configuration incomplete", {
      failedChecks: report.checks.filter((check) => !check.passed).map((check) => check.id),
    });
    throw new LiveCheckoutUnavailable();
  }
}

export function assertStripeEventMode(livemode: unknown, secretKey: string) {
  const liveKey = /^(sk|rk)_live_/.test(secretKey);
  const testKey = /^(sk|rk)_test_/.test(secretKey);
  if ((!liveKey && !testKey) || typeof livemode !== "boolean" || livemode !== liveKey) {
    throw new Error("Stripe event mode does not match the configured account.");
  }
}
