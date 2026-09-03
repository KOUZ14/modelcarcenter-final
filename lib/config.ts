function textEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(textEnv(name), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function enumEnv<const T extends string>(
  name: string,
  fallback: T,
  allowed: readonly T[],
) {
  const value = textEnv(name, fallback);
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function parseFeeBasisPoints(
  value: string | undefined,
  fallback: number,
  name = "marketplace fee",
) {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be a whole number of basis points.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error(`${name} must be between 0 and 10000 basis points.`);
  }
  return parsed;
}

export const config = {
  siteUrl: textEnv("SITE_URL", "http://localhost:5173").replace(/\/$/, ""),
  supportEmail: textEnv("SUPPORT_EMAIL", "support@modelcarcenter.com"),
  emailFrom: textEnv("EMAIL_FROM", "Model Car Center <support@modelcarcenter.com>"),
  resendApiKey: textEnv("RESEND_API_KEY"),
  betterAuthSecret: textEnv("BETTER_AUTH_SECRET"),
  stripeSecretKey: textEnv("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: textEnv("STRIPE_WEBHOOK_SECRET"),
  stripeConnectWebhookSecret: textEnv("STRIPE_CONNECT_WEBHOOK_SECRET"),
  stripeApiVersion: textEnv("STRIPE_API_VERSION", "2026-02-25.clover"),
  stripeShippingTaxCode: textEnv(
    "STRIPE_SHIPPING_TAX_CODE",
    "txcd_92010001",
  ),
  stripeTaxBehavior: enumEnv(
    "STRIPE_TAX_BEHAVIOR",
    "exclusive",
    ["exclusive", "inclusive"] as const,
  ),
  shippoApiKey: textEnv("SHIPPO_API_KEY"),
  shippoWebhookSecret: textEnv("SHIPPO_WEBHOOK_SECRET"),
  shippoApiVersion: textEnv("SHIPPO_API_VERSION", "2018-02-08"),
  shippoInsuranceThresholdCents: integerEnv(
    "SHIPPO_INSURANCE_THRESHOLD_CENTS",
    25_000,
    0,
    10_000_000,
  ),
  shippoSignatureThresholdCents: integerEnv(
    "SHIPPO_SIGNATURE_THRESHOLD_CENTS",
    75_000,
    0,
    10_000_000,
  ),
  shippoQuoteExpirationMinutes: integerEnv(
    "SHIPPO_QUOTE_EXPIRATION_MINUTES",
    20,
    5,
    1_440,
  ),
  shippoMaxLabelCostCents: integerEnv(
    "SHIPPO_MAX_LABEL_COST_CENTS",
    10_000,
    100,
    1_000_000,
  ),
  collectorMarketplaceFeeBps: parseFeeBasisPoints(
    process.env.COLLECTOR_MARKETPLACE_FEE_BPS,
    850,
    "COLLECTOR_MARKETPLACE_FEE_BPS",
  ),
  professionalMarketplaceFeeBps: parseFeeBasisPoints(
    process.env.PROFESSIONAL_MARKETPLACE_FEE_BPS,
    700,
    "PROFESSIONAL_MARKETPLACE_FEE_BPS",
  ),
  foundingSellerMarketplaceFeeBps: parseFeeBasisPoints(
    process.env.FOUNDING_SELLER_MARKETPLACE_FEE_BPS,
    500,
    "FOUNDING_SELLER_MARKETPLACE_FEE_BPS",
  ),
  foundingSellerPromotionMonths: integerEnv(
    "FOUNDING_SELLER_PROMOTION_MONTHS",
    6,
    1,
    24,
  ),
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
