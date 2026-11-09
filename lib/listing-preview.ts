import type { ProductDetail } from "./types";

type PreviewImage = { id: string; url: string; alt: string };
export function buildListingPreview({ values, catalog, seller, images, primaryImageUrl, pendingImages = [], pendingCoverUrl }: {
  values: Record<string, unknown>;
  catalog: Record<string, unknown>;
  seller: Record<string, unknown> | null;
  images: PreviewImage[];
  primaryImageUrl?: string | null;
  pendingImages?: PreviewImage[];
  pendingCoverUrl?: string;
}): ProductDetail {
  const text = (key: string) => String(values[key] ?? "").trim();
  const identity = (key: string) => String(catalog[key] ?? "").trim();
  const sellerText = (key: string) => String(seller?.[key] ?? "").trim();
  const price = text("price").replace(/^\$/, "");
  const priceCents = /^\d+(\.\d{1,2})?$/.test(price) && Number(price) <= 1_000_000 ? Math.round(Number(price) * 100) : 0;
  const inventoryQuantity = /^\d+$/.test(text("quantity")) ? Number(text("quantity")) : 0;
  const reservedQuantity = Number(catalog.reservedQuantity) || 0;
  const photos = [...images, ...pendingImages];
  // Existing image order is authoritative. A new selected cover uploads first.
  if (!images.length && primaryImageUrl) photos.unshift({ id: "legacy-cover", url: primaryImageUrl, alt: "Seller photo" });
  if (pendingCoverUrl) {
    const index = photos.findIndex(image => image.url === pendingCoverUrl);
    if (index >= 0) photos.unshift(...photos.splice(index, 1));
  }
  // Explicit public fields only: never copy private address/contact data into a preview.
  return {
    id: identity("id") || "draft-preview", catalogProductId: text("catalogProductId") || identity("catalogProductId") || null,
    sellerId: sellerText("id"), sellerSlug: sellerText("slug"), sellerName: text("sellerDisplayName") || sellerText("storeName") || "Seller name not entered", sellerType: "collector",
    slug: identity("slug"), sellerSku: text("sellerSku"),
    title: text("title") || identity("title") || [identity("modelManufacturer"), identity("vehicleMake"), identity("vehicleModel")].filter(Boolean).join(" ") || "Your catalog model",
    description: text("description"), scale: identity("scale"), modelManufacturer: identity("modelManufacturer"), vehicleMake: identity("vehicleMake"), vehicleModel: identity("vehicleModel"), vehicleYear: identity("vehicleYear") || null, color: identity("color") || null,
    condition: text("modelCondition"), modelCondition: text("modelCondition"), packagingCondition: text("packagingCondition"), originalBoxStatus: text("originalBoxStatus"),
    missingParts: text("missingParts"), defects: text("defects"), restorationCustomization: text("restorationCustomization"), material: identity("material"), productNumber: identity("manufacturerSku") || identity("productNumber") || null,
    editionSerial: text("editionSerial") || null, coaStatus: text("coaStatus"), accessories: text("accessories"), provenance: text("provenance"), conditionNotes: text("conditionNotes"),
    photoFrontChecked: false, photoRearChecked: false, photoSidesChecked: false, photoBaseChecked: false, photoPackagingChecked: false, photoIssuesChecked: false,
    priceCents, currency: "usd", inventoryQuantity, reservedQuantity, availableQuantity: Math.max(0, inventoryQuantity - reservedQuantity), availabilityType: "in_stock", releaseDate: null,
    primaryImageUrl: photos[0]?.url ?? null, images: photos.map((image, sortOrder) => ({ ...image, sortOrder })), keywords: "", createdAt: identity("createdAt"),
    defaultShippingCents: 0, shippingMode: "calculated", handlingTimeBusinessDays: Number(seller?.handlingTimeBusinessDays) || 3,
    sellerDescription: text("sellerDescription"), sellerSpecialty: text("sellerSpecialty"), sellerPackingApproach: text("sellerPackingApproach"), sellerWebsiteUrl: sellerText("websiteUrl") || null, sellerLogoUrl: sellerText("logoUrl") || null,
    shippingOriginRegion: text("shippingOriginRegion") || null, shippingOriginCountry: text("shippingOriginCountry"),
    shippingPolicySummary: sellerText("shippingPolicySummary") || "Ships directly from this collector seller.", returnPolicySummary: sellerText("returnPolicySummary") || "Contact Model Car Center before returning an order.",
  };
}
