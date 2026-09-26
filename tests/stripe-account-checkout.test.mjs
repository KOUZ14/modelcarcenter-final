import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../lib/config.ts";
import { assertSellerPaymentsReady, retrieveStripeAccount, StripeApiError } from "../lib/stripe.ts";
import { ValidationError } from "../lib/validation.ts";

test("checkout handles unavailable seller accounts without hiding diagnostics or exposing credentials", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const originalKey = config.stripeSecretKey;
  const logs = [], requests = [];
  let status = 200, body = { charges_enabled: true, payouts_enabled: true };
  config.stripeSecretKey = "sk_test_account_error_fixture";
  console.error = (...args) => logs.push(args);
  globalThis.fetch = async (url, init) => {
    requests.push({ url, method: init.method });
    assert.equal(url, "https://api.stripe.com/v1/accounts/acct_fixture");
    assert.equal(init.method, "GET", "Checking a seller must never create a payment");
    return Response.json(body, { status, headers: { "Request-Id": "req_fixture" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; console.error = originalLog; config.stripeSecretKey = originalKey; });

  await assertSellerPaymentsReady("acct_fixture", "Apex");

  status = 400;
  body = { error: { type: "api_error", message: "The account acct_fixture was a test account created with a testmode key, and therefore can only be used with testmode keys." } };
  await assert.rejects(() => assertSellerPaymentsReady("acct_fixture", "Apex"), (error) =>
    error instanceof ValidationError && /Apex.*test payment account.*complete live payment setup/.test(error.message));

  status = 200;
  body = { charges_enabled: true, payouts_enabled: false };
  await assert.rejects(() => assertSellerPaymentsReady("acct_fixture", "Apex"), (error) =>
    error instanceof ValidationError && /Apex.*complete payment setup.*cart is kept/.test(error.message));

  status = 404;
  body = { error: { type: "invalid_request_error", code: "resource_missing", message: "No such account: acct_fixture" } };
  await assert.rejects(() => assertSellerPaymentsReady("acct_fixture", "Apex"), (error) =>
    error instanceof ValidationError && /Apex.*payment connection needs attention/.test(error.message));
  assert.equal(logs.at(-1)[1].code, "resource_missing");
  assert.equal(logs.at(-1)[1].requestId, "req_fixture");

  status = 403;
  body = { error: { type: "invalid_request_error", code: "account_invalid", message: "The account is not connected to this platform" } };
  await assert.rejects(() => assertSellerPaymentsReady("acct_fixture", "Apex"), /payment connection needs attention/);

  status = 401;
  body = { error: { type: "invalid_request_error", message: `Invalid API Key provided: ${config.stripeSecretKey}` } };
  await assert.rejects(() => retrieveStripeAccount("acct_fixture"), (error) =>
    error instanceof StripeApiError && error.status === 401 && error.requestId === "req_fixture" && !error.message.includes(config.stripeSecretKey));
  await assert.rejects(() => assertSellerPaymentsReady("acct_fixture", "Apex"), { message: "Payments are temporarily unavailable. Please try again later." });
  assert.ok(!JSON.stringify(logs).includes(config.stripeSecretKey));
  assert.ok(requests.every((request) => request.method === "GET"));
});
