/** Seller-supplied view labels are evidence pointers, never an inspection guarantee. */
export const photoViews = [
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
  { key: "top", label: "Top" },
  { key: "underside", label: "Underside" },
  { key: "packaging", label: "Included box and labels" },
  { key: "seal", label: "Factory seal" },
  { key: "accessories", label: "Included accessories / certificate" },
  { key: "issues", label: "Disclosed defects / repairs" },
  { key: "details", label: "Interior / details" },
] as const;
export type PhotoView = (typeof photoViews)[number]["key"];
type EvidenceListing = Partial<Record<"packagingCondition" | "originalBoxStatus" | "accessories" | "coaStatus" | "defects" | "missingParts" | "restorationCustomization", unknown>>;
export type EvidenceImage = { id?: string; url?: string; alt?: string };

export function hasDisclosedDetail(value: unknown) {
  const text = String(value ?? "").trim();
  return Boolean(text && !/^(none(?: known| included)?|no(?:ne)? (?:known )?(?:defects|issues|damage|missing parts|repairs|accessories)|not applicable|n\/a|not included|not sure)[.!]?$/i.test(text));
}

export function isFactorySealed(value: unknown) {
  return value === "sealed" || String(value).startsWith("sealed_");
}

export function requiredPhotoViews(listing: EvidenceListing): PhotoView[] {
  const sealed = isFactorySealed(listing.packagingCondition);
  const views: PhotoView[] = sealed ? ["packaging", "seal"] : ["front", "rear", "left", "right", "top", "underside"];
  if (!sealed && ["included", "reproduction"].includes(String(listing.originalBoxStatus))) views.push("packaging");
  // Do not require a factory-sealed model to be opened for evidence.
  if (!sealed && (hasDisclosedDetail(listing.accessories) || listing.coaStatus === "included")) views.push("accessories");
  if ([listing.defects, listing.missingParts, listing.restorationCustomization].some(hasDisclosedDetail)) views.push("issues");
  return views;
}

export function photoViewsFromAlt(alt = ""): PhotoView[] {
  const labels = alt.split(/ [\u2014-] /)[0].split(" · ");
  // Preserve coverage supplied by the old grouped labels without offering them
  // for new photos. Sellers can refine these into individual views when editing.
  if (labels.includes("Front view")) labels.push("Front");
  if (labels.includes("Rear view")) labels.push("Rear");
  if (labels.includes("Both sides")) labels.push("Left side", "Right side");
  if (labels.includes("Top and base")) labels.push("Top", "Underside");
  return photoViews.filter(view => labels.includes(view.label)).map(view => view.key);
}

export function photoAltForViews(views: readonly string[], description: string) {
  const expanded = [...views, ...(views.includes("sides") ? ["left", "right"] : []), ...(views.includes("base") ? ["top", "underside"] : [])];
  const labels = photoViews.filter(view => expanded.includes(view.key)).map(view => view.label);
  return labels.length ? `${labels.join(" · ")} - ${description}` : description;
}

export function listingPhotoEvidence(listing: EvidenceListing, images: EvidenceImage[] = []) {
  const required = requiredPhotoViews(listing);
  const provided = new Set(images.flatMap(image => photoViewsFromAlt(image.alt)));
  const minimumPhotos = isFactorySealed(listing.packagingCondition) ? 2 : 4;
  const missing: string[] = required.filter(key => !provided.has(key)).map(key => photoViews.find(view => view.key === key)!.label);
  if (images.length < minimumPhotos) missing.unshift(`At least ${minimumPhotos} actual-item photos`);
  return { required, missing, complete: missing.length === 0, minimumPhotos };
}

// File identity survives reordering in the upload form. Labels are sent with that file.
const selectedPhotoViews = new WeakMap<File, PhotoView[]>();
export function setSelectedPhotoViews(file: File, views: PhotoView[]) { selectedPhotoViews.set(file, views); }
export function getSelectedPhotoViews(file: File) { return selectedPhotoViews.get(file) ?? []; }
