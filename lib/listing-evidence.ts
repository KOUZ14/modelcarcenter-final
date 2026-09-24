/** Seller-supplied view labels are evidence pointers, never an inspection guarantee. */
export const photoViews = [
  { key: "front", label: "Front view" },
  { key: "rear", label: "Rear view" },
  { key: "sides", label: "Both sides" },
  { key: "base", label: "Top and base" },
  { key: "packaging", label: "Included box and labels" },
  { key: "seal", label: "Factory seal" },
  { key: "accessories", label: "Included accessories / certificate" },
  { key: "issues", label: "Disclosed defects / repairs" },
] as const;
export type PhotoView = (typeof photoViews)[number]["key"];
type EvidenceListing = Partial<Record<"packagingCondition" | "originalBoxStatus" | "accessories" | "coaStatus" | "defects" | "missingParts" | "restorationCustomization", unknown>>;
export type EvidenceImage = { id?: string; url?: string; alt?: string };

export function hasDisclosedDetail(value: unknown) {
  const text = String(value ?? "").trim();
  return Boolean(text && !/^(none(?: known| included)?|no(?:ne)? (?:known )?(?:defects|issues|damage|missing parts|repairs|accessories)|not applicable|n\/a|not included)[.!]?$/i.test(text));
}

export function requiredPhotoViews(listing: EvidenceListing): PhotoView[] {
  const sealed = listing.packagingCondition === "sealed";
  const views: PhotoView[] = sealed ? ["packaging", "seal"] : ["front", "rear", "sides", "base"];
  if (!sealed && ["included", "reproduction"].includes(String(listing.originalBoxStatus))) views.push("packaging");
  // Do not require a factory-sealed model to be opened for evidence.
  if (!sealed && (hasDisclosedDetail(listing.accessories) || listing.coaStatus === "included")) views.push("accessories");
  if ([listing.defects, listing.missingParts, listing.restorationCustomization].some(hasDisclosedDetail)) views.push("issues");
  return views;
}

export function photoViewsFromAlt(alt = ""): PhotoView[] {
  const labels = alt.split(/ [\u2014-] /)[0].split(" · ");
  return photoViews.filter(view => labels.includes(view.label)).map(view => view.key);
}

export function photoAltForViews(views: readonly string[], description: string) {
  const labels = photoViews.filter(view => views.includes(view.key)).map(view => view.label);
  return labels.length ? `${labels.join(" · ")} - ${description}` : description;
}

export function listingPhotoEvidence(listing: EvidenceListing, images: EvidenceImage[] = []) {
  const required = requiredPhotoViews(listing);
  const provided = new Set(images.flatMap(image => photoViewsFromAlt(image.alt)));
  const minimumPhotos = listing.packagingCondition === "sealed" ? 2 : 4;
  const missing: string[] = required.filter(key => !provided.has(key)).map(key => photoViews.find(view => view.key === key)!.label);
  if (images.length < minimumPhotos) missing.unshift(`At least ${minimumPhotos} actual-item photos`);
  return { required, missing, complete: missing.length === 0, minimumPhotos };
}

// File identity survives reordering in the upload form. Labels are sent with that file.
const selectedPhotoViews = new WeakMap<File, PhotoView[]>();
export function setSelectedPhotoViews(file: File, views: PhotoView[]) { selectedPhotoViews.set(file, views); }
export function getSelectedPhotoViews(file: File) { return selectedPhotoViews.get(file) ?? []; }
