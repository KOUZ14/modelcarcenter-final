import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { products, productImages, orders, orderItems, incomingBatches, sellers } from "@/db/schema";
import { storeListingIssues } from "./store-listing-readiness";
import { buildSellerSetup } from "./seller-setup";
import { buildStoreAnalytics } from "./store-rules";
import { buildSellerHubMetrics } from "./seller-hub";
import { determineMarketplaceFee, foundingFeeOffer } from "./fees";
import { config } from "./config";
import type { StoreData } from "@/components/store-dashboard";

export type InventoryQuery = { q?: string; filter?: string; stock?: string; page?: string; edit?: string; preorder?: string };

export async function getStoreInventoryProduct(sellerId: string, productId: string) {
  const db = getDb();
  const [product] = await db.select().from(products).where(and(eq(products.sellerId, sellerId), eq(products.id, productId))).limit(1);
  if (!product) return null;
  const [images, batches] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder)),
    product.availabilityType === "preorder" ? db.select().from(incomingBatches).where(eq(incomingBatches.listingId, product.id)).limit(1) : Promise.resolve([]),
  ]);
  const batch = batches[0];
  return { ...product, detailsLoaded: true, images, preorder: batch ? { batchId: batch.id, capacity: batch.capacity, cutoff: batch.cutoffAt.slice(0, 10), buyerLimit: JSON.parse(batch.terms).buyerLimit } : null };
}

/** Inventory does not need buyer addresses, order history, tracking events or growth analytics. */
export async function getStoreInventoryWorkspace(store: typeof sellers.$inferSelect, query: InventoryQuery): Promise<StoreData> {
  const db = getDb();
  const now = new Date();
  const [index, imageLabels, batches, orderCounts] = await Promise.all([
    db.select({ id: products.id, title: products.title, sellerSku: products.sellerSku, vehicleMake: products.vehicleMake, vehicleModel: products.vehicleModel,
      catalogProductId: products.catalogProductId, modelCondition: products.modelCondition, packagingCondition: products.packagingCondition, originalBoxStatus: products.originalBoxStatus,
      coaStatus: products.coaStatus, missingParts: products.missingParts, defects: products.defects, restorationCustomization: products.restorationCustomization, accessories: products.accessories,
      priceCents: products.priceCents, inventoryQuantity: products.inventoryQuantity, reservedQuantity: products.reservedQuantity, status: products.status, availabilityType: products.availabilityType,
      releaseDate: products.releaseDate, primaryImageUrl: products.primaryImageUrl, createdAt: products.createdAt }).from(products).where(eq(products.sellerId, store.id)).orderBy(desc(products.updatedAt), asc(products.id)),
    db.select({ productId: productImages.productId, alt: productImages.alt }).from(productImages).innerJoin(products, eq(products.id, productImages.productId)).where(eq(products.sellerId, store.id)),
    db.select({ batch: incomingBatches }).from(incomingBatches).innerJoin(products, eq(products.id, incomingBatches.listingId)).where(eq(products.sellerId, store.id)),
    db.select({ paid: sql<number>`count(*)`.mapWith(Number), unfulfilled: sql<number>`coalesce(sum(case when ${orders.fulfillmentStatus} in ('unfulfilled', 'processing') then 1 else 0 end), 0)`.mapWith(Number) }).from(orders).where(and(eq(orders.sellerId, store.id), inArray(orders.paymentStatus, ["paid", "partially_refunded"]))),
  ]);
  const labels = new Map<string, { alt: string }[]>();
  for (const image of imageLabels) { const list = labels.get(image.productId) ?? []; list.push({ alt: image.alt }); labels.set(image.productId, list); }
  const batchById = new Map(batches.map(({ batch }) => [batch.listingId, batch]));
  const issues = new Map(index.map(row => [row.id, storeListingIssues({ ...row, preorderCapacity: batchById.get(row.id)?.capacity }, labels.get(row.id) ?? [], now)]));
  const matches = (row: typeof index[number], filter: string) => filter === "all" || (filter === "listed" ? ["active", "sold_out"].includes(row.status) : filter === "attention" ? Object.keys(issues.get(row.id) ?? {}).length > 0 || row.status === "rejected" : filter === "draft" ? ["draft", "pending_review"].includes(row.status) : row.status === filter);
  const filter = ["draft", "listed", "inactive", "attention"].includes(query.filter ?? "") ? query.filter! : "all";
  const stock = ["low", "out", "preorders", "slow"].includes(query.stock ?? query.filter ?? "") ? (query.stock ?? query.filter)! : "all";
  const search = (query.q ?? "").trim().slice(0, 200);
  const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
  const recentSales = stock === "slow" ? await db.selectDistinct({ id: orderItems.productId }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(eq(orders.sellerId, store.id), inArray(orders.paymentStatus, ["paid", "partially_refunded"]), sql`coalesce(${orders.paidAt}, ${orders.createdAt}) >= ${cutoff}`)) : [];
  const recent = new Set(recentSales.map(row => row.id));
  const visible = index.filter(row => {
    if (!matches(row, filter) || !`${row.title} ${row.sellerSku} ${row.vehicleMake} ${row.vehicleModel}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (stock === "all") return true;
    if (stock === "preorders") return row.availabilityType === "preorder";
    if (row.availabilityType === "preorder" || !["active", "sold_out"].includes(row.status)) return false;
    const available = row.inventoryQuantity - row.reservedQuantity;
    return stock === "low" ? available > 0 && available <= 2 : stock === "out" ? available <= 0 : available > 0 && row.createdAt <= cutoff && !recent.has(row.id);
  });
  const pageSize = 50;
  const requestedPage = Math.max(1, Math.floor(Number(query.page) || 1));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(visible.length / pageSize)));
  const ids = visible.slice((page - 1) * pageSize, page * pageSize).map(row => row.id);
  const [fullRows, editor] = await Promise.all([
    ids.length ? db.select().from(products).where(and(eq(products.sellerId, store.id), inArray(products.id, ids))).orderBy(desc(products.updatedAt), asc(products.id)) : Promise.resolve([]),
    query.edit && query.edit !== "new" ? getStoreInventoryProduct(store.id, query.edit) : query.preorder ? getStoreInventoryProduct(store.id, query.preorder) : Promise.resolve(null),
  ]);
  const inventory = fullRows.map(row => { const batch = batchById.get(row.id); return { ...row, detailsLoaded: false, images: [], issues: issues.get(row.id), preorder: batch ? { batchId: batch.id, capacity: batch.capacity, cutoff: batch.cutoffAt.slice(0, 10), buyerLimit: JSON.parse(batch.terms).buyerLimit } : null }; });
  return {
    store, asOf: now.toISOString(), setup: buildSellerSetup(store, index, Boolean(config.shippoApiKey)),
    fee: { ...determineMarketplaceFee(), foundingFeeOffer: foundingFeeOffer(store) }, inventory, inventoryEditor: query.edit ? editor : null, inventoryPreorder: query.preorder && !query.edit ? editor : null,
    inventoryPage: { page, pageSize, total: visible.length, totalInventory: index.length, counts: Object.fromEntries(["all", "draft", "listed", "inactive", "attention"].map(key => [key, index.filter(row => matches(row, key)).length])), search, filter, stock },
    orders: [], analytics: { ...buildStoreAnalytics([], [], index), paidOrders: orderCounts[0]?.paid ?? 0, unfulfilledOrders: orderCounts[0]?.unfulfilled ?? 0 }, hub: buildSellerHubMetrics([], [], [], now),
    demand: { savedBuyers: 0, products: [], wants: [], returnOrderIds: [] },
    shipping: { configured: Boolean(config.shippoApiKey), insuranceThresholdCents: config.shippoInsuranceThresholdCents, signatureThresholdCents: config.shippoSignatureThresholdCents },
  };
}
