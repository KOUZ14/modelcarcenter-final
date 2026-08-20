import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  canLeaveVerifiedFeedback,
  percentage,
  publicCollectorName,
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

test("only completed paid orders qualify for verified feedback", () => {
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "paid",
      fulfillmentStatus: "shipped",
    }),
    true,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "partially_refunded",
      fulfillmentStatus: "delivered",
    }),
    true,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
    }),
    false,
  );
  assert.equal(
    canLeaveVerifiedFeedback({
      paymentStatus: "refunded",
      fulfillmentStatus: "shipped",
    }),
    false,
  );
});

test("public feedback names avoid exposing a buyer's full name", () => {
  assert.equal(publicCollectorName("Avery Morgan"), "Avery M.");
  assert.equal(publicCollectorName("Avery"), "Avery");
  assert.equal(publicCollectorName(""), "Verified collector");
});
