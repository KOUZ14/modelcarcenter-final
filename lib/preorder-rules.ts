import { ValidationError } from "./validation.ts";

export const PREORDER_POLICY = "mcc-preorder-2026-09-v1";
export const DEPOSIT_PREORDER_POLICY = "mcc-preorder-deposit-2026-09-v2";
export const DEPOSIT_PREORDER_TERMS = "Pay a 10% merchandise deposit to confirm your preorder. The deposit is credited toward the full item price. The remaining balance, shipping and remaining applicable tax are due within seven days after the seller marks your items ready. The deposit is non-refundable for a change of mind or a missed balance deadline, unless the seller approves a refund. If the seller cannot fulfill, materially changes the item, or cannot meet the promised shipping date and you do not accept the delay, your payment is refunded. Your rights under applicable law are unaffected. No automatic balance charges.";
export function preorderDepositUnit(priceCents: number) { return Math.round(priceCents / 10); }
export const PREORDER_TERMS = "Reserve — pay when ready. Nothing is charged today. Your merchandise unit price is locked. Supply and timing can change. Cancel before payment without a fee. Pay within seven calendar days after inspected stock is allocated. Final shipping and applicable tax are shown for acceptance at payment. A material delay requires an affirmative Keep reservation response by the notice deadline; no response cancels the unpaid reservation. No substitutions or automatic price increases.";
export type DateWindow = { start: string | null; end: string | null; precision: "day" | "month" | "quarter" | "unknown"; label: string };
export type PreorderTerms = {
  policyVersion: string; policyText: string; paymentModel: "pay_when_ready" | "deposit_10";
  depositUnitCents?: number;
  sellerId: string; sellerName: string; listingId: string; catalogProductId: string;
  title: string; scale: string; manufacturer: string; sellerSku: string; imageUrl: string | null;
  variant: string; saleUnit: "model" | "set" | "assortment" | "case"; unitsPerPack: number; contents: string;
  priceCents: number; currency: string; shippingEstimateCents: number | null; shippingBasis: string;
  dispatch: DateWindow; receipt: DateWindow; handlingDays: number; paymentDays: number;
  previewMedia: boolean; revision: number; buyerLimit: number; taxTreatment: string;
};

export function whole(value: unknown, label: string, min = 0, max = 100000) {
  if (value === "" || value == null || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new ValidationError(`Enter a whole ${label} between ${min} and ${max}.`);
  return Number(value);
}
export function required(value: unknown, label: string, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ValidationError(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
}
export function instant(value: unknown, label: string) {
  const text = required(value, label, 50);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(Date.parse(text))) throw new ValidationError(`Enter ${label} with a timezone.`);
  return new Date(text).toISOString();
}
export function dateWindow(value: unknown): DateWindow {
  const row = value as Record<string, unknown> | null;
  if (!row || row.precision === "unknown") return { start: null, end: null, precision: "unknown", label: "To be announced" };
  const precision = String(row.precision);
  if (!["day", "month", "quarter"].includes(precision)) throw new ValidationError("Choose day, month, quarter, or unknown date precision.");
  const parse = (input: unknown, end: boolean) => {
    const v = required(input, "date window", 10);
    let date: Date;
    if (precision === "quarter" && /^\d{4}-Q[1-4]$/.test(v)) {
      const year = Number(v.slice(0, 4)), quarter = Number(v.at(-1));
      date = new Date(Date.UTC(year, (quarter - 1) * 3 + (end ? 3 : 0), end ? 0 : 1));
    } else if (precision === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
      date = new Date(Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5)) - (end ? 0 : 1), end ? 0 : 1));
    } else if (precision === "day" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      date = new Date(`${v}T00:00:00.000Z`);
      if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== v) throw new ValidationError("Enter a real calendar date.");
    } else throw new ValidationError(`Use ${precision === "quarter" ? "YYYY-Q1" : precision === "month" ? "YYYY-MM" : "YYYY-MM-DD"} for this window.`);
    if (end) date.setUTCHours(23, 59, 59, 999);
    return date.toISOString();
  };
  const start = parse(row.start, false), end = parse(row.end ?? row.start, true);
  if (start > end) throw new ValidationError("The end of a window must follow its start.");
  const label = (v: unknown) => precision === "quarter" ? `${String(v).slice(5)} ${String(v).slice(0,4)}` : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", ...(precision === "day" ? { day: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(parse(v, false)));
  return { start, end, precision: precision as DateWindow["precision"], label: row.start === (row.end ?? row.start) ? label(row.start) : `${label(row.start)} – ${label(row.end)}` };
}
export function capacitySummary(capacity: number, buffer: number, committed: number, holds: number) {
  return { remaining: Math.max(0, capacity - buffer - committed - holds), shortage: Math.max(0, committed - Math.max(0, capacity - buffer)) };
}
export const activePreorderStates = ["reserved", "allocated", "awaiting_payment", "converted"] as const;
