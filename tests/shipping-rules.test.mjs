import assert from "node:assert/strict";
import test from "node:test";
import {
  handlingReminder,
  highValueShippingRules,
  combinePackages,
  mapShippoTrackingStatus,
  parseParcel,
  rateMeetsShippingRequirement,
  selectBuyerRates,
  shippingAddressKey,
} from "../lib/shipping-rules.ts";
import { ValidationError } from "../lib/validation.ts";

test("high-value rules automatically require insurance and signature", () => {
  assert.deepEqual(highValueShippingRules(24_999, 25_000, 75_000), {
    declaredValueCents: 24_999,
    insuranceRequired: false,
    signatureRequired: false,
  });
  assert.deepEqual(highValueShippingRules(75_000, 25_000, 75_000), {
    declaredValueCents: 75_000,
    insuranceRequired: true,
    signatureRequired: true,
  });
  assert.equal(
    highValueShippingRules(50_000, 75_000, 50_000).insuranceRequired,
    true,
  );
});

test("cart packages combine conservatively across quantities", () => {
  assert.deepEqual(
    combinePackages(
      [
        {
          quantity: 2,
          packageLength: "10",
          packageWidth: "8",
          packageHeight: "3",
          packageWeight: "1.25",
        },
        {
          quantity: 1,
          packageLength: null,
          packageWidth: null,
          packageHeight: null,
          packageWeight: null,
        },
      ],
      { length: "12", width: "9", height: "4", weight: "2" },
    ),
    { length: "12", width: "9", height: "10", weight: "4.5" },
  );
});

test("buyer rate choices include economical and faster services", () => {
  const rates = [
    { id: "ground", provider: "A", serviceToken: "ground", amountCents: 800, estimatedDays: 5 },
    { id: "priority", provider: "A", serviceToken: "priority", amountCents: 1400, estimatedDays: 2 },
    { id: "overnight", provider: "B", serviceToken: "overnight", amountCents: 3000, estimatedDays: 1 },
    { id: "duplicate", provider: "A", serviceToken: "ground", amountCents: 900, estimatedDays: 5 },
  ];
  const selected = selectBuyerRates(rates);
  assert.equal(selected.length, 3);
  assert.ok(selected.some((rate) => rate.id === "ground"));
  assert.ok(selected.some((rate) => rate.id === "overnight"));
  assert.ok(!selected.some((rate) => rate.id === "duplicate"));
});

test("fulfillment rates may match or improve but cannot downgrade buyer service", () => {
  const requirement = {
    carrier: "USPS",
    serviceToken: "priority",
    estimatedDays: 3,
  };
  assert.equal(
    rateMeetsShippingRequirement(
      { provider: "USPS", serviceToken: "priority", estimatedDays: null },
      requirement,
    ),
    true,
  );
  assert.equal(
    rateMeetsShippingRequirement(
      { provider: "UPS", serviceToken: "two_day", estimatedDays: 2 },
      requirement,
    ),
    true,
  );
  assert.equal(
    rateMeetsShippingRequirement(
      { provider: "UPS", serviceToken: "ground", estimatedDays: 5 },
      requirement,
    ),
    false,
  );
});

test("parcel dimensions accept bounded decimals and reject invalid packages", () => {
  assert.deepEqual(
    parseParcel({ length: "12.50", width: "9", height: "6.25", weight: "2" }),
    { length: "12.5", width: "9", height: "6.25", weight: "2" },
  );
  assert.throws(
    () => parseParcel({ length: "0", width: "9", height: "6", weight: "2" }),
    ValidationError,
  );
  assert.throws(
    () => parseParcel({ length: "12", width: "9", height: "6", weight: "150.01" }),
    ValidationError,
  );
});

test("combined shipping address keys bind the normalized address to buyer identity", () => {
  const address = JSON.stringify({
    name: "Ada Collector",
    address: {
      line1: "1 Model Way",
      city: "Portland",
      state: "or",
      postal_code: "97201",
      country: "us",
    },
  });
  assert.equal(
    shippingAddressKey(address, "Ada@Example.com"),
    shippingAddressKey(address, "ada@example.com"),
  );
  assert.notEqual(
    shippingAddressKey(address, "ada@example.com"),
    shippingAddressKey(address, "another@example.com"),
  );
});

test("handling reminders remain active after label creation until carrier acceptance", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  assert.equal(
    handlingReminder(
      {
        paymentStatus: "paid",
        fulfillmentStatus: "processing",
        shipByAt: "2026-08-20T23:59:59.999Z",
      },
      now,
    ).level,
    "due_today",
  );
  assert.equal(
    handlingReminder(
      {
        paymentStatus: "paid",
        fulfillmentStatus: "shipped",
        shipByAt: "2026-08-19T23:59:59.999Z",
      },
      now,
    ).level,
    "none",
  );
});

test("Shippo tracking statuses map to marketplace shipment states", () => {
  assert.equal(mapShippoTrackingStatus("TRANSIT"), "in_transit");
  assert.equal(mapShippoTrackingStatus("DELIVERED"), "delivered");
  assert.equal(mapShippoTrackingStatus("not_a_status"), "unknown");
});
