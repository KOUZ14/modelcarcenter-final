import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  canReportOrderProblem,
  makeCaseNumber,
  makeReturnAuthorizationNumber,
  remainingRefundableCents,
  reportDeadlineForOrder,
} from "../lib/protection.ts";

test("protection reporting windows use delivery plus three days with non-delivery fallbacks", () => {
  const delivered = reportDeadlineForOrder({
    createdAt: "2026-07-01T12:00:00.000Z",
    paidAt: "2026-07-01T12:00:00.000Z",
    shippedAt: "2026-07-04T12:00:00.000Z",
    deliveredAt: "2026-07-09T18:30:00.000Z",
  });
  assert.equal(delivered, "2026-07-12T18:30:00.000Z");
  const shipped = reportDeadlineForOrder({
    createdAt: "2026-07-01T12:00:00.000Z",
    paidAt: "2026-07-01T12:00:00.000Z",
    shippedAt: "2026-07-04T12:00:00.000Z",
  });
  assert.equal(shipped, "2026-08-03T12:00:00.000Z");
  const unshipped = reportDeadlineForOrder({
    createdAt: "2026-07-01T12:00:00.000Z",
    paidAt: "2026-07-01T12:00:00.000Z",
  });
  assert.equal(unshipped, "2026-08-15T12:00:00.000Z");
});

test("case eligibility enforces the window and remaining paid balance", () => {
  const order = {
    paymentStatus: "partially_refunded",
    totalCents: 20_000,
    refundedAmountCents: 5_000,
    createdAt: "2026-07-01T00:00:00.000Z",
    paidAt: "2026-07-01T00:00:00.000Z",
    shippedAt: "2026-07-05T00:00:00.000Z",
    deliveredAt: "2026-07-10T00:00:00.000Z",
  };
  assert.equal(
    canReportOrderProblem(order, new Date("2026-07-13T00:00:00.000Z")).eligible,
    true,
  );
  assert.equal(
    canReportOrderProblem(order, new Date("2026-07-13T00:00:01.000Z")).eligible,
    false,
  );
  assert.equal(
    canReportOrderProblem(
      { ...order, paymentStatus: "refunded", refundedAmountCents: 20_000 },
      new Date("2026-07-12T00:00:00.000Z"),
    ).eligible,
    false,
  );
  assert.equal(remainingRefundableCents(order), 15_000);
});

test("case and return authorization references are stable and readable", () => {
  assert.equal(addCalendarDays("2026-08-19T10:00:00.000Z", 3), "2026-08-22T10:00:00.000Z");
  const caseNumber = makeCaseNumber(
    new Date("2026-08-19T10:00:00.000Z"),
    "abcdef00-0000-0000-0000-000000000000",
  );
  assert.equal(caseNumber, "MCC-RC-20260819-ABCDEF");
  assert.equal(
    makeReturnAuthorizationNumber(
      caseNumber,
      "12340000-0000-0000-0000-000000000000",
    ),
    "RMA-ABCDEF-1234",
  );
});
