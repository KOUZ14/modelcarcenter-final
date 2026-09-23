import { and, asc, desc, eq, ne, gt, gte, lte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogProducts, productImages, products, sellers } from "@/db/schema";
import { normalizeSearch } from "./business";
import { POLICY_VERSION } from "./legal";
import type { CatalogResponse, ProductDetail, ProductSummary } from "./types";
import { getCatalogProduct } from "./catalog-products";
import { parsePriceRange } from "./price-range";
import { normalizeScale } from "./catalog-product-rules";

export type CatalogQuery = {
  q?: string;
  scale?: string;
  manufacturer?: string;
  seller?: string;
  condition?: string;
  availability?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
};

export const productSelection = {
  id: products.id,
  catalogProductId: products.catalogProductId,
  // Exact catalog membership only: visually similar releases remain separate.
  availableOfferCount: sql<number>`CASE WHEN ${products.catalogProductId} IS NULL THEN 1 ELSE (
    SELECT count(*) FROM products offer JOIN sellers store ON store.id = offer.seller_id
    WHERE offer.catalog_product_id = ${products.catalogProductId}
      AND offer.status = 'active' AND store.status = 'active'
      AND store.seller_terms_version = ${POLICY_VERSION} AND store.seller_terms_accepted_at IS NOT NULL
      AND (offer.availability_type = 'preorder' OR offer.inventory_quantity - offer.reserved_quantity > 0)
  ) END`.mapWith(Number),
  conditionNotes: products.conditionNotes,
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
  saleUnit: sql<string | null>`(SELECT json_extract(b.terms, '$.saleUnit') FROM incoming_batches b WHERE b.listing_id = ${products.id} LIMIT 1)`,
  unitsPerPack: sql<number | null>`(SELECT json_extract(b.terms, '$.unitsPerPack') FROM incoming_batches b WHERE b.listing_id = ${products.id} LIMIT 1)`,
  primaryImageUrl: products.primaryImageUrl,
  keywords: products.keywords,
  defaultShippingCents: sellers.defaultShippingCents,
  shippingMode: sellers.shippingMode,
  handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
  createdAt: products.createdAt,
};

export async function getCatalogListings(catalogProductId: string) {
  const model = await getCatalogProduct(catalogProductId);
  if (!model) return null;
  const listings = await getDb().select(productSelection).from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.catalogProductId, model.id), ...activeConditions({})))
    .orderBy(asc(products.priceCents), asc(products.id));
  return { model, listings: listings as ProductSummary[] };
}

export function activeConditions(query: CatalogQuery): SQL[] {
  const { minCents, maxCents } = parsePriceRange(query);
  const conditions: SQL[] = [
    eq(products.status, "active"),
    eq(sellers.status, "active"),
    eq(sellers.sellerTermsVersion, POLICY_VERSION),
    isNotNull(sellers.sellerTermsAcceptedAt),
    sql`(${products.availabilityType} = 'preorder' OR ${products.inventoryQuantity} - ${products.reservedQuantity} > 0)`,
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
  if (minCents !== null || maxCents !== null) {
    // An unpriced preorder is not a free model and cannot match a budget.
    conditions.push(eq(products.currency, "usd"), sql`NOT (${products.availabilityType} = 'preorder' AND ${products.priceCents} = 0)`);
  }
  if (minCents !== null) conditions.push(gte(products.priceCents, minCents));
  if (maxCents !== null) conditions.push(lte(products.priceCents, maxCents));
  if (query.availability === "in_stock") conditions.push(eq(products.availabilityType, "in_stock"), gt(sql<number>`${products.inventoryQuantity} - ${products.reservedQuantity}`, 0));
  if (query.availability === "preorder") conditions.push(eq(products.availabilityType, "preorder"));
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
      ? [asc(sql`CASE WHEN ${products.availabilityType} = 'preorder' AND ${products.priceCents} = 0 THEN 1 ELSE 0 END`), asc(products.priceCents), desc(products.createdAt), desc(products.id)]
      : query.sort === "price_desc"
        ? [desc(products.priceCents), desc(products.createdAt), desc(products.id)]
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
        .select({ value: products.scale, inStock: sql<number>`sum(CASE WHEN ${products.availabilityType} = 'in_stock' AND ${products.inventoryQuantity} - ${products.reservedQuantity} > 0 THEN 1 ELSE 0 END)`.mapWith(Number) })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(...activeConditions({})))
        .groupBy(products.scale)
        .orderBy(asc(products.scale)),
      db
        .select({ value: products.modelManufacturer, inStock: sql<number>`sum(CASE WHEN ${products.availabilityType} = 'in_stock' AND ${products.inventoryQuantity} - ${products.reservedQuantity} > 0 THEN 1 ELSE 0 END)`.mapWith(Number) })
        .from(products)
        .innerJoin(sellers, eq(products.sellerId, sellers.id))
        .where(and(...activeConditions({})))
        .groupBy(products.modelManufacturer)
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
    stockCounts: {
      scales: Object.fromEntries(scales.map(item => [item.value, item.inStock])),
      manufacturers: Object.fromEntries(manufacturers.map(item => [item.value, item.inStock])),
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
  const db = getDb();
  // Choose one active listing per different release before applying the limit.
  // More sellers of the current release belong in "Other offers", not here.
  const representatives = db.select({ id: sql<string>`min(${products.id})` })
    .from(products).innerJoin(sellers, eq(products.sellerId, sellers.id))
    .leftJoin(catalogProducts, eq(products.catalogProductId, catalogProducts.id))
    .where(and(...activeConditions({}),
      eq(sql`coalesce(${catalogProducts.scale}, ${products.scale})`, normalizeScale(product.scale)),
      eq(products.vehicleMake, product.vehicleMake), ne(products.id, product.id),
      product.catalogProductId ? sql`(${products.catalogProductId} IS NULL OR ${products.catalogProductId} <> ${product.catalogProductId})` : undefined))
    .groupBy(sql`coalesce(${products.catalogProductId}, ${products.id})`);
  return await db.select(productSelection).from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(inArray(products.id, representatives))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(Math.max(1, Math.min(48, limit))) as ProductSummary[];
}

export async function getSellerStorefront(slug: string, query: Pick<CatalogQuery, "q" | "scale" | "sort" | "page"> = {}) {
  const db = getDb();
  const sellerRows = await db
    .select({
      id: sellers.id,
      slug: sellers.slug,
      storeName: sellers.storeName,
      websiteUrl: sellers.websiteUrl,
      logoUrl: sellers.logoUrl,
      description: sellers.description,
      specialty: sellers.specialty,
      packingApproach: sellers.packingApproach,
      shippingOriginRegion: sellers.shippingOriginRegion,
      shippingOriginCountry: sellers.shippingOriginCountry,
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
  const seller = sellerRows[0];
  const [catalog, scales] = await Promise.all([
    searchCatalog({ q: query.q, scale: query.scale, sort: query.sort, page: query.page, seller: seller.id, pageSize: 24 }),
    db.selectDistinct({ value: products.scale }).from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(and(...activeConditions({ seller: seller.id })))
      .orderBy(asc(products.scale)),
  ]);
  return { seller, products: catalog.products, catalog, scales: scales.map(item => item.value) };
}

export function catalogErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("D1 binding") || message.includes("no such table")) {
    return "Inventory is temporarily unavailable. Please try again shortly.";
  }
  return "The catalog is temporarily unavailable. Please try again.";
}
