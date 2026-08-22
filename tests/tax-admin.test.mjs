import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaxYearReports,
  shippingState,
  soleProprietorPlanningCalendar,
  taxReadiness,
} from "../lib/tax-admin.ts";

function order(overrides = {}) {
  return {
    id: String(overrides.orderNumber ?? "MCC-1001"),
    orderNumber: "MCC-1001",
    currency: "usd",
    subtotalCents: 10_000,
    shippingCents: 1_000,
    taxCents: 900,
    totalCents: 11_900,
    refundedAmountCents: 0,
    platformFeeCents: 1_000,
    paymentProcessingFeeCents: 375,
    sellerProceedsCents: 10_000,
    sellerTransferAmountCents: 10_000,
    sellerTransferReversedCents: 0,
    paymentStatus: "paid",
    shippingAddress: JSON.stringify({ address: { state: "ca" } }),
    paidAt: "2026-08-20T12:00:00.000Z",
    createdAt: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

test("tax reports separate California tax, full refunds, and partial-refund review", () => {
  const reports = buildTaxYearReports([
    order(),
    order({
      orderNumber: "MCC-1002",
      paymentStatus: "refunded",
      refundedAmountCents: 11_900,
      sellerTransferReversedCents: 10_000,
    }),
    order({
      orderNumber: "MCC-1003",
      paymentStatus: "partially_refunded",
      refundedAmountCents: 2_000,
      shippingAddress: JSON.stringify({ address: { state: "NV" } }),
    }),
  ]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totals.orderCount, 3);
  assert.equal(reports[0].totals.californiaOrderCount, 2);
  assert.equal(reports[0].totals.californiaTaxCollectedCents, 1_800);
  assert.equal(reports[0].totals.californiaTaxAfterFullRefundsCents, 900);
  assert.equal(reports[0].totals.partialRefundReviewCount, 1);
  assert.equal(reports[0].totals.netSellerTransferCents, 20_000);
});

test("shipping state parsing is defensive", () => {
  assert.equal(shippingState('{"address":{"state":"Ca"}}'), "CA");
  assert.equal(shippingState('{"state":"ny"}'), "NY");
  assert.equal(shippingState("bad-json"), null);
});

test("readiness requires external confirmations and automatic tax", () => {
  const profile = {
    sellerPermitStatus: "active",
    marketplaceFacilitatorStatus: "confirmed",
    stripeCaliforniaRegistrationStatus: "active",
    salesTaxFilingFrequency: "quarterly",
    nextSalesTaxDueAt: "2026-10-31",
    sellerDocumentationIssued: true,
    w9CollectionReady: true,
    stripeTaxReportingReady: true,
  };
  assert.equal(taxReadiness(profile, false).filter((item) => item.ready).length, 8);
  assert.equal(taxReadiness(profile, true).every((item) => item.ready), true);
});

test("sole proprietor calendar uses the 2026 federal and California cadence", () => {
  const tasks = soleProprietorPlanningCalendar(2026);
  assert.equal(tasks.length, 8);
  assert.equal(tasks.filter((item) => item.kind === "federal_estimated_tax").length, 4);
  assert.equal(tasks.filter((item) => item.kind === "ca_estimated_tax").length, 3);
  assert.equal(tasks.some((item) => item.dueAt === "2027-01-15"), true);
  assert.equal(tasks.some((item) => item.dueAt === "2027-04-15"), true);
});
