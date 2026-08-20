import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { products, sellers } from "@/db/schema";
import { parseCsv, planImportUpserts, validateImportRows } from "./validation";

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
  "condition",
  "price",
  "inventory_quantity",
  "keywords",
];

export function previewInventoryCsv(csv: string) {
  if (csv.length > 5_000_000) throw new Error("CSV is larger than the 5 MB V1 import limit.");
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error("CSV must contain a header and at least one product row.");
  if (rows.length > 5_000) throw new Error("CSV contains more than the 5,000-row V1 import limit.");
  return validateImportRows(rows);
}

export async function commitInventoryCsv(sellerId: string, csv: string) {
  const db = getDb();
  const seller = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.id, sellerId)).limit(1);
  if (!seller[0]) throw new Error("Select a valid seller before importing.");
  const preview = previewInventoryCsv(csv);
  if (preview.errors.length) throw new Error("Fix every row error before committing this import.");
  const existing = await db
    .select({ id: products.id, sellerSku: products.sellerSku, slug: products.slug })
    .from(products)
    .where(eq(products.sellerId, sellerId));
  const planned = planImportUpserts(existing, preview.valid);
  const d1 = getD1();
  const statements: D1PreparedStatement[] = [];
  for (const row of planned) {
    const productId = row.id;
    const slug = row.slug;
    statements.push(
      d1.prepare(`INSERT INTO products
        (id, seller_id, slug, seller_sku, title, description, scale, model_manufacturer, vehicle_make,
         vehicle_model, vehicle_year, color, condition, price_cents, currency, inventory_quantity,
         reserved_quantity, status, keywords)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usd', ?, 0, 'draft', ?)
        ON CONFLICT(seller_id, seller_sku) DO UPDATE SET
          title = excluded.title, description = excluded.description, scale = excluded.scale,
          model_manufacturer = excluded.model_manufacturer, vehicle_make = excluded.vehicle_make,
          vehicle_model = excluded.vehicle_model, vehicle_year = excluded.vehicle_year, color = excluded.color,
          condition = excluded.condition, price_cents = excluded.price_cents,
          inventory_quantity = CASE
            WHEN excluded.inventory_quantity >= products.reserved_quantity THEN excluded.inventory_quantity
            ELSE products.reserved_quantity
          END,
          keywords = excluded.keywords,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(productId, sellerId, slug, row.sellerSku, row.title, row.description, row.scale,
          row.modelManufacturer, row.vehicleMake, row.vehicleModel, row.vehicleYear, row.color,
          row.condition, row.priceCents, row.inventoryQuantity, row.keywords),
    );
  }
  await d1.batch(statements);
  return { imported: planned.length, created: planned.filter((row) => row.operation === "insert").length };
}

export function inventoryCsvTemplate() {
  return `${inventoryCsvHeaders.join(",")}\nSKU-001,Example model,Short plain-text description,1:18,AUTOart,Porsche,911,1973,Silver,new,249.95,2,"porsche 911 classic"\n`;
}
