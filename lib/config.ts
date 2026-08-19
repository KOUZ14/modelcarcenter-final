function textEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(textEnv(name), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export const config = {
  siteUrl: textEnv("SITE_URL", "http://localhost:5173").replace(/\/$/, ""),
  supportEmail: textEnv("SUPPORT_EMAIL", "help@modelcarcenter.com"),
  emailFrom: textEnv("EMAIL_FROM", "Model Car Center <orders@modelcarcenter.com>"),
  resendApiKey: textEnv("RESEND_API_KEY"),
  betterAuthSecret: textEnv("BETTER_AUTH_SECRET"),
  stripeSecretKey: textEnv("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: textEnv("STRIPE_WEBHOOK_SECRET"),
  stripeApiVersion: textEnv("STRIPE_API_VERSION", "2026-02-25.clover"),
  marketplaceFeeBps: integerEnv("MARKETPLACE_FEE_BPS", 1000, 0, 10_000),
  checkoutExpirationMinutes: integerEnv("CHECKOUT_EXPIRATION_MINUTES", 30, 30, 1_440),
  shippingCountries: textEnv("SHIPPING_COUNTRIES", "US")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean),
  automaticTax: textEnv("STRIPE_AUTOMATIC_TAX", "false").toLowerCase() === "true",
};

export function requireConfig(name: keyof typeof config): string {
  const value = config[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required environment variable for ${name}.`);
  }
  return value;
}
