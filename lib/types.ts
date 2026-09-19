export type ProductSummary = {
  id: string;
  catalogProductId?: string | null;
  availableOfferCount?: number;
  conditionNotes?: string;
  sellerId: string;
  sellerSlug: string;
  sellerName: string;
  sellerType: "professional" | "collector";
  slug: string;
  sellerSku: string;
  title: string;
  description: string;
  scale: string;
  modelManufacturer: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string | null;
  color: string | null;
  condition: string;
  modelCondition: string;
  packagingCondition: string;
  originalBoxStatus: string;
  missingParts: string;
  defects: string;
  restorationCustomization: string;
  material: string;
  productNumber: string | null;
  editionSerial: string | null;
  coaStatus: string;
  accessories: string;
  provenance: string;
  photoFrontChecked: boolean;
  photoRearChecked: boolean;
  photoSidesChecked: boolean;
  photoBaseChecked: boolean;
  photoPackagingChecked: boolean;
  photoIssuesChecked: boolean;
  priceCents: number;
  currency: string;
  inventoryQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  availabilityType: "in_stock" | "preorder";
  releaseDate: string | null;
  saleUnit?: string | null;
  unitsPerPack?: number | null;
  primaryImageUrl: string | null;
  keywords: string;
  defaultShippingCents: number;
  shippingMode: "calculated" | "flat" | "free";
  handlingTimeBusinessDays: number;
  createdAt: string;
};

export type ProductDetail = ProductSummary & {
  sellerDescription: string;
  sellerWebsiteUrl: string | null;
  sellerLogoUrl: string | null;
  shippingPolicySummary: string;
  returnPolicySummary: string;
  images: Array<{ id: string; url: string; alt: string; sortOrder: number }>;
};

export type CatalogResponse = {
  products: ProductSummary[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  filters: {
    scales: string[];
    manufacturers: string[];
    sellers: Array<{ id: string; name: string }>;
    conditions: string[];
  };
  stockCounts?: { scales: Record<string, number>; manufacturers: Record<string, number> };
};

export type CartItem = {
  productId: string;
  slug: string;
  sellerId: string;
  sellerName: string;
  title: string;
  scale: string;
  modelManufacturer: string;
  imageUrl: string | null;
  priceCents: number;
  currency: string;
  availableQuantity: number;
  availabilityType: "in_stock" | "preorder";
  releaseDate: string | null;
  shippingCents: number;
  shippingMode: "calculated" | "flat" | "free";
  quantity: number;
};

export type ShippingAddress = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};
