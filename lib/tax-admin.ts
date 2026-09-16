import { processingFeesRecovered } from "./seller-proceeds.ts";

export type TaxOrderInput = {
  id: string;
  orderNumber: string;
  isTestOrder: boolean;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  refundedAmountCents: number;
  platformFeeCents: number;
  processingFeePayer: "platform" | "seller";
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
  processingFeesRecoveredCents: number;
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
  missingStripeFeeCount: number;
};

export type TaxYearReport = {
  year: number;
  totals: TaxReportTotals;
  months: Array<TaxReportTotals & { month: string; label: string }>;
};

export type TaxProfileInput = {
  businessStartedAt?: string | null;
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

export const TAX_TIME_ZONE = "America/Los_Angeles";

export function isTaxDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function taxDate(value: string | Date = new Date()): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isTaxDate(value) ? value : null;
  }
  // D1 CURRENT_TIMESTAMP values are UTC, even though they omit the timezone.
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TAX_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function taxTaskTiming(
  task: { status: string; dueAt: string; calendarKey?: string | null; kind?: string; amountDueCents?: number | null },
  businessStartedAt?: string | null,
  today = taxDate()!,
  launchStatus?: string,
) {
  if (!["upcoming", "ready", "filed"].includes(task.status)) return "closed";
  if (task.status === "filed" && (task.amountDueCents === 0 ||
    !["ca_sales_tax", "federal_estimated_tax", "ca_estimated_tax", "annual_income_tax"].includes(task.kind ?? ""))) return "closed";
  if (launchStatus === "prelaunch" && task.calendarKey && ["upcoming", "ready"].includes(task.status)) return "prelaunch_review";
  if (task.calendarKey && businessStartedAt && task.dueAt < businessStartedAt) return "before_start";
  if (task.dueAt < today) return "overdue";
  return task.dueAt === today ? "due_today" : "upcoming";
}

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
    processingFeesRecoveredCents: 0,
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
    missingStripeFeeCount: 0,
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
      ? state.trim().toUpperCase() === "CALIFORNIA" ? "CA" : state.trim().toUpperCase()
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
  totals.processingFeesRecoveredCents += processingFeesRecovered(order);
  if (order.paymentProcessingFeeCents == null) totals.missingStripeFeeCount += 1;
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
    if (order.isTestOrder) continue;
    if (!["paid", "partially_refunded", "refunded"].includes(order.paymentStatus))
      continue;
    const paidDate = taxDate(order.paidAt ?? order.createdAt);
    if (!paidDate) continue;
    const year = Number(paidDate.slice(0, 4));
    const month = Number(paidDate.slice(5, 7)) - 1;
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
  today = taxDate()!,
): ReadinessItem[] {
  return [
    {
      id: "seller-permit",
      label: "California seller’s permit",
      detail: "The owner has confirmed an active California seller’s permit for Model Car Center. This is an admin record, not a live CDTFA verification.",
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
      detail: profile.nextSalesTaxDueAt && profile.nextSalesTaxDueAt < today
        ? "The recorded CDTFA due date has passed. Review the filing and record the next confirmed due date."
        : "CDTFA filing frequency and a current next due date are recorded.",
      ready:
        ["monthly", "quarterly", "annual"].includes(profile.salesTaxFilingFrequency) &&
        Boolean(profile.nextSalesTaxDueAt && isTaxDate(profile.nextSalesTaxDueAt) && profile.nextSalesTaxDueAt >= today),
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

function planningDueDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  // Standard IRS individual deadlines roll past weekends, MLK Day, and
  // observed DC Emancipation Day (IRS Publication 509). Relief is account-specific.
  for (;;) {
    const day = date.getUTCDay();
    const month = date.getUTCMonth();
    const dayOfMonth = date.getUTCDate();
    const emancipation = new Date(Date.UTC(date.getUTCFullYear(), 3, 16));
    const observedEmancipation = emancipation.getUTCDay() === 6 ? 15 : emancipation.getUTCDay() === 0 ? 17 : 16;
    const holiday = (month === 0 && day === 1 && dayOfMonth >= 15 && dayOfMonth <= 21) ||
      (month === 3 && dayOfMonth === observedEmancipation);
    if (day !== 0 && day !== 6 && !holiday) return date.toISOString().slice(0, 10);
    date.setUTCDate(dayOfMonth + 1);
  }
}

export function soleProprietorPlanningCalendar(
  year: number,
): PlanningCalendarTask[] {
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;
  const federalDates = [
    [`${year}-04-15`, "Q1", `${year}-01-01`, `${year}-03-31`],
    [`${year}-06-15`, "Q2", `${year}-04-01`, `${year}-05-31`],
    [`${year}-09-15`, "Q3", `${year}-06-01`, `${year}-08-31`],
    [`${year + 1}-01-15`, "Q4", `${year}-09-01`, `${year}-12-31`],
  ] as const;
  const californiaDates = [
    [`${year}-04-15`, "First installment (30%)"],
    [`${year}-06-15`, "Second installment (40%)"],
    [`${year + 1}-01-15`, "Fourth installment (30%)"],
  ] as const;
  return [
    ...federalDates.map(([dueAt, label, start, end]) => ({
      calendarKey: `${year}-federal-estimate-${label.toLowerCase()}`,
      kind: "federal_estimated_tax" as const,
      title: `${year} federal estimated tax — ${label}`,
      jurisdiction: "Federal",
      dueAt: planningDueDate(dueAt),
      periodStart: start,
      periodEnd: end,
      notes: "Standard estimated-tax planning date (IRS Form 1040-ES). The period shows when income is earned. Review all personal income, withholding, annualization, and any disaster relief before deciding whether a payment is required.",
    })),
    ...californiaDates.map(([dueAt, label], index) => ({
      calendarKey: `${year}-ca-estimate-${index + 1}`,
      kind: "ca_estimated_tax" as const,
      title: `${year} California estimated tax — ${label}`,
      jurisdiction: "California FTB",
      dueAt: planningDueDate(dueAt),
      periodStart,
      periodEnd,
      notes: "California’s standard installment pattern is 30%, 40%, 0%, 30% of the required annual payment. Review Form 540-ES and annualization if income began partway through the year. Confirm any disaster relief.",
    })),
    {
      calendarKey: `${year}-annual-income-tax`,
      kind: "annual_income_tax" as const,
      title: `${year} federal and California individual returns`,
      jurisdiction: "Federal / California",
      dueAt: planningDueDate(`${year + 1}-04-15`),
      periodStart,
      periodEnd,
      notes: "Schedule C and Schedule SE flow through the individual return. Confirm any weekend, holiday, or extension adjustment.",
    },
  ];
}
