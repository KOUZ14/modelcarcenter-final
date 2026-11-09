import { ValidationError } from "./validation.ts";

export type AvailabilityType = "in_stock" | "preorder";

export function parseProductAvailability(
  payload: Record<string, unknown>,
): { availabilityType: AvailabilityType; releaseDate: string | null } {
  const availabilityType = String(payload.availabilityType ?? "in_stock");
  if (availabilityType !== "in_stock" && availabilityType !== "preorder") {
    throw new ValidationError("Choose in-stock or preorder availability.");
  }
  const candidate = String(payload.releaseDate ?? "").trim();
  if (availabilityType === "in_stock") {
    return { availabilityType: "in_stock", releaseDate: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || !isRealDate(candidate)) {
    throw new ValidationError("Choose a valid release date for this preorder.");
  }
  return { availabilityType: "preorder", releaseDate: candidate };
}

export function productIsPreorder(product: {
  availabilityType: AvailabilityType;
  releaseDate: string | null;
}) {
  return product.availabilityType === "preorder" && Boolean(product.releaseDate);
}

export function preorderShipAnchor(releaseDates: Array<string | null>) {
  const dates = releaseDates.filter((value): value is string => Boolean(value));
  if (!dates.length) return null;
  const latest = [...dates].sort().at(-1)!;
  const release = new Date(`${latest}T12:00:00.000Z`);
  return Number.isNaN(release.valueOf()) ? null : release;
}

function isRealDate(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
