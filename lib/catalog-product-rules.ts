import { cleanText, requiredString, ValidationError } from "./validation.ts";

export const catalogScales = ["1:12", "1:18", "1:24", "1:32", "1:43", "1:64", "1:87", "Other"] as const;
export const catalogManufacturers = ["AUTOart", "MINI GT", "Tarmac Works", "Kaido House", "Hot Wheels", "Matchbox", "Kyosho", "Minichamps", "BBR", "Looksmart", "Solido", "Maisto"] as const;

// Ignore case and common manufacturer separators, but preserve SKU punctuation:
// AB-12 and AB12 may represent different releases.
export function manufacturerKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function normalizeManufacturer(value: string) {
  return catalogManufacturers.find((name) => manufacturerKey(name) === manufacturerKey(value)) ?? value.trim().replace(/\s+/g, " ");
}

export function normalizeScale(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "other") return "Other";
  const match = text.match(/^1\s*[:/]\s*(\d+(?:\.\d+)?)$/) ?? text.match(/^(\d+)(?:st|nd|rd|th)?\s*(?:scale)?$/);
  if (!match || Number(match[1]) <= 0 || Number(match[1]) > 10000) throw new ValidationError("Enter a scale such as 1:18, or choose Other.");
  return `1:${Number(match[1])}`;
}

function barcode(value: unknown, name: string, lengths: number[]) {
  const text = cleanText(value, 30).replace(/[\s-]/g, "");
  if (!text) return null;
  if (!/^\d+$/.test(text) || !lengths.includes(text.length)) throw new ValidationError(`Enter a valid ${name} barcode.`);
  const digits = [...text].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - sum % 10) % 10 !== check) throw new ValidationError(`The ${name} check digit is invalid.`);
  return text;
}

export function parseCatalogProduct(payload: Record<string, unknown>) {
  const modelManufacturer = normalizeManufacturer(requiredString(payload.modelManufacturer, "model-car manufacturer", 100));
  const manufacturerSku = cleanText(payload.manufacturerSku ?? payload.productNumber, 150) || null;
  const vehicleMake = requiredString(payload.vehicleMake, "vehicle make", 100);
  const vehicleModel = requiredString(payload.vehicleModel, "vehicle model", 120);
  const vehicleVariant = cleanText(payload.vehicleVariant, 150) || null;
  const color = cleanText(payload.color, 80) || null;
  const scale = normalizeScale(requiredString(payload.scale, "scale", 30));
  const upc = barcode(payload.upc, "UPC", [12]);
  const ean = barcode(payload.ean, "EAN", [8, 13]);
  if (upc && ean && upc.padStart(14, "0") !== ean.padStart(14, "0")) throw new ValidationError("UPC and EAN identify different products. Check the barcodes.");
  return {
    modelManufacturer,
    manufacturerKey: manufacturerKey(modelManufacturer),
    manufacturerSku,
    skuKey: manufacturerSku?.toLowerCase() ?? null,
    scale,
    vehicleMake,
    vehicleModel,
    vehicleVariant,
    vehicleYear: cleanText(payload.vehicleYear, 20) || null,
    color,
    livery: cleanText(payload.livery, 150) || null,
    releaseYear: cleanText(payload.releaseYear, 20) || null,
    material: cleanText(payload.material, 120),
    upc,
    ean,
    gtinKey: (upc ?? ean)?.padStart(14, "0") ?? null,
    title: [modelManufacturer, vehicleMake, vehicleModel, vehicleVariant, color, scale].filter(Boolean).join(" ").slice(0, 300),
    description: cleanText(payload.catalogDescription, 4000),
  };
}

export type CatalogIdentity = ReturnType<typeof parseCatalogProduct>;
export type CatalogModel = CatalogIdentity & { id: string; primaryImageUrl?: string | null; catalogStatus?: string };

export class CatalogMatchRequired extends ValidationError {
  matches: CatalogModel[];
  constructor(matches: CatalogModel[]) {
    super("We found a similar model. Use an existing model or confirm this is a different model.");
    this.matches = matches;
  }
}

export function catalogListingSnapshot(model: CatalogModel) {
  return {
    catalogProductId: model.id,
    modelManufacturer: model.modelManufacturer,
    scale: model.scale,
    vehicleMake: model.vehicleMake,
    vehicleModel: model.vehicleModel,
    vehicleYear: model.vehicleYear,
    color: model.color,
    material: model.material,
    productNumber: model.manufacturerSku,
  };
}
