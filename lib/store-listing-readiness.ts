import { parseCollectibleDetails, ValidationError } from "./validation.ts";
import { listingPhotoEvidence, type EvidenceImage } from "./listing-evidence.ts";

/** The same publication checks feed the editor, inventory rows, and API. */
export function storeListingIssues(values: Record<string, unknown>, images: EvidenceImage[], now = new Date()) {
  const fields: Record<string, string> = {};
  if (!values.catalogProductId && !values.catalogModel) fields.catalogProductId = "Choose a catalog model.";
  if (!String(values.sellerSku ?? "").trim()) fields.sellerSku = "Enter a seller SKU.";
  try { parseCollectibleDetails(values); } catch (error) { if (error instanceof ValidationError) Object.assign(fields, error.fields); }
  const price = values.price === undefined ? Number(values.priceCents) / 100 : Number(String(values.price).replace(/^\$/, ""));
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) fields.price = "Enter a price greater than $0 and no greater than $1,000,000.";
  if (values.availabilityType === "preorder") {
    if (Number.isFinite(price) && price < 5) fields.price = "Preorders must cost at least $5.00.";
    if (!(Number(values.preorderCapacity ?? values.inventoryQuantity) > 0)) fields.inventoryQuantity = "Add quantity available to preorder.";
    if (!values.releaseDate || Date.parse(String(values.releaseDate)) <= now.getTime() || !Number.isFinite(Date.parse(String(values.releaseDate)))) fields.releaseDate = "Choose a future expected ship date.";
    if (!images.length && !values.primaryImageUrl) fields.images = "Add a product photo or clearly identified preview.";
  } else {
    if (!(Number(values.inventoryQuantity) > Number(values.reservedQuantity ?? 0))) fields.inventoryQuantity = "Add available stock before listing for sale.";
    const evidence = listingPhotoEvidence(values, images);
    if (!evidence.complete) fields.images = evidence.missing.join(". ");
  }
  return fields;
}

export function inventoryStatusLabel(status: string) {
  return ({ active: "Listed", sold_out: "Listed · out of stock", draft: "Draft", inactive: "Unpublished", rejected: "Removed", pending_review: "Draft" } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}
