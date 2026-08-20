import { normalizeSearch } from "./business.ts";
import { isCurrentPolicyVersion } from "./legal.ts";

export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export function cleanText(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

export function optionalHttpUrl(value: unknown) {
  const candidate = cleanText(value, 1_500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function requiredString(value: unknown, label: string, max = 200) {
  const result = cleanText(value, max);
  if (!result) throw new ValidationError(`${label} is required.`, { [label]: "Required" });
  return result;
}

export function integer(value: unknown, label: string, min: number, max: number) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const parsed = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max}.`, {
      [label]: "Invalid value",
    });
  }
  return parsed;
}

export function moneyToCents(value: unknown, label = "price") {
  const normalized = String(value ?? "").trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new ValidationError(`${label} must be a valid amount with no more than two decimals.`);
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) {
    throw new ValidationError(`${label} is outside the supported range.`);
  }
  return cents;
}

export function rejectHoneypot(payload: Record<string, unknown>) {
  if (cleanText(payload.companyWebsite, 200)) {
    throw new ValidationError("Unable to accept this submission.");
  }
}

export function parseModelHunt(payload: Record<string, unknown>) {
  rejectHoneypot(payload);
  const email = normalizeEmail(payload.collectorEmail);
  if (!isEmail(email)) throw new ValidationError("Enter a valid email address.");
  const budget = cleanText(payload.maxBudget, 30);
  return {
    vehicleMake: requiredString(payload.vehicleMake, "vehicleMake", 80),
    vehicleModel: requiredString(payload.vehicleModel, "vehicleModel", 100),
    preferredScale: requiredString(payload.preferredScale, "preferredScale", 30),
    modelManufacturer: cleanText(payload.modelManufacturer, 100) || null,
    color: cleanText(payload.color, 80) || null,
    conditionPreference: cleanText(payload.conditionPreference, 40) || null,
    maxBudgetCents: budget ? moneyToCents(budget, "maximum budget") : null,
    notes: cleanText(payload.notes, 1_500),
    collectorEmail: email,
  };
}

export function parseSellerApplication(payload: Record<string, unknown>) {
  rejectHoneypot(payload);
  if (!isCurrentPolicyVersion(payload.sellerTermsVersion)) {
    throw new ValidationError("Accept the current Seller Terms to apply.");
  }
  const email = normalizeEmail(payload.email);
  if (!isEmail(email)) throw new ValidationError("Enter a valid email address.");
  const rawWebsite = cleanText(payload.website, 1_500);
  const website = optionalHttpUrl(rawWebsite);
  if (rawWebsite && !website) throw new ValidationError("Website must be an http or https URL.");
  return {
    storeName: requiredString(payload.storeName, "storeName", 120),
    contactName: requiredString(payload.contactName, "contactName", 120),
    email,
    website,
    currentSellingChannels: requiredString(payload.currentSellingChannels, "currentSellingChannels", 300),
    approximateInventorySize: integer(payload.approximateInventorySize, "approximateInventorySize", 1, 10_000_000),
    message: cleanText(payload.message, 2_000),
  };
}

export function makeSlug(value: string) {
  return normalizeSearch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

export function makeReferenceCode(now = new Date(), random = crypto.randomUUID()) {
  const date = now.toISOString().slice(2, 10).replaceAll("-", "");
  return `HUNT-${date}-${random.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export const collectorListingConditions = [
  "new_sealed",
  "new_opened",
  "displayed",
  "used_excellent",
  "used_good",
  "used_fair",
] as const;

export function parseCollectorListing(payload: Record<string, unknown>) {
  const condition = cleanText(payload.condition, 40);
  if (!collectorListingConditions.includes(condition as (typeof collectorListingConditions)[number])) {
    throw new ValidationError("Choose a supported listing condition.");
  }
  return {
    title: requiredString(payload.title, "title", 200),
    description: requiredString(payload.description, "description", 4_000),
    vehicleMake: requiredString(payload.vehicleMake, "vehicleMake", 100),
    vehicleModel: requiredString(payload.vehicleModel, "vehicleModel", 120),
    vehicleYear: cleanText(payload.vehicleYear, 20) || null,
    scale: requiredString(payload.scale, "scale", 30),
    modelManufacturer: requiredString(payload.modelManufacturer, "modelManufacturer", 100),
    color: cleanText(payload.color, 80) || null,
    condition: condition as (typeof collectorListingConditions)[number],
    priceCents: moneyToCents(payload.price, "price"),
    inventoryQuantity: integer(payload.quantity, "quantity", 1, 100),
    shippingCents: moneyToCents(payload.shippingPrice ?? "0", "shipping price"),
    sellerDisplayName: requiredString(payload.sellerDisplayName, "sellerDisplayName", 120),
    sellerDescription: cleanText(payload.sellerDescription, 1_000),
    shippingOriginCountry: requiredString(payload.shippingOriginCountry || "US", "shippingOriginCountry", 2).toUpperCase(),
    shippingOriginRegion: cleanText(payload.shippingOriginRegion, 80) || null,
  };
}

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new ValidationError("CSV contains an unclosed quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => cleanText(header, 80).toLowerCase());
  if (new Set(headers).size !== headers.length) throw new ValidationError("CSV contains duplicate headers.");
  return rows.slice(1).filter((values) => values.some((value) => value.trim())).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

const requiredCsv = [
  "seller_sku",
  "title",
  "scale",
  "model_manufacturer",
  "vehicle_make",
  "vehicle_model",
  "condition",
  "price",
  "inventory_quantity",
] as const;

export type ValidatedImportRow = {
  rowNumber: number;
  sellerSku: string;
  title: string;
  description: string;
  scale: string;
  modelManufacturer: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string | null;
  color: string | null;
  condition: "new" | "used" | "preowned" | "other";
  priceCents: number;
  inventoryQuantity: number;
  keywords: string;
};

export function validateImportRows(rows: CsvRow[]) {
  const valid: ValidatedImportRow[] = [];
  const errors: Array<{ row: number; errors: string[] }> = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    for (const key of requiredCsv) if (!cleanText(row[key], 500)) rowErrors.push(`${key} is required`);
    const sellerSku = cleanText(row.seller_sku, 100);
    if (sellerSku && seen.has(sellerSku.toLowerCase())) rowErrors.push("seller_sku is duplicated in this file");
    seen.add(sellerSku.toLowerCase());
    let priceCents = 0;
    let inventoryQuantity = 0;
    try { priceCents = moneyToCents(row.price); } catch (error) { rowErrors.push((error as Error).message); }
    try { inventoryQuantity = integer(row.inventory_quantity, "inventory_quantity", 0, 1_000_000); } catch (error) { rowErrors.push((error as Error).message); }
    const condition = cleanText(row.condition, 30).toLowerCase();
    if (!["new", "used", "preowned", "other"].includes(condition)) rowErrors.push("condition must be new, used, preowned, or other");
    if (cleanText(row.image_urls, 5_000))
      rowErrors.push(
        "image_urls is no longer supported; upload product photos after importing",
      );
    if (rowErrors.length) {
      errors.push({ row: index + 2, errors: rowErrors });
      return;
    }
    valid.push({
      rowNumber: index + 2,
      sellerSku,
      title: cleanText(row.title, 200),
      description: cleanText(row.description, 4_000),
      scale: cleanText(row.scale, 30),
      modelManufacturer: cleanText(row.model_manufacturer, 100),
      vehicleMake: cleanText(row.vehicle_make, 100),
      vehicleModel: cleanText(row.vehicle_model, 120),
      vehicleYear: cleanText(row.vehicle_year, 20) || null,
      color: cleanText(row.color, 80) || null,
      condition: condition as ValidatedImportRow["condition"],
      priceCents,
      inventoryQuantity,
      keywords: cleanText(row.keywords, 1_000),
    });
  });
  return { valid, errors };
}

export function planImportUpserts(
  existing: Array<{ id: string; sellerSku: string; slug: string }>,
  rows: ValidatedImportRow[],
  createId: () => string = () => crypto.randomUUID(),
) {
  const existingBySku = new Map(existing.map((item) => [item.sellerSku.toLowerCase(), item]));
  return rows.map((row) => {
    const previous = existingBySku.get(row.sellerSku.toLowerCase());
    const id = previous?.id ?? createId();
    return {
      ...row,
      id,
      slug: previous?.slug ?? `${makeSlug(row.title)}-${makeSlug(row.sellerSku)}-${id.slice(0, 6)}`,
      operation: previous ? "update" as const : "insert" as const,
    };
  });
}
