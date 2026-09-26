import { and, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { catalogProducts, products, sellers } from "@/db/schema";
import { catalogListingSnapshot } from "./catalog-product-rules";
import { prepareListingCatalog } from "./catalog-products";
import { integer, moneyToCents, parseCsv, planImportUpserts, requiredString, validateImportRows, ValidationError } from "./validation";
import {
  notifyRestockSubscribers,
  syncPreorderReleaseSchedule,
} from "./availability";

export const inventoryCsvHeaders = [
  "seller_sku",
  "title",
  "description",
  "scale",
  "model_manufacturer",
  "vehicle_make",
  "vehicle_model",
  "vehicle_year",
  "color",
  "model_condition",
  "packaging_condition",
  "original_box",
  "missing_parts",
  "defects",
  "restoration_customization",
  "material",
  "product_number",
  "edition_serial",
  "coa",
  "accessories",
  "provenance",
  "price",
  "inventory_quantity",
  "availability_type",
  "release_date",
  "keywords",
];

export function previewInventoryCsv(csv: string) {
  if (csv.length > 5_000_000) throw new Error("CSV is larger than the 5 MB V1 import limit.");
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("CSV must contain a header and at least one product row.");
  if (rows.length > 5_000) throw new Error("CSV contains more than the 5,000-row V1 import limit.");
  return validateImportRows(rows);
}

export async function previewStoreInventoryCsv(sellerId: string, csv: string) {
  const preview = previewInventoryCsv(csv);
  const existing = await getDb().select({ id: products.id, sellerSku: products.sellerSku, slug: products.slug, availabilityType: products.availabilityType, reservedQuantity: products.reservedQuantity }).from(products).where(eq(products.sellerId, sellerId));
  const planned = planImportUpserts(existing, preview.valid);
  const errors = [...preview.errors];
  const valid = planned.filter(row => {
    const previous = existing.find(product => product.id === row.id);
    const rowErrors: string[] = [];
    if (row.availabilityType === "preorder" || previous?.availabilityType === "preorder") rowErrors.push("Use the listing form and Preorders to manage preorder stock.");
    if (previous && row.inventoryQuantity < previous.reservedQuantity) rowErrors.push(`Total stock cannot be lower than ${previous.reservedQuantity} units reserved for existing buyers.`);
    if (rowErrors.length) { errors.push({ row: row.rowNumber, errors: rowErrors }); return false; }
    return true;
  });
  return { valid, validCount: valid.length, errors: errors.sort((a, b) => a.row - b.row) };
}

export async function updateStoreStock(sellerId: string, rows: unknown) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new ValidationError("Change between 1 and 5,000 inventory items.");
  const updates = rows.map(row => {
    if (!row || typeof row !== "object") throw new ValidationError("Choose valid inventory rows.");
    return { id: requiredString(row.id, "listing ID", 100), priceCents: moneyToCents(row.price, "price"), inventoryQuantity: integer(row.inventoryQuantity, "total stock", 0, 1000000) };
  });
  if (new Set(updates.map(row => row.id)).size !== updates.length) throw new ValidationError("Each listing can appear only once in a stock update.");
  const db = getDb();
  const existing = await db.select().from(products).where(eq(products.sellerId, sellerId));
  for (const row of updates) {
    const product = existing.find(item => item.id === row.id);
    if (!product) throw new ValidationError("A selected listing does not belong to this store. Refresh inventory and try again.");
    if (product.availabilityType === "preorder") throw new ValidationError(`${product.sellerSku}: update preorder quantities in Preorders.`);
    if (row.inventoryQuantity < product.reservedQuantity) throw new ValidationError(`${product.sellerSku}: total stock cannot be lower than ${product.reservedQuantity} reserved units.`);
  }
  const d1 = getD1();
  await d1.batch(updates.map(row => {
    const query = db.update(products).set({ priceCents: row.priceCents, inventoryQuantity: sql`max(${row.inventoryQuantity}, ${products.reservedQuantity})`, status: sql`CASE WHEN ${products.status} = 'sold_out' AND ${row.inventoryQuantity} > ${products.reservedQuantity} THEN 'active' WHEN ${products.status} = 'active' AND ${row.inventoryQuantity} <= ${products.reservedQuantity} THEN 'sold_out' ELSE ${products.status} END`, updatedAt: new Date().toISOString() }).where(and(eq(products.sellerId, sellerId), eq(products.id, row.id))).toSQL();
    return d1.prepare(query.sql).bind(...query.params);
  }));
  await Promise.all(updates.filter(row => { const previous = existing.find(item => item.id === row.id)!; return previous.inventoryQuantity <= previous.reservedQuantity && row.inventoryQuantity > previous.reservedQuantity; }).map(row => notifyRestockSubscribers(row.id)));
  return { updated: updates.length };
}

export async function commitInventoryCsv(sellerId: string, csv: string, retry = true) {
  const db = getDb();
  const seller = await db
    .select({
      id: sellers.id,
      ownerUserId: sellers.ownerUserId,
      handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
    })
    .from(sellers)
    .where(eq(sellers.id, sellerId))
    .limit(1);
  if (!seller[0]) throw new Error("Select a valid seller before importing.");
  const preview = previewInventoryCsv(csv);
  if (preview.errors.length) throw new Error("Fix every row error before committing this import.");
  const existing = await db
    .select({
      id: products.id,
      catalogProductId: products.catalogProductId,
      sellerSku: products.sellerSku,
      slug: products.slug,
      inventoryQuantity: products.inventoryQuantity,
      reservedQuantity: products.reservedQuantity,
      status: products.status,
      availabilityType: products.availabilityType,
      releaseDate: products.releaseDate,
    })
    .from(products)
    .where(eq(products.sellerId, sellerId));
  const planned = planImportUpserts(existing, preview.valid);
  const d1 = getD1();
  const statements: D1PreparedStatement[] = [];
  const catalogs = new Map<string, Awaited<ReturnType<typeof prepareListingCatalog>>>();
  const createdIds = new Set<string>();
  const statement = (query: { sql: string; params: unknown[] }) => d1.prepare(query.sql).bind(...query.params);
  for (const row of planned) {
    const previous = existing.find((item) => item.id === row.id);
    if (previous && row.inventoryQuantity < previous.reservedQuantity) throw new ValidationError(`${row.sellerSku}: stock cannot be lower than ${previous.reservedQuantity} reserved units. Refresh the preview.`);
    if (row.availabilityType === "preorder" || previous?.availabilityType === "preorder") throw new ValidationError("Create preorders in the listing form and manage customer commitments in Preorders; CSV inventory cannot create or overwrite them.");
    const payload = { ...row, manufacturerSku: row.productNumber };
    const resolved = await prepareListingCatalog(payload, seller[0].ownerUserId, previous?.catalogProductId);
    const key = resolved.model.skuKey ? JSON.stringify([resolved.model.manufacturerKey, resolved.model.skuKey]) : resolved.model.id;
    const catalog = catalogs.get(key) ?? resolved;
    catalogs.set(key, catalog);
    if (catalog.isNew && !createdIds.has(catalog.model.id)) {
      statements.push(statement(db.insert(catalogProducts).values({ ...catalog.model, catalogStatus: "unverified", createdByUserId: catalog.createdByUserId }).toSQL()));
      createdIds.add(catalog.model.id);
    }
    const { operation, id, slug, ...values } = row;
    void operation;
    const snapshot = catalogListingSnapshot(catalog.model);
    statements.push(statement(db.insert(products).values({
      id, slug, ...values, ...snapshot, sellerId, currency: "usd", reservedQuantity: 0, status: "draft",
    }).onConflictDoUpdate({
      target: [products.sellerId, products.sellerSku],
      set: {
        ...values, ...snapshot,
        inventoryQuantity: sql`max(${row.inventoryQuantity}, ${products.reservedQuantity})`,
        status: sql`CASE WHEN ${products.status} = 'sold_out' AND ${row.inventoryQuantity} > ${products.reservedQuantity} THEN 'active' ELSE ${products.status} END`,
        updatedAt: new Date().toISOString(),
      },
    }).toSQL()));
  }
  try { await d1.batch(statements); }
  catch (error) {
    const message = String(error instanceof Error ? error.message + " " + error.cause : error);
    if (retry && message.includes("UNIQUE constraint failed") && (message.includes("catalog_products.") || message.includes("catalog_sku_identity_unique"))) return commitInventoryCsv(sellerId, csv, false);
    throw error;
  }
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const restocked = planned.filter((row) => {
    const previous = existingById.get(row.id);
    return Boolean(
      previous &&
      previous.inventoryQuantity - previous.reservedQuantity < 1 &&
      row.inventoryQuantity - previous.reservedQuantity > 0,
    );
  });
  await Promise.all(
    restocked.map((row) => notifyRestockSubscribers(row.id)),
  );
  await Promise.all(
    planned.flatMap((row) => {
      const previous = existingById.get(row.id);
      return previous
        ? [
            syncPreorderReleaseSchedule({
              productId: row.id,
              title: row.title,
              previousAvailabilityType: previous.availabilityType,
              previousReleaseDate: previous.releaseDate,
              availabilityType: row.availabilityType,
              releaseDate: row.releaseDate,
              handlingTimeBusinessDays: seller[0].handlingTimeBusinessDays,
            }),
          ]
        : [];
    }),
  );
  const created = planned.filter((row) => row.operation === "insert").length;
  return { imported: planned.length, created, updated: planned.length - created };
}

export function inventoryCsvTemplate() {
  return `${inventoryCsvHeaders.join(",")}\nSKU-001,Example model,Short plain-text description,1:18,AUTOart,Porsche,911,1973,Silver,mint,excellent,included,None known,None known,None known,Die-cast metal,78123,147 of 500,included,"Display base; booklet",Single-owner collection,249.95,2,in_stock,,"porsche 911 classic"\n`;
}
