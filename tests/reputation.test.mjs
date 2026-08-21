import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  canLeaveVerifiedFeedback,
  getVerifiedFeedbackEligibility,
  percentage,
  publicCollectorName,
  VERIFIED_FEEDBACK_WAIT_DAYS,
} from "../lib/reputation-rules.ts";

test("shipment deadlines skip weekends and end on the committed business day", () => {
  const friday = new Date("2026-08-21T15:00:00.000Z");
  assert.equal(
    addBusinessDays(friday, 1).toISOString(),
    "2026-08-24T23:59:59.999Z",
  );
  assert.equal(
    addBusinessDays(friday, 3).toISOString(),
    "2026-08-26T23:59:59.999Z",
  );
});

test("reputation percentages do not invent a score without tracked shipments", () => {
  assert.equal(percentage(0, 0), null);
  assert.equal(percentage(8, 10), 80);
  assert.equal(percentage(2, 3), 67);
});

test("verified feedback waits for delivery instead of opening at shipment", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "paid",
      fulfillmentStatus: "shipped",
      shippedAt: "2026-08-20T10:00:00.000Z",
    }, now),
    false,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "partially_refunded",
      fulfillmentStatus: "delivered",
    }, now),
    true,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
    }, now),
    false,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "refunded",
      fulfillmentStatus: "delivered",
    }, now),
    false,
  );
});

test("verified feedback has a 14-day fallback when delivery tracking never arrives", () => {
  assert.equal(VERIFIED_FEEDBACK_WAIT_DAYS, 14);
  const order = {
    paymentStatus: "paid",
    fulfillmentStatus: "shipped",
    shippedAt: "2026-08-01T12:00:00.000Z",
  };
  const waiting = getVerifiedFeedbackEligibility(
    order,
    new Date("2026-08-15T11:59:59.999Z"),
  );
  assert.deepEqual(waiting, {
    eligible: false,
    eligibleAt: "2026-08-15T12:00:00.000Z",
    basis: "awaiting_delivery",
  });
  assert.equal(
    canLeaveVerifiedFeedback(order, new Date("2026-08-15T12:00:00.000Z")),
    true,
  );
});

test("public feedback names avoid exposing a buyer's full name", () => {
  assert.equal(publicCollectorName("Avery Morgan"), "Avery M.");
  assert.equal(publicCollectorName("Avery"), "Avery");
  assert.equal(publicCollectorName(""), "Verified collector");
});
