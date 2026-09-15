import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaxYearReports,
  isTaxDate,
  shippingState,
  soleProprietorPlanningCalendar,
  taxDate,
  taxReadiness,
  taxTaskTiming,
} from "../lib/tax-admin.ts";

function order(overrides = {}) {
  return {
    id: String(overrides.orderNumber ?? "MCC-1001"),
    orderNumber: "MCC-1001",
    isTestOrder: false,
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

test("test orders never contribute tax totals or months, and genuine refunds remain", () => {
  const testOrder = order({ isTestOrder: true, paymentStatus: "refunded", paidAt: "2026-08-20 00:38:09" });
  assert.deepEqual(buildTaxYearReports([testOrder]), []);
  const realOrders = [
    order({ paidAt: "2026-09-01T12:00:00Z" }),
    order({ paymentStatus: "refunded", refundedAmountCents: 11_900, paidAt: "2026-09-02T12:00:00Z" }),
  ];
  const reports = buildTaxYearReports([testOrder, ...realOrders]);
  assert.deepEqual(reports, buildTaxYearReports(realOrders));
  assert.equal(reports[0].totals.orderCount, 2);
  assert.deepEqual(reports[0].months.map((row) => row.label), ["September"]);
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
  assert.equal(taxReadiness(profile, false, "2026-09-15").filter((item) => item.ready).length, 8);
  assert.equal(taxReadiness(profile, true, "2026-09-15").every((item) => item.ready), true);
  assert.equal(taxReadiness(profile, true, "2026-11-01").find((item) => item.id === "filing-calendar").ready, false);
  assert.equal(taxReadiness({ ...profile, salesTaxFilingFrequency: "bogus" }, true, "2026-09-15").find((item) => item.id === "filing-calendar").ready, false);
});

test("sole proprietor calendar uses the 2026 federal and California cadence", () => {
  const tasks = soleProprietorPlanningCalendar(2026);
  assert.equal(tasks.length, 8);
  assert.equal(tasks.filter((item) => item.kind === "federal_estimated_tax").length, 4);
  assert.equal(tasks.filter((item) => item.kind === "ca_estimated_tax").length, 3);
  assert.equal(tasks.some((item) => item.dueAt === "2027-01-15"), true);
  assert.equal(tasks.some((item) => item.dueAt === "2027-04-15"), true);
  const second = tasks.find((item) => item.calendarKey === "2026-federal-estimate-q2");
  assert.equal(second.periodStart, "2026-04-01");
  assert.equal(second.periodEnd, "2026-05-31");
  assert.equal(second.dueAt, "2026-06-15");
});

test("tax dates reject rollover days and preserve date-only values in California", () => {
  assert.equal(isTaxDate("2026-02-30"), false);
  assert.equal(isTaxDate("2026-02-29"), false);
  assert.equal(isTaxDate("2024-02-29"), true);
  assert.equal(isTaxDate("2026-05-22junk"), false);
  assert.equal(taxDate("2026-05-22"), "2026-05-22");
  assert.equal(taxDate("2027-01-01 03:00:00"), "2026-12-31");
  assert.equal(taxDate("2026-06-01T06:59:59Z"), "2026-05-31");
  assert.equal(taxDate("2026-06-01T07:00:00Z"), "2026-06-01");
  assert.equal(taxDate("invalid"), null);
});

test("reports assign payment timestamps to California months and years", () => {
  const reports = buildTaxYearReports([
    order({ paidAt: "2027-01-01T03:00:00Z" }),
    order({ paidAt: "2027-01-01 08:00:00" }),
    order({ paidAt: "2026-06-01T06:59:59Z" }),
    order({ paymentStatus: "pending" }),
  ]);
  assert.deepEqual(reports.map((report) => [report.year, report.totals.orderCount]), [[2027, 1], [2026, 2]]);
  assert.deepEqual(reports[1].months.map((month) => month.label), ["May", "December"]);
  assert.equal(shippingState('{"address":{"state":"California"}}'), "CA");
  assert.equal(buildTaxYearReports([order({ paymentProcessingFeeCents: null })])[0].totals.missingStripeFeeCount, 1);
});

test("May startup flags earlier planning deadlines without declaring taxes unnecessary", () => {
  const task = { calendarKey: "2026-federal-estimate-q1", status: "upcoming", dueAt: "2026-04-15" };
  assert.equal(taxTaskTiming(task, "2026-05-22", "2026-09-15"), "before_start");
  assert.equal(taxTaskTiming({ ...task, calendarKey: null }, "2026-05-22", "2026-09-15"), "overdue");
  assert.equal(taxTaskTiming({ ...task, status: "paid" }, "2026-05-22", "2026-09-15"), "closed");
  assert.equal(taxTaskTiming({ ...task, dueAt: "2026-09-15" }, "2026-05-22", "2026-09-15"), "due_today");
  assert.equal(taxTaskTiming({ ...task, kind: "ca_sales_tax", status: "filed", dueAt: "2026-09-14" }, "2026-05-22", "2026-09-15"), "overdue");
  assert.equal(taxTaskTiming({ ...task, kind: "seller_reporting", status: "filed" }, "2026-05-22", "2026-09-15"), "closed");
  assert.equal(taxTaskTiming({ ...task, kind: "ca_sales_tax", status: "filed", amountDueCents: 0 }, "2026-05-22", "2026-09-15"), "closed");
  assert.equal(taxTaskTiming(task, null, "2026-09-15", "prelaunch"), "prelaunch_review");
  assert.equal(taxTaskTiming({ ...task, calendarKey: null, kind: "ca_sales_tax" }, null, "2026-09-15", "prelaunch"), "overdue");
  assert.equal(taxTaskTiming({ ...task, status: "paid" }, null, "2026-09-15", "prelaunch"), "closed");
});

test("standard deadlines roll past weekends and the relevant January and April holidays", () => {
  const tasks2022 = soleProprietorPlanningCalendar(2022);
  assert.equal(tasks2022.find((task) => task.calendarKey === "2022-federal-estimate-q1").dueAt, "2022-04-18");
  assert.equal(tasks2022.find((task) => task.calendarKey === "2022-federal-estimate-q4").dueAt, "2023-01-17");
  assert.equal(soleProprietorPlanningCalendar(2026).find((task) => task.calendarKey === "2026-federal-estimate-q3").dueAt, "2026-09-15");
});
