import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFeeBasisPoints } from "../lib/config.ts";
import {
  calculateMarketplaceFeeForSeller,
  determineMarketplaceFee,
  foundingSellerRatePeriod,
  isEligibleForFoundingSellerRate,
} from "../lib/fees.ts";
import { buildCheckoutSessionBody } from "../lib/stripe.ts";

const rates = {
  collectorMarketplaceFeeBps: 850,
  professionalMarketplaceFeeBps: 700,
  foundingSellerMarketplaceFeeBps: 500,
};
const duringPromotion = new Date("2026-04-01T00:00:00.000Z");

test("collector sellers receive 8.5% and cannot receive the founding-store rate", () => {
  const fee = determineMarketplaceFee(
    {
      sellerType: "collector",
      isFoundingSeller: true,
      foundingRateStartsAt: "2026-01-01T00:00:00.000Z",
      foundingRateEndsAt: "2026-07-01T00:00:00.000Z",
    },
    duringPromotion,
    rates,
  );
  assert.equal(fee.marketplaceFeeBps, 850);
  assert.equal(fee.rateKind, "collector");
  assert.equal(fee.foundingPromotionActive, false);
  assert.equal(isEligibleForFoundingSellerRate({ sellerType: "collector" }), false);
});

test("professional sellers receive the 7% standard rate", () => {
  const fee = determineMarketplaceFee(
    { sellerType: "professional", isFoundingSeller: false },
    duringPromotion,
    rates,
  );
  assert.equal(fee.marketplaceFeeBps, 700);
  assert.equal(fee.rateKind, "professional");
});

test("active founding professional sellers receive 5%", () => {
  const fee = determineMarketplaceFee(
    {
      sellerType: "professional",
      isFoundingSeller: true,
      foundingRateStartsAt: "2026-01-01T00:00:00.000Z",
      foundingRateEndsAt: "2026-07-01T00:00:00.000Z",
    },
    duringPromotion,
    rates,
  );
  assert.equal(fee.marketplaceFeeBps, 500);
  assert.equal(fee.foundingPromotionActive, true);
});

test("expired founding professional sellers automatically return to 7%", () => {
  const fee = determineMarketplaceFee(
    {
      sellerType: "professional",
      isFoundingSeller: true,
      foundingRateStartsAt: "2026-01-01T00:00:00.000Z",
      foundingRateEndsAt: "2026-07-01T00:00:00.000Z",
    },
    new Date("2026-07-01T00:00:00.000Z"),
    rates,
  );
  assert.equal(fee.marketplaceFeeBps, 700);
  assert.equal(fee.foundingPromotionActive, false);
});

test("fee calculations round integer cents and use item subtotal only", () => {
  assert.equal(
    calculateMarketplaceFeeForSeller(
      19_999,
      { sellerType: "collector" },
      duringPromotion,
      rates,
    ).platformFeeCents,
    1_700,
  );
  assert.equal(
    calculateMarketplaceFeeForSeller(
      20_000,
      {
        sellerType: "professional",
        isFoundingSeller: true,
        foundingRateStartsAt: "2026-01-01T00:00:00.000Z",
        foundingRateEndsAt: "2026-07-01T00:00:00.000Z",
      },
      duringPromotion,
      rates,
    ).platformFeeCents,
    1_000,
  );
});

test("founding rate periods use six calendar months", () => {
  assert.deepEqual(
    foundingSellerRatePeriod("2026-01-31T12:00:00.000Z", 6),
    {
      startsAt: "2026-01-31T12:00:00.000Z",
      endsAt: "2026-07-31T12:00:00.000Z",
    },
  );
});

test("fee configuration parses safe values, defaults only when absent, and rejects invalid values", () => {
  assert.equal(parseFeeBasisPoints(undefined, 850), 850);
  assert.equal(parseFeeBasisPoints(" 700 ", 850), 700);
  assert.throws(() => parseFeeBasisPoints("8.5", 850), /whole number/);
  assert.throws(() => parseFeeBasisPoints("-1", 850), /whole number/);
  assert.throws(() => parseFeeBasisPoints("10001", 850), /between 0 and 10000/);
});

test("Stripe Checkout receives the server-calculated application fee", () => {
  const body = buildCheckoutSessionBody({
    reservationId: "reservation-1",
    sellerId: "seller-1",
    sellerStripeAccountId: "acct_123",
    items: [
      {
        title: "Model car",
        description: "",
        imageUrl: null,
        priceCents: 20_000,
        currency: "usd",
        quantity: 1,
      },
    ],
    shippingCents: 1_000,
    marketplaceFeeBps: 500,
    platformFeeCents: 1_000,
    expiresAt: new Date("2026-08-20T00:00:00.000Z"),
    policyVersion: "2026-08-19",
  });
  assert.equal(body.get("payment_intent_data[application_fee_amount]"), "1000");
  assert.equal(body.get("metadata[marketplace_fee_bps]"), "500");
  assert.equal(body.get("payment_intent_data[transfer_data][destination]"), "acct_123");
});

test("checkout ignores browser-supplied fee values and historical orders copy the reservation snapshot", async () => {
  const checkout = await readFile(
    new URL("../app/api/checkout/route.ts", import.meta.url),
    "utf8",
  );
  const orders = await readFile(
    new URL("../lib/orders.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../drizzle/0003_lush_grim_reaper.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(checkout, /payload\.(?:marketplace|platform|application).*fee/i);
  assert.match(checkout, /loadAuthoritativeCart\(requested\)/);
  assert.match(orders, /reservation\.marketplaceFeeBps/);
  assert.match(orders, /reservation\.platformFeeCents/);
  assert.match(migration, /`marketplace_fee_bps` integer DEFAULT 1000 NOT NULL/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.match(migration, /orders` ADD `marketplace_fee_bps` integer DEFAULT 1000 NOT NULL/);
});

test("checkout reservation SQL has one placeholder for every bound value", async () => {
  const inventory = await readFile(
    new URL("../lib/inventory.ts", import.meta.url),
    "utf8",
  );
  const reservationSql = inventory.match(
    /INSERT INTO checkout_reservations[\s\S]*?CURRENT_TIMESTAMP, \?\)`/,
  );
  assert.ok(reservationSql, "checkout reservation insert should be present");
  assert.equal(
    reservationSql[0].match(/\?/g)?.length,
    18,
    "reservation insert and bind arguments must stay aligned",
  );
});
