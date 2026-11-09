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

function labelsFromAlt(alt = "") { return alt.split(/ [\u2014-] /)[0].split(" · "); }

export function ambiguousPhotoLabels(alt = "") {
  return labelsFromAlt(alt).filter(label => label === "Both sides" || label === "Top and base");
}

export function photoViewsFromAlt(alt = ""): PhotoView[] {
  const labels = labelsFromAlt(alt);
  // Only unambiguous legacy labels count. Grouped views need seller review.
  if (labels.includes("Front view")) labels.push("Front");
  if (labels.includes("Rear view")) labels.push("Rear");
  return photoViews.filter(view => labels.includes(view.label)).map(view => view.key);
}

export function photoAltForViews(views: readonly string[], description: string) {
  const labels: string[] = photoViews.filter(view => views.includes(view.key)).map(view => view.label);
  // Preserve ambiguity from older upload clients instead of inventing coverage.
  if (views.includes("sides")) labels.push("Both sides");
  if (views.includes("base")) labels.push("Top and base");
  return labels.length ? `${labels.join(" · ")} - ${description}` : description;
}

export function listingPhotoEvidence(listing: EvidenceListing, images: EvidenceImage[] = []) {
  const required = requiredPhotoViews(listing);
  const provided = new Set(images.flatMap(image => photoViewsFromAlt(image.alt)));
  const minimumPhotos = isFactorySealed(listing.packagingCondition) ? 2 : 4;
  const missing: string[] = required.filter(key => !provided.has(key)).map(key => photoViews.find(view => view.key === key)!.label);
  if (images.length < minimumPhotos) missing.unshift(`At least ${minimumPhotos} actual-item photos`);
  const unconfirmedPhotos = images.flatMap((image, index) => ambiguousPhotoLabels(image.alt).length ? [index + 1] : []);
  if (unconfirmedPhotos.length) missing.push(`Confirm legacy labels on photo${unconfirmedPhotos.length === 1 ? "" : "s"} ${unconfirmedPhotos.join(", ")}`);
  return { required, missing, complete: missing.length === 0, minimumPhotos, unconfirmedPhotos };
}

// File identity survives reordering in the upload form. Labels are sent with that file.
const selectedPhotoViews = new WeakMap<File, PhotoView[]>();
export function setSelectedPhotoViews(file: File, views: PhotoView[]) { selectedPhotoViews.set(file, views); }
export function getSelectedPhotoViews(file: File) { return selectedPhotoViews.get(file) ?? []; }
