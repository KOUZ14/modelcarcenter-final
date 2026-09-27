import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLiveCheckoutConfigured,
  assertStripeEventMode,
  LiveCheckoutUnavailable,
  productionReadiness,
} from "../lib/production-readiness.ts";

const configured = {
  marketplaceMode: "live",
  siteUrl: "https://modelcarcenter.com",
  betterAuthSecret: "a-long-random-production-authentication-secret-12345678",
  stripeSecretKey: "sk_live_unit_fixture_1234567890",
  stripeWebhookSecret: "whsec_platform_fixture_1234567890",
  stripeConnectWebhookSecret: "whsec_connect_fixture_1234567890",
  shippoApiKey: "shippo_live_fixture_1234567890",
  shippoWebhookSecret: "shipping-webhook-random-fixture-1234567890",
  resendApiKey: "re_fixture_12345678901234567890",
  emailFrom: "Model Car Center <support@modelcarcenter.com>",
  supportEmail: "support@modelcarcenter.com",
};

test("live configuration needs live payment and shipping keys and separate webhook secrets", () => {
  assert.equal(productionReadiness(configured).configurationReady, true);
  for (const change of [
    { stripeSecretKey: "sk_test_unit_fixture_1234567890" },
    { shippoApiKey: "shippo_test_fixture_1234567890" },
    { stripeConnectWebhookSecret: "" },
    { stripeConnectWebhookSecret: configured.stripeWebhookSecret },
    { shippoWebhookSecret: configured.shippoApiKey },
    { betterAuthSecret: "replace_with_a_long_random_secret_at_least_32_characters" },
    { resendApiKey: "re_replace_me" },
    { emailFrom: "onboarding@resend.dev" },
  ]) {
    assert.equal(productionReadiness({ ...configured, ...change }).configurationReady, false);
  }
});

test("live configuration accepts only public HTTPS origins without paths or credentials", () => {
  for (const siteUrl of ["http://modelcarcenter.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://shop.invalid", "https://modelcarcenter.com/cart", "https://name:password@modelcarcenter.com", "invalid"]) {
    assert.equal(productionReadiness({ ...configured, siteUrl }).configurationReady, false);
  }
});

test("readiness reports never include credential values", () => {
  const serialized = JSON.stringify(productionReadiness(configured));
  for (const key of ["betterAuthSecret", "stripeSecretKey", "stripeWebhookSecret", "stripeConnectWebhookSecret", "shippoApiKey", "shippoWebhookSecret", "resendApiKey"]) {
    assert.equal(serialized.includes(configured[key]), false);
  }
});

test("checkout is blocked before payment work when live credentials are incomplete", () => {
  assert.doesNotThrow(() => assertLiveCheckoutConfigured(configured));
  assert.throws(() => assertLiveCheckoutConfigured({ ...configured, stripeSecretKey: "sk_test_fixture" }), LiveCheckoutUnavailable);
  assert.doesNotThrow(() => assertLiveCheckoutConfigured({ ...configured, marketplaceMode: "test", stripeSecretKey: "sk_test_fixture" }));
});

test("signed Stripe events cannot cross between live and test account modes", () => {
  assert.doesNotThrow(() => assertStripeEventMode(true, "sk_live_fixture"));
  assert.doesNotThrow(() => assertStripeEventMode(true, "rk_live_fixture"));
  assert.doesNotThrow(() => assertStripeEventMode(false, "sk_test_fixture"));
  for (const [mode, key] of [[false, "sk_live_fixture"], [true, "sk_test_fixture"], [undefined, "sk_live_fixture"], ["true", "sk_live_fixture"], [true, ""]]) {
    assert.throws(() => assertStripeEventMode(mode, key), /mode does not match/);
  }
});
