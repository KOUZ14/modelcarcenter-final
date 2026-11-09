import { addressErrors, shipFromAddressValues } from "./address.ts";
import { listingPhotoEvidence, type EvidenceImage } from "./listing-evidence.ts";
import { parseCollectibleDetails, ValidationError } from "./validation.ts";

export function listingEditorProgress(values: Record<string, unknown>, images: EvidenceImage[]) {
  const text = (key: string) => String(values[key] ?? "").trim();
  const conditionErrors: Record<string, string> = {};
  try { parseCollectibleDetails(values); } catch (error) { if (error instanceof ValidationError) Object.assign(conditionErrors, error.fields); }
  if (values.packagingCondition === "sealed") conditionErrors.packagingCondition = "Grade the physical packaging condition.";
  const photo = listingPhotoEvidence(values, images);
  const priceComplete = /^\$?\d+(\.\d{1,2})?$/.test(text("price")) && Number(text("price").replace(/^\$/, "")) <= 1_000_000 && /^\d+$/.test(text("quantity")) && Number(values.quantity) >= 1 && Number(values.quantity) <= 100;
  const packageComplete = ["packageLength", "packageWidth", "packageHeight", "packageWeight"].every(key => /^\d+(\.\d{1,2})?$/.test(text(key)) && Number(values[key]) > 0 && Number(values[key]) <= (key === "packageWeight" ? 150 : 108));
  const addressComplete = Object.keys(addressErrors(shipFromAddressValues(values), { phone: true })).length === 0;
  const profileComplete = Boolean(text("sellerDisplayName") && text("sellerDescription").length >= 30 && text("sellerSpecialty") && text("sellerPackingApproach").length >= 20);
  return { conditionErrors, conditionComplete: Object.keys(conditionErrors).length === 0, photo, priceComplete, packageComplete, addressComplete, profileComplete };
}
