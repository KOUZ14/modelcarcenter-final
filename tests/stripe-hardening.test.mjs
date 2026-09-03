import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCheckoutSessionBody,
  verifyStripeWebhook,
} from "../lib/stripe.ts";
import {
  disputeIsTerminal,
  disputePayoutDisposition,
} from "../lib/stripe-event-rules.ts";

async function sign(secret, payload, timestamp) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

test("platform and connected-account webhook secrets are isolated", async () => {
  const platformSecret = "whsec_platform_unit_test";
  const connectSecret = "whsec_connect_unit_test";
  const payload = JSON.stringify({
    id: "evt_account_updated",
    type: "account.updated",
    data: { object: {} },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(platformSecret, payload, timestamp);
  const header = `t=${timestamp},v1=${signature}`;

  const event = await verifyStripeWebhook(payload, header, platformSecret);
  assert.equal(event.id, "evt_account_updated");
  await assert.rejects(
    () => verifyStripeWebhook(payload, header, connectSecret),
    /verification failed/,
  );
});

test("checkout sets explicit tax behavior and the shipping tax code", () => {
  const body = buildCheckoutSessionBody({
    reservationId: "reservation-tax",
    sellerId: "seller-tax",
    sellerStripeAccountId: "acct_tax",
    items: [
      {
        title: "1:18 model car",
        description: "",
        imageUrl: null,
        priceCents: 10_000,
        currency: "usd",
        quantity: 1,
      },
    ],
    shippingCents: 1_295,
    marketplaceFeeBps: 700,
    platformFeeCents: 700,
    expiresAt: new Date("2026-08-24T00:00:00.000Z"),
    policyVersion: "2026-08-19",
  });

  assert.equal(
    body.get("line_items[0][price_data][tax_behavior]"),
    "exclusive",
  );
  assert.equal(
    body.get("line_items[1][price_data][product_data][tax_code]"),
    "txcd_92010001",
  );
  assert.equal(
    body.get("line_items[1][price_data][tax_behavior]"),
    "exclusive",
  );
  assert.equal(body.get("payment_intent_data[transfer_data][destination]"), null);
  assert.equal(body.get("metadata[payment_flow]"), "separate");
});

test("disputes hold payout until a safe terminal outcome", () => {
  assert.equal(disputePayoutDisposition("needs_response"), "hold");
  assert.equal(disputePayoutDisposition("under_review"), "hold");
  assert.equal(disputePayoutDisposition("lost"), "cancel");
  assert.equal(disputePayoutDisposition("won"), "release");
  assert.equal(disputePayoutDisposition("prevented"), "release");
  assert.equal(disputePayoutDisposition("warning_closed"), "release");
  assert.equal(disputePayoutDisposition("future_unknown_status"), "hold");
  assert.equal(disputeIsTerminal("lost"), true);
  assert.equal(disputeIsTerminal("needs_response"), false);
});

test("the Connect route uses only the connected-account secret", async () => {
  const [connectRoute, platformRoute] = await Promise.all([
    readFile(
      new URL("../app/api/stripe/webhook-connect/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(connectRoute, /requireConfig\("stripeConnectWebhookSecret"\)/);
  assert.match(connectRoute, /processConnectAccountEvent/);
  assert.doesNotMatch(platformRoute, /stripeConnectWebhookSecret/);
});
