import { and, asc, desc, eq, gt, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { productImages, products, sellers } from "@/db/schema";
import { normalizeSearch } from "./business";
import { POLICY_VERSION } from "./legal";
import type { CatalogResponse, ProductDetail, ProductSummary } from "./types";

export type CatalogQuery = {
  q?: string;
  scale?: string;
  manufacturer?: string;
  seller?: string;
  condition?: string;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
};

const productSelection = {
  id: products.id,
  sellerId: products.sellerId,
  sellerSlug: sellers.slug,
  sellerName: sellers.storeName,
  sellerType: sellers.sellerType,
  slug: products.slug,
  sellerSku: products.sellerSku,
  title: products.title,
  description: products.description,
  scale: products.scale,
  modelManufacturer: products.modelManufacturer,
  vehicleMake: products.vehicleMake,
  vehicleModel: products.vehicleModel,
  vehicleYear: products.vehicleYear,
  color: products.color,
  condition: products.condition,
  modelCondition: products.modelCondition,
  packagingCondition: products.packagingCondition,
  originalBoxStatus: products.originalBoxStatus,
  missingParts: products.missingParts,
  defects: products.defects,
  restorationCustomization: products.restorationCustomization,
  material: products.material,
  productNumber: products.productNumber,
  editionSerial: products.editionSerial,
  coaStatus: products.coaStatus,
  accessories: products.accessories,
  provenance: products.provenance,
  photoFrontChecked: products.photoFrontChecked,
  photoRearChecked: products.photoRearChecked,
  photoSidesChecked: products.photoSidesChecked,
  photoBaseChecked: products.photoBaseChecked,
  photoPackagingChecked: products.photoPackagingChecked,
  photoIssuesChecked: products.photoIssuesChecked,
  priceCents: products.priceCents,
  currency: products.currency,
  inventoryQuantity: products.inventoryQuantity,
  reservedQuantity: products.reservedQuantity,
  availableQuantity: sql<number>`${products.inventoryQuantity} - ${products.reservedQuantity}`,
  availabilityType: products.availabilityType,
  releaseDate: products.releaseDate,
  primaryImageUrl: products.primaryImageUrl,
  keywords: products.keywords,
  defaultShippingCents: sellers.defaultShippingCents,
  shippingMode: sellers.shippingMode,
  handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
  createdAt: products.createdAt,
};

function activeConditions(query: CatalogQuery): SQL[] {
  const conditions: SQL[] = [
    eq(products.status, "active"),
    eq(sellers.status, "active"),
    eq(sellers.sellerTermsVersion, POLICY_VERSION),
    isNotNull(sellers.sellerTermsAcceptedAt),
    gt(
      sql<number>`${products.inventoryQuantity} - ${products.reservedQuantity}`,
      0,
    ),
  ];
  const search = normalizeSearch(query.q ?? "");
  for (const term of search.split(" ").filter(Boolean)) {
    const needle = `%${term.replaceAll("%", "").replaceAll("_", "")}%`;
    conditions.push(sql`lower(
      ${products.title} || ' ' || ${products.vehicleMake} || ' ' || ${products.vehicleModel} || ' ' ||
      coalesce(${products.vehicleYear}, '') || ' ' || ${products.scale} || ' ' ||
      ${products.modelManufacturer} || ' ' || ${sellers.storeName} || ' ' ||
      ${products.keywords} || ' ' || coalesce(${products.color}, '') || ' ' ||
      ${products.material} || ' ' || coalesce(${products.productNumber}, '') || ' ' ||
      coalesce(${products.editionSerial}, '')
    ) LIKE ${needle}`);
  }
  if (query.scale) conditions.push(eq(products.scale, query.scale));
  if (query.manufacturer)
    conditions.push(eq(products.modelManufacturer, query.manufacturer));
  if (query.seller) conditions.push(eq(products.sellerId, query.seller));
  if (query.condition)
    conditions.push(
      eq(
        products.modelCondition,
        query.condition as
          | "not_specified"
          | "mint"
          | "near_mint"
          | "excellent"
          | "good"
          | "fair"
          | "poor",
      ),
    );
  return conditions;
}

export async function searchCatalog(
  query: CatalogQuery = {},
): Promise<CatalogResponse> {
  const db = getDb();
  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? 12));
  const page = Math.max(1, query.page ?? 1);
  const conditions = activeConditions(query);
  const order =
    query.sort === "price_asc"
      ? [asc(products.priceCents), desc(products.createdAt)]
      : query.sort === "price_desc"
        ? [desc(products.priceCents), desc(products.createdAt)]
        : [desc(products.createdAt), desc(products.id)];

  const [rows, countRows, scales, manufacturers, sellerRows, conditionsRows] =
    await Promise.all([
      db
        .select(productSelection)
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(...conditions))
        .orderBy(...order)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(...conditions)),
      db
        .selectDistinct({ value: products.scale })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(eq(products.status, "active"), eq(sellers.status, "active"), eq(sellers.sellerTermsVersion, POLICY_VERSION), isNotNull(sellers.sellerTermsAcceptedAt)))
        .orderBy(asc(products.scale)),
      db
        .selectDistinct({ value: products.modelManufacturer })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(eq(products.status, "active"), eq(sellers.status, "active"), eq(sellers.sellerTermsVersion, POLICY_VERSION), isNotNull(sellers.sellerTermsAcceptedAt)))
        .orderBy(asc(products.modelManufacturer)),
      db
        .selectDistinct({ id: sellers.id, name: sellers.storeName })
        .from(sellers)
        .innerJoin(products, eq(products.sellerId, sellers.id))
        .where(and(eq(products.status, "active"), eq(sellers.status, "active"), eq(sellers.sellerTermsVersion, POLICY_VERSION), isNotNull(sellers.sellerTermsAcceptedAt)))
        .orderBy(asc(sellers.storeName)),
      db
        .selectDistinct({ value: products.modelCondition })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(eq(products.status, "active"), eq(sellers.status, "active"), eq(sellers.sellerTermsVersion, POLICY_VERSION), isNotNull(sellers.sellerTermsAcceptedAt)))
        .orderBy(asc(products.modelCondition)),
    ]);

  const total = Number(countRows[0]?.count ?? 0);
  return {
    products: rows as ProductSummary[],
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
    filters: {
      scales: scales.map((item) => item.value),
      manufacturers: manufacturers.map((item) => item.value),
      sellers: sellerRows,
      conditions: conditionsRows.map((item) => item.value),
    },
  };
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductDetail | null> {
  const db = getDb();
  const rows = await db
    .select({
      ...productSelection,
      sellerDescription: sellers.description,
      sellerWebsiteUrl: sellers.websiteUrl,
      sellerLogoUrl: sellers.logoUrl,
      shippingPolicySummary: sellers.shippingPolicySummary,
      returnPolicySummary: sellers.returnPolicySummary,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(
      and(
        eq(products.slug, slug),
        inArray(products.status, ["active", "sold_out"]),
        eq(sellers.status, "active"),
        eq(sellers.sellerTermsVersion, POLICY_VERSION),
        isNotNull(sellers.sellerTermsAcceptedAt),
      ),
    )
    .limit(1);
  const product = rows[0];
  if (!product) return null;
  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.sortOrder));
  if (!images.length && product.primaryImageUrl) {
    images.push({
      id: `${product.id}-primary`,
      productId: product.id,
      url: product.primaryImageUrl,
      source: "external",
      storageKey: null,
      uploadedByUserId: null,
      alt: `${product.modelManufacturer} ${product.title} model car`,
      sortOrder: 0,
      createdAt: product.createdAt,
    });
  }
  return { ...product, images } as ProductDetail;
}

export async function getRelatedProducts(product: ProductSummary, limit = 4) {
  const result = await searchCatalog({
    q: `${product.vehicleMake} ${product.scale}`,
    pageSize: limit + 1,
  });
  return result.products
    .filter((item) => item.id !== product.id)
    .slice(0, limit);
}

export async function getSellerStorefront(slug: string) {
  const db = getDb();
  const sellerRows = await db
    .select({
      id: sellers.id,
      slug: sellers.slug,
      storeName: sellers.storeName,
      websiteUrl: sellers.websiteUrl,
      logoUrl: sellers.logoUrl,
      description: sellers.description,
      defaultShippingCents: sellers.defaultShippingCents,
      shippingMode: sellers.shippingMode,
      handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
      shippingPolicySummary: sellers.shippingPolicySummary,
      returnPolicySummary: sellers.returnPolicySummary,
      sellerType: sellers.sellerType,
    })
    .from(sellers)
    .where(and(eq(sellers.slug, slug), eq(sellers.status, "active"), eq(sellers.sellerTermsVersion, POLICY_VERSION), isNotNull(sellers.sellerTermsAcceptedAt)))
    .limit(1);
  if (!sellerRows[0]) return null;
  const catalog = await searchCatalog({
    seller: sellerRows[0].id,
    pageSize: 48,
  });
  return { seller: sellerRows[0], products: catalog.products };
}

export function catalogErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("D1 binding") || message.includes("no such table")) {
    return "The catalog database is not ready. Apply the generated D1 migration, then try again.";
  }
  return "The catalog is temporarily unavailable. Please try again.";
}
