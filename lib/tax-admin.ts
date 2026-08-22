export type TaxOrderInput = {
  id: string;
  orderNumber: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  refundedAmountCents: number;
  platformFeeCents: number;
  paymentProcessingFeeCents: number | null;
  sellerProceedsCents: number | null;
  sellerTransferAmountCents: number;
  sellerTransferReversedCents: number;
  paymentStatus: string;
  shippingAddress: string;
  paidAt: string | null;
  createdAt: string;
};

export type TaxReportTotals = {
  orderCount: number;
  merchandiseCents: number;
  shippingCents: number;
  grossChargesCents: number;
  taxCollectedCents: number;
  taxOnFullyRefundedOrdersCents: number;
  taxAfterFullRefundsCents: number;
  refundsCents: number;
  netCustomerCollectionsCents: number;
  platformFeesCents: number;
  platformFeesAfterFullRefundsCents: number;
  stripeFeesCents: number;
  sellerProceedsCents: number;
  netSellerTransferCents: number;
  californiaOrderCount: number;
  californiaMerchandiseCents: number;
  californiaShippingCents: number;
  californiaTaxCollectedCents: number;
  californiaTaxOnFullyRefundedOrdersCents: number;
  californiaTaxAfterFullRefundsCents: number;
  partialRefundReviewCount: number;
  missingStateCount: number;
};

export type TaxYearReport = {
  year: number;
  totals: TaxReportTotals;
  months: Array<TaxReportTotals & { month: string; label: string }>;
};

export type TaxProfileInput = {
  sellerPermitStatus: string;
  marketplaceFacilitatorStatus: string;
  stripeCaliforniaRegistrationStatus: string;
  salesTaxFilingFrequency: string;
  nextSalesTaxDueAt: string | null;
  sellerDocumentationIssued: boolean;
  w9CollectionReady: boolean;
  stripeTaxReportingReady: boolean;
};

export type ReadinessItem = {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function emptyTotals(): TaxReportTotals {
  return {
    orderCount: 0,
    merchandiseCents: 0,
    shippingCents: 0,
    grossChargesCents: 0,
    taxCollectedCents: 0,
    taxOnFullyRefundedOrdersCents: 0,
    taxAfterFullRefundsCents: 0,
    refundsCents: 0,
    netCustomerCollectionsCents: 0,
    platformFeesCents: 0,
    platformFeesAfterFullRefundsCents: 0,
    stripeFeesCents: 0,
    sellerProceedsCents: 0,
    netSellerTransferCents: 0,
    californiaOrderCount: 0,
    californiaMerchandiseCents: 0,
    californiaShippingCents: 0,
    californiaTaxCollectedCents: 0,
    californiaTaxOnFullyRefundedOrdersCents: 0,
    californiaTaxAfterFullRefundsCents: 0,
    partialRefundReviewCount: 0,
    missingStateCount: 0,
  };
}

export function shippingState(raw: string): string | null {
  try {
    const value = JSON.parse(raw) as {
      address?: { state?: unknown };
      state?: unknown;
    };
    const state = value.address?.state ?? value.state;
    return typeof state === "string" && state.trim()
      ? state.trim().toUpperCase()
      : null;
  } catch {
    return null;
  }
}

function addOrder(totals: TaxReportTotals, order: TaxOrderInput) {
  const fullyRefunded = order.paymentStatus === "refunded";
  const partiallyRefunded = order.paymentStatus === "partially_refunded";
  const state = shippingState(order.shippingAddress);
  totals.orderCount += 1;
  totals.merchandiseCents += order.subtotalCents;
  totals.shippingCents += order.shippingCents;
  totals.grossChargesCents += order.totalCents;
  totals.taxCollectedCents += order.taxCents;
  totals.refundsCents += order.refundedAmountCents;
  totals.netCustomerCollectionsCents += Math.max(
    0,
    order.totalCents - order.refundedAmountCents,
  );
  totals.platformFeesCents += order.platformFeeCents;
  totals.platformFeesAfterFullRefundsCents += fullyRefunded
    ? 0
    : order.platformFeeCents;
  totals.stripeFeesCents += order.paymentProcessingFeeCents ?? 0;
  totals.sellerProceedsCents += order.sellerProceedsCents ?? 0;
  totals.netSellerTransferCents += Math.max(
    0,
    order.sellerTransferAmountCents - order.sellerTransferReversedCents,
  );
  if (fullyRefunded) {
    totals.taxOnFullyRefundedOrdersCents += order.taxCents;
  }
  totals.taxAfterFullRefundsCents =
    totals.taxCollectedCents - totals.taxOnFullyRefundedOrdersCents;
  if (partiallyRefunded) totals.partialRefundReviewCount += 1;
  if (!state) totals.missingStateCount += 1;
  if (state === "CA") {
    totals.californiaOrderCount += 1;
    totals.californiaMerchandiseCents += order.subtotalCents;
    totals.californiaShippingCents += order.shippingCents;
    totals.californiaTaxCollectedCents += order.taxCents;
    if (fullyRefunded) {
      totals.californiaTaxOnFullyRefundedOrdersCents += order.taxCents;
    }
    totals.californiaTaxAfterFullRefundsCents =
      totals.californiaTaxCollectedCents -
      totals.californiaTaxOnFullyRefundedOrdersCents;
  }
}

export function buildTaxYearReports(orders: TaxOrderInput[]): TaxYearReport[] {
  const reports = new Map<
    number,
    { totals: TaxReportTotals; months: Map<number, TaxReportTotals> }
  >();
  for (const order of orders) {
    if (!["paid", "partially_refunded", "refunded"].includes(order.paymentStatus))
      continue;
    const parsed = new Date(order.paidAt ?? order.createdAt);
    if (Number.isNaN(parsed.getTime())) continue;
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const report = reports.get(year) ?? {
      totals: emptyTotals(),
      months: new Map<number, TaxReportTotals>(),
    };
    const monthTotals = report.months.get(month) ?? emptyTotals();
    addOrder(report.totals, order);
    addOrder(monthTotals, order);
    report.months.set(month, monthTotals);
    reports.set(year, report);
  }
  return [...reports.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, report]) => ({
      year,
      totals: report.totals,
      months: [...report.months.entries()]
        .sort(([a], [b]) => a - b)
        .map(([month, totals]) => ({
          month: `${year}-${String(month + 1).padStart(2, "0")}`,
          label: MONTH_LABELS[month],
          ...totals,
        })),
    }));
}

export function taxReadiness(
  profile: TaxProfileInput,
  automaticTaxEnabled: boolean,
): ReadinessItem[] {
  return [
    {
      id: "seller-permit",
      label: "California seller’s permit",
      detail: "Permit is active and belongs to the sole proprietor operating Model Car Center.",
      ready: profile.sellerPermitStatus === "active",
    },
    {
      id: "marketplace-facilitator",
      label: "CDTFA marketplace status",
      detail: "CDTFA has confirmed the marketplace-facilitator treatment for the account.",
      ready: profile.marketplaceFacilitatorStatus === "confirmed",
    },
    {
      id: "stripe-registration",
      label: "Stripe California registration",
      detail: "California is active in the platform Stripe Tax registration settings.",
      ready: profile.stripeCaliforniaRegistrationStatus === "active",
    },
    {
      id: "stripe-liability",
      label: "Platform tax liability",
      detail: "Checkout assigns automatic-tax liability to the Model Car Center platform.",
      ready: true,
    },
    {
      id: "automatic-tax",
      label: "Automatic tax enabled",
      detail: "The hosted STRIPE_AUTOMATIC_TAX setting is enabled after registration is active.",
      ready: automaticTaxEnabled,
    },
    {
      id: "filing-calendar",
      label: "Sales-tax filing calendar",
      detail: "CDTFA filing frequency and the next due date are recorded.",
      ready:
        profile.salesTaxFilingFrequency !== "not_set" &&
        Boolean(profile.nextSalesTaxDueAt),
    },
    {
      id: "seller-documentation",
      label: "Seller documentation",
      detail: "Sellers receive written notice that the marketplace collects California tax.",
      ready: profile.sellerDocumentationIssued,
    },
    {
      id: "w9",
      label: "Seller W-9 process",
      detail: "Stripe Connect or an approved process collects seller tax identity information.",
      ready: profile.w9CollectionReady,
    },
    {
      id: "tax-reporting",
      label: "Stripe seller tax reporting",
      detail: "Connect tax reporting and delivery responsibilities have been reviewed.",
      ready: profile.stripeTaxReportingReady,
    },
  ];
}

export type PlanningCalendarTask = {
  calendarKey: string;
  kind:
    | "federal_estimated_tax"
    | "ca_estimated_tax"
    | "annual_income_tax";
  title: string;
  jurisdiction: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
};

export function soleProprietorPlanningCalendar(
  year: number,
): PlanningCalendarTask[] {
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;
  const federalDates = [
    [`${year}-04-15`, "Q1"],
    [`${year}-06-15`, "Q2"],
    [`${year}-09-15`, "Q3"],
    [`${year + 1}-01-15`, "Q4"],
  ] as const;
  const californiaDates = [
    [`${year}-04-15`, "First installment (30%)"],
    [`${year}-06-15`, "Second installment (40%)"],
    [`${year + 1}-01-15`, "Fourth installment (30%)"],
  ] as const;
  return [
    ...federalDates.map(([dueAt, label]) => ({
      calendarKey: `${year}-federal-estimate-${label.toLowerCase()}`,
      kind: "federal_estimated_tax" as const,
      title: `${year} federal estimated tax — ${label}`,
      jurisdiction: "Federal",
      dueAt,
      periodStart,
      periodEnd,
      notes: "Planning date from the standard sole-proprietor calendar; confirm the amount and any holiday adjustment before paying.",
    })),
    ...californiaDates.map(([dueAt, label], index) => ({
      calendarKey: `${year}-ca-estimate-${index + 1}`,
      kind: "ca_estimated_tax" as const,
      title: `${year} California estimated tax — ${label}`,
      jurisdiction: "California FTB",
      dueAt,
      periodStart,
      periodEnd,
      notes: "California’s standard installment pattern is 30%, 40%, 0%, 30%. Confirm the amount using Form 540-ES.",
    })),
    {
      calendarKey: `${year}-annual-income-tax`,
      kind: "annual_income_tax" as const,
      title: `${year} federal and California individual returns`,
      jurisdiction: "Federal / California",
      dueAt: `${year + 1}-04-15`,
      periodStart,
      periodEnd,
      notes: "Schedule C and Schedule SE flow through the individual return. Confirm any weekend, holiday, or extension adjustment.",
    },
  ];
}
