import { ValidationError } from "./validation.ts";
import { addressErrors, normalizeState } from "./address.ts";

export type ParcelInput = {
  length: string;
  width: string;
  height: string;
  weight: string;
};

export type NormalizedShippingAddress = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export function parseEstimateZip(value: unknown) {
  const zip = typeof value === "string" ? value.trim() : "";
  if (!/^\d{5}(?:-\d{4})?$/.test(zip))
    throw new ValidationError("Enter a valid U.S. ZIP code, such as 90210 or 90210-1234.");
  return zip;
}

export type ShippingRateRequirement = {
  carrier: string | null;
  serviceToken: string | null;
  estimatedDays: number | null;
};

type ComparableRate = {
  id: string;
  provider: string;
  serviceToken: string;
  amountCents: number;
  estimatedDays: number | null;
};

export function highValueShippingRules(
  declaredValueCents: number,
  insuranceThresholdCents: number,
  signatureThresholdCents: number,
) {
  const value = Math.max(0, Math.trunc(declaredValueCents));
  const signatureRequired =
    signatureThresholdCents > 0 && value >= signatureThresholdCents;
  return {
    declaredValueCents: value,
    insuranceRequired:
      signatureRequired ||
      (insuranceThresholdCents > 0 && value >= insuranceThresholdCents),
    signatureRequired,
  };
}

export function parseParcel(payload: Record<string, unknown>): ParcelInput {
  return {
    length: positiveDecimal(payload.length, "Package length", 108),
    width: positiveDecimal(payload.width, "Package width", 108),
    height: positiveDecimal(payload.height, "Package height", 108),
    weight: positiveDecimal(payload.weight, "Package weight", 150),
  };
}

export function combinePackages(
  items: Array<{
    quantity: number;
    packageLength: string | null;
    packageWidth: string | null;
    packageHeight: string | null;
    packageWeight: string | null;
  }>,
  fallback: ParcelInput,
) {
  let length = 0;
  let width = 0;
  let height = 0;
  let weight = 0;
  for (const item of items) {
    const parcel = parseParcel({
      length: item.packageLength ?? fallback.length,
      width: item.packageWidth ?? fallback.width,
      height: item.packageHeight ?? fallback.height,
      weight: item.packageWeight ?? fallback.weight,
    });
    length = Math.max(length, Number(parcel.length));
    width = Math.max(width, Number(parcel.width));
    height += Number(parcel.height) * item.quantity;
    weight += Number(parcel.weight) * item.quantity;
  }
  return parseParcel({ length, width, height, weight });
}

export function selectBuyerRates<T extends ComparableRate>(rates: T[], limit = 3) {
  const unique = new Map<string, T>();
  for (const rate of rates) {
    const key = `${rate.provider.toLowerCase()}:${rate.serviceToken.toLowerCase() || rate.id}`;
    const existing = unique.get(key);
    if (!existing || rate.amountCents < existing.amountCents) unique.set(key, rate);
  }
  const available = [...unique.values()];
  if (available.length <= limit)
    return available.sort((left, right) => left.amountCents - right.amountCents);
  const cheapest = [...available].sort(
    (left, right) => left.amountCents - right.amountCents,
  )[0];
  const timed = available.filter((rate) => rate.estimatedDays != null);
  const fastest = [...timed].sort(
    (left, right) =>
      left.estimatedDays! - right.estimatedDays! ||
      left.amountCents - right.amountCents,
  )[0];
  const selected = new Map<string, T>([[cheapest.id, cheapest]]);
  if (fastest) selected.set(fastest.id, fastest);
  for (const rate of available.sort(
    (left, right) => left.amountCents - right.amountCents,
  )) {
    if (selected.size >= Math.max(1, Math.min(3, limit))) break;
    selected.set(rate.id, rate);
  }
  return [...selected.values()].sort(
    (left, right) =>
      (right.estimatedDays ?? Number.MAX_SAFE_INTEGER) -
        (left.estimatedDays ?? Number.MAX_SAFE_INTEGER) ||
      left.amountCents - right.amountCents,
  );
}

export function rateMeetsShippingRequirement(
  rate: Pick<ComparableRate, "provider" | "serviceToken" | "estimatedDays">,
  requirement: ShippingRateRequirement,
) {
  if (!requirement.carrier && !requirement.serviceToken) return true;
  const exact =
    rate.provider.trim().toLowerCase() ===
      String(requirement.carrier ?? "").trim().toLowerCase() &&
    Boolean(rate.serviceToken) &&
    rate.serviceToken.trim().toLowerCase() ===
      String(requirement.serviceToken ?? "").trim().toLowerCase();
  if (exact) return true;
  return (
    requirement.estimatedDays != null &&
    rate.estimatedDays != null &&
    rate.estimatedDays <= requirement.estimatedDays
  );
}

export function parseCheckoutShippingAddress(
  value: unknown,
): NormalizedShippingAddress {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError("Enter a delivery address to calculate shipping.");
  const address = value as Record<string, unknown>;
  const normalized = {
    name: clean(address.name),
    street1: clean(address.street1),
    street2: clean(address.street2),
    city: clean(address.city),
    state: clean(address.state).toUpperCase(),
    zip: clean(address.zip),
    country: clean(address.country).toUpperCase(),
  };
  if (normalized.country === "US") normalized.state = normalizeState(normalized.state);
  const errors = addressErrors(normalized, { name: true });
  if (Object.keys(errors).length)
    throw new ValidationError("Complete the delivery address. Check the highlighted fields.", errors);
  return normalized;
}

function positiveDecimal(value: unknown, label: string, max: number) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new ValidationError(`${label} must be a positive number with up to two decimal places.`);
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0 || number > max)
    throw new ValidationError(`${label} must be greater than 0 and no more than ${max}.`);
  return String(Number(number.toFixed(2)));
}

export function parseStoredShippingAddress(value: string): NormalizedShippingAddress {
  let parsed: {
    name?: unknown;
    address?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(value) as typeof parsed;
  } catch {
    throw new ValidationError("The saved delivery address is invalid. Contact support before buying a label.");
  }
  const address = parsed.address ?? {};
  const normalized = {
    name: clean(parsed.name),
    street1: clean(address.line1),
    street2: clean(address.line2),
    city: clean(address.city),
    state: clean(address.state).toUpperCase(),
    zip: clean(address.postal_code),
    country: clean(address.country).toUpperCase(),
  };
  if (
    !normalized.name ||
    !normalized.street1 ||
    !normalized.city ||
    !normalized.zip ||
    !normalized.country
  )
    throw new ValidationError("The delivery address is incomplete. Contact support before buying a label.");
  if (["US", "CA"].includes(normalized.country) && !normalized.state)
    throw new ValidationError("The delivery address is missing a state or province. Contact support before buying a label.");
  return normalized;
}

export function shippingAddressKey(value: string, buyerEmail: string) {
  const address = parseStoredShippingAddress(value);
  return JSON.stringify({
    ...address,
    name: address.name.toLowerCase(),
    street1: address.street1.toLowerCase(),
    street2: address.street2.toLowerCase(),
    city: address.city.toLowerCase(),
    zip: address.zip.replace(/\s+/g, "").toLowerCase(),
    buyerEmail: buyerEmail.trim().toLowerCase(),
  });
}

export function handlingReminder(
  order: {
    paymentStatus: string;
    fulfillmentStatus: string;
    shipByAt: string | null;
  },
  now = new Date(),
) {
  if (
    !["paid", "partially_refunded"].includes(order.paymentStatus) ||
    ["shipped", "delivered", "cancelled"].includes(order.fulfillmentStatus) ||
    !order.shipByAt
  )
    return { level: "none" as const, label: "" };
  const deadline = new Date(order.shipByAt);
  if (Number.isNaN(deadline.getTime()))
    return { level: "none" as const, label: "" };
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs < 0)
    return { level: "overdue" as const, label: "Handling deadline passed" };
  const remainingHours = Math.ceil(remainingMs / 3_600_000);
  if (remainingHours <= 24)
    return { level: "due_today" as const, label: "Ship by today" };
  if (remainingHours <= 48)
    return { level: "due_soon" as const, label: "Ship within 2 days" };
  return { level: "on_track" as const, label: `Ship by ${deadline.toISOString().slice(0, 10)}` };
}

export function mapShippoTrackingStatus(status: string | null | undefined) {
  switch (String(status ?? "").toUpperCase()) {
    case "PRE_TRANSIT":
      return "pre_transit" as const;
    case "TRANSIT":
      return "in_transit" as const;
    case "DELIVERED":
      return "delivered" as const;
    case "RETURNED":
      return "returned" as const;
    case "FAILURE":
      return "failure" as const;
    default:
      return "unknown" as const;
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
