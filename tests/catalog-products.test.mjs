import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import { normalizeManufacturer, normalizeScale, parseCatalogProduct } from "../lib/catalog-product-rules.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

const identity = { modelManufacturer: "AUTOart", manufacturerSku: "76001", scale: "1:18", vehicleMake: "McLaren", vehicleModel: "F1", vehicleVariant: "Road Car", color: "Silver" };

test("catalog identity normalizes manufacturer and scale without conflating SKU punctuation", () => {
  for (const value of ["Auto Art", "AUTO ART", "Autoart", "auto-art"]) assert.equal(normalizeManufacturer(value), "AUTOart");
  for (const value of ["1/18", "1:18", "18 scale", "18th scale"]) assert.equal(normalizeScale(value), "1:18");
  assert.equal(normalizeScale("1:8"), "1:8");
  assert.throws(() => normalizeScale("nonsense"));
  assert.equal(parseCatalogProduct({ ...identity, manufacturerSku: "  AB-12  " }).skuKey, "ab-12");
  assert.notEqual(parseCatalogProduct({ ...identity, manufacturerSku: "AB-12" }).skuKey, parseCatalogProduct({ ...identity, manufacturerSku: "AB12" }).skuKey);
  assert.equal(parseCatalogProduct({ ...identity, manufacturerSku: "" }).skuKey, null);
  assert.equal(parseCatalogProduct({ ...identity, upc: "036000291452" }).gtinKey, parseCatalogProduct({ ...identity, ean: "0036000291452" }).gtinKey);
  assert.throws(() => parseCatalogProduct({ ...identity, upc: "036000291459" }), /check digit/);
});

test("catalog migrations, seller writes, matching and active offers use separate model and listing records", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".catalog-test-"));
  const bundle = join(scratch, "catalog.mjs");
  const sqlite = new DatabaseSync(":memory:");
  const migrations = (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations.filter((name) => name < "0023")) sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const id of ["owner-a", "owner-b", "owner-c"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id,id,`${id}@example.test`);
  for (const id of ["a", "b"]) sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_terms_version,seller_terms_accepted_at) VALUES (?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP)").run(id,`owner-${id}`,id,`Seller ${id}`,id,`${id}@example.test`,POLICY_VERSION);
  const legacy = sqlite.prepare("INSERT INTO products (id,seller_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,color,product_number,price_cents,inventory_quantity,status,description,primary_image_url) VALUES (?, ?, ?, ?, 'Seller-specific title', ?, ?, 'McLaren','F1',?,?,?,2,'active','Scratched box','/seller-photo.jpg')");
  legacy.run("old-a", "a", "old-a", "stock-a", "1/18", "Auto Art", "Silver", "76001", 27900);
  legacy.run("old-b", "b", "old-b", "stock-b", "18th scale", "AUTOart", "Silver", "76001", 28900);
  legacy.run("no-sku-a", "a", "no-sku-a", "own-a", "1:18", "AUTOart", "Silver", null, 10000);
  legacy.run("no-sku-b", "b", "no-sku-b", "own-b", "1:18", "AUTOart", "Silver", null, 9000);
  legacy.run("different-sku", "b", "different-sku", "own-c", "1:18", "AUTOart", "Red", "76002", 25000);
  sqlite.exec("INSERT INTO product_images (id,product_id,url) VALUES ('photo','old-b','/seller-photo.jpg')");
  for (const name of migrations.filter((name) => name >= "0023")) sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));

  let beforeBatch;
  const binding = {
    prepare(query) {
      let values = [];
      return { query,
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) {
      const hook = beforeBatch; beforeBatch = undefined; if (hook) await hook();
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  globalThis.__catalogTest = { binding, db: drizzle(binding) };
  t.after(async () => { delete globalThis.__catalogTest; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({
    stdin: { contents: `export * from './lib/catalog-products.ts'; export { saveStoreProduct } from './lib/store.ts'; export { saveCollectorListing } from './lib/listings.ts'; export { getCatalogListings } from './lib/catalog.ts'; export { commitInventoryCsv, inventoryCsvTemplate } from './lib/csv-import.ts'; export { GET, POST } from './app/api/catalog-products/route.ts'; export { GET as getOffers } from './app/api/catalog-products/[id]/listings/route.ts';`, resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "catalog-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, ({ path }) => ({ path, namespace: "catalog-test" }));
      builder.onResolve({ filter: /^\.\/seller-hub-data$/ }, ({ path }) => ({ path, namespace: "catalog-test" }));
      builder.onResolve({ filter: /^\.\/availability$/ }, ({ path }) => ({ path, namespace: "catalog-test" }));
      builder.onLoad({ filter: /.*/, namespace: "catalog-test" }, ({ path }) => ({ contents:
        path === "@/db" ? "export const getDb = () => globalThis.__catalogTest.db; export const getD1 = () => globalThis.__catalogTest.binding;" :
        path === "./seller-hub-data" ? "export const getSellerHubDemand = async () => ({});" :
        `export { parseProductAvailability } from ${JSON.stringify(join(root, "lib/availability-rules.ts"))}; export const notifyRestockSubscribers = async () => {}; export const syncPreorderReleaseSchedule = async () => {};`,
        loader: "ts", resolveDir: root,
      }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  const row = (id) => sqlite.prepare("SELECT * FROM products WHERE id = ?").get(id);
  const count = () => sqlite.prepare("SELECT count(*) AS n FROM catalog_products").get().n;
  const store = (id) => ({ id, ownerUserId: `owner-${id}`, status: "active", sellerType: "professional", handlingTimeBusinessDays: 3 });
  const listing = { sellerSku: "new-stock", price: "225.00", inventoryQuantity: 1, modelCondition: "excellent", packagingCondition: "good", originalBoxStatus: "included", missingParts: "None known", defects: "Scuffed box", restorationCustomization: "None known", coaStatus: "not_applicable", accessories: "None included", conditionNotes: "Light wear on box", availabilityType: "in_stock" };
  let catalogId;

  await t.test("backfill merges only exact manufacturer numbers, preserving listing IDs, photos and seller data", () => {
    catalogId = row("old-a").catalog_product_id;
    assert.equal(catalogId, row("old-b").catalog_product_id);
    assert.notEqual(row("no-sku-a").catalog_product_id, row("no-sku-b").catalog_product_id);
    assert.notEqual(row("different-sku").catalog_product_id, catalogId);
    assert.notEqual(catalogId, "old-a");
    assert.equal(row("old-b").price_cents, 28900);
    assert.equal(sqlite.prepare("SELECT product_id FROM product_images WHERE id = 'photo'").get().product_id, "old-b");
    const model = sqlite.prepare("SELECT * FROM catalog_products WHERE id = ?").get(catalogId);
    assert.equal(model.model_car_manufacturer, "AUTOart");
    assert.equal(model.scale, "1:18");
    assert.equal(model.description, "");
    assert.equal(model.primary_image_url, null, "Do not promote a seller's photo to a shared image");
    assert.equal("price_cents" in model, false);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(() => sqlite.exec("UPDATE products SET catalog_product_id = NULL WHERE id = 'old-a'"), /must reference/);
    assert.throws(() => sqlite.exec("DELETE FROM catalog_products WHERE id = 'catalog-old-a'"), /FOREIGN KEY/);
  });

  await t.test("catalog search finds SKU and manufacturer aliases even without live offers", async () => {
    assert.equal((await api.searchCatalogProducts("76001"))[0].id, catalogId);
    assert.ok((await api.searchCatalogProducts("auto-art McLaren F1")).some((model) => model.id === catalogId));
    assert.equal((await api.searchCatalogProducts("%" )).length, 0);
    assert.equal((await api.searchCatalogProducts("_" )).length, 0);
    const response = await api.GET(new Request("http://localhost/api/catalog-products?q=76001"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).products.length, 1);
  });

  await t.test("seller listings share a model but keep condition, price, stock and seller SKU independent", async () => {
    const before = count();
    const first = await api.saveStoreProduct(store("a"), { ...listing, catalogProductId: catalogId, modelManufacturer: "Tampered", scale: "1:64" });
    const second = await api.saveStoreProduct(store("b"), { ...identity, ...listing, catalogProductId: catalogId, modelManufacturer: "auto-art", scale: "18 scale", price: "279", inventoryQuantity: 2 });
    assert.equal(count(), before);
    assert.equal(row(first.productId).catalog_product_id, row(second.productId).catalog_product_id);
    assert.equal(row(first.productId).model_manufacturer, "AUTOart");
    assert.equal(row(first.productId).scale, "1:18");
    assert.equal(row(first.productId).condition_notes, "Light wear on box");
    assert.equal(row(first.productId).price_cents, 22500);
    assert.equal(row(second.productId).price_cents, 27900);
    assert.equal(row(second.productId).inventory_quantity, 2);
    await api.saveStoreProduct(store("a"), { ...listing, id: first.productId, price: "210" });
    assert.equal(row(first.productId).price_cents, 21000);
    assert.equal(row(second.productId).price_cents, 27900);
    await assert.rejects(api.saveStoreProduct(store("b"), { ...listing, id: first.productId }), /not found/);
    await assert.rejects(api.saveStoreProduct(store("a"), { ...listing, id: first.productId, catalogProductId: row("different-sku").catalog_product_id }), /cannot be moved/);
  });

  await t.test("SKU-less matches require explicit confirmation and distinct SKUs remain distinct", async () => {
    const noSku = { ...identity, manufacturerSku: "" };
    const before = count();
    await assert.rejects(api.saveStoreProduct(store("a"), { ...listing, ...noSku, sellerSku: "unknown" }), /similar model/);
    assert.equal(count(), before);
    const result = await api.saveStoreProduct(store("a"), { ...listing, ...noSku, sellerSku: "unknown", confirmDifferentModel: true });
    assert.equal(count(), before + 1);
    assert.notEqual(row(result.productId).catalog_product_id, catalogId);
    const different = await api.saveStoreProduct(store("b"), { ...listing, ...identity, manufacturerSku: "76003", confirmDifferentModel: true, sellerSku: "another" });
    assert.notEqual(row(different.productId).catalog_product_id, catalogId);
    const match = await api.matchCatalogProduct({ ...identity, manufacturerSku: "76002" });
    assert.equal(match.exact, null, "A shared SKU must not silently choose a different color or variant");
    assert.ok(match.similar.some(model => model.id === row("different-sku").catalog_product_id));
  });

  await t.test("catalog and listing writes roll back together, including concurrent SKU creation", async () => {
    const before = count();
    const prepared = await api.prepareListingCatalog({ ...identity, manufacturerSku: "race-1", confirmDifferentModel: true }, "owner-a");
    await assert.rejects(api.persistCatalogListing(prepared, () => ({ sql: "INSERT INTO products (id) VALUES ('broken')", params: [] })));
    assert.equal(count(), before, "Failed listings leave no orphan catalog entry");
    const write = (id, seller) => (model) => ({ sql: "INSERT INTO products (id,catalog_product_id,seller_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents) VALUES (?,?,?,?,?,'Model','1:18','AUTOart','McLaren','F1',10000)", params: [id,model.id,seller,id,id] });
    const competitor = await api.prepareListingCatalog({ ...identity, manufacturerSku: "race-1", confirmDifferentModel: true }, "owner-b");
    beforeBatch = () => api.persistCatalogListing(competitor, write("race-b", "b"));
    const winner = await api.persistCatalogListing(prepared, write("race-a", "a"));
    assert.equal(count(), before + 1);
    assert.equal(row("race-a").catalog_product_id, row("race-b").catalog_product_id);
    assert.equal(winner.id, competitor.model.id);
  });

  await t.test("UPC and EAN equivalents reuse identity and conflicting identifiers stop the save", async () => {
    const made = await api.saveStoreProduct(store("a"), { ...listing, ...identity, manufacturerSku: "barcode-1", confirmDifferentModel: true, sellerSku: "barcode-stock", upc: "036000291452" });
    const before = count();
    const match = await api.matchCatalogProduct({ ...identity, manufacturerSku: "", ean: "0036000291452" });
    assert.equal(match.exact.id, row(made.productId).catalog_product_id);
    await assert.rejects(api.matchCatalogProduct({ ...identity, ean: "0036000291452" }), /different catalog models|different manufacturer or SKU/);
    assert.equal(count(), before);
  });

  await t.test("new records track creator, remain reusable as drafts and existing catalog data is immutable to sellers", async () => {
    const result = await api.saveStoreProduct(store("a"), { ...listing, ...identity, manufacturerSku: "creator-1", confirmDifferentModel: true, sellerSku: "creator" });
    const model = await api.getCatalogProduct(row(result.productId).catalog_product_id);
    const raw = sqlite.prepare("SELECT * FROM catalog_products WHERE id = ?").get(model.id);
    assert.equal(raw.created_by_user_id, "owner-a");
    assert.equal(raw.catalog_status, "unverified");
    assert.equal((await api.searchCatalogProducts("creator-1"))[0].id, model.id);
    await api.saveStoreProduct(store("a"), { ...listing, sellerSku: "creator", id: result.productId, color: "Red", material: "Plastic", manufacturerSku: "wrong", vehicleModel: "Wrong" });
    assert.equal((await api.getCatalogProduct(model.id)).color, "Silver");
    assert.equal(row(result.productId).product_number, "creator-1");
  });

  await t.test("offer retrieval excludes sold out, reserved, unpublished and ineligible sellers", async () => {
    const offers = await api.getCatalogListings(catalogId);
    assert.deepEqual(offers.listings.map((offer) => offer.id), ["old-a", "old-b"]);
    sqlite.exec("UPDATE products SET reserved_quantity = inventory_quantity WHERE id = 'old-a'");
    assert.deepEqual((await api.getCatalogListings(catalogId)).listings.map((offer) => offer.id), ["old-b"]);
    sqlite.exec("UPDATE sellers SET status = 'suspended' WHERE id = 'b'");
    assert.equal((await api.getCatalogListings(catalogId)).listings.length, 0);
    sqlite.exec("UPDATE sellers SET status = 'active' WHERE id = 'b'");
    const response = await api.getOffers(new Request("http://localhost"), { params: Promise.resolve({ id: catalogId }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).listings[0].catalogProductId, catalogId);
    const missing = await api.getOffers(new Request("http://localhost"), { params: Promise.resolve({ id: "missing" }) });
    assert.equal(missing.status, 404);
  });

  await t.test("existing CSV imports attach every row and reuse SKU matches in the same batch", async () => {
    const csv = api.inventoryCsvTemplate();
    const [header, first] = csv.trim().split("\n");
    const second = first.replace("SKU-001", "SKU-002");
    const before = count();
    const result = await api.commitInventoryCsv("a", `${header}\n${first}\n${second}\n`);
    assert.equal(result.imported, 2);
    assert.equal(count(), before + 1);
    const rows = sqlite.prepare("SELECT * FROM products WHERE seller_sku IN ('SKU-001','SKU-002') ORDER BY seller_sku").all();
    assert.equal(rows[0].catalog_product_id, rows[1].catalog_product_id);
    await api.commitInventoryCsv("a", `${header}\n${first.replace('249.95', '199.95')}\n`);
    assert.equal(row(rows[0].id).price_cents, 19995);
    assert.equal(row(rows[1].id).price_cents, 24995);
    assert.equal(count(), before + 1);
  });

  await t.test("collectors can reuse catalog models and edit only their own independent listing", async () => {
    const user = { id: "owner-c", email: "owner-c@example.test", name: "Collector", emailVerified: true };
    const payload = { ...listing, catalogProductId: catalogId, sellerSku: "COLLECTOR-01", quantity: 1, sellerDisplayName: "Collector", sellerDescription: "", packageLength: "12", packageWidth: "9", packageHeight: "6", packageWeight: "2", shippingOriginStreet1: "100 Market St", shippingOriginCity: "San Francisco", shippingOriginRegion: "CA", shippingOriginPostalCode: "94105", shippingOriginCountry: "US", shippingOriginPhone: "4155550100", shipFromAddressId: "new" };
    const before = count();
    const saved = await api.saveCollectorListing({ user, profile: { displayName: "Collector", bio: "" }, payload });
    assert.equal(saved.catalogProductId, catalogId);
    assert.equal(count(), before);
    assert.equal(row(saved.productId).seller_sku, "COLLECTOR-01");
    await api.saveCollectorListing({ user, profile: { displayName: "Collector", bio: "" }, productId: saved.productId, payload: { ...payload, price: "199", shipFromAddressId: saved.shipFromAddress.id } });
    assert.equal(row(saved.productId).price_cents, 19900);
    await assert.rejects(api.saveCollectorListing({ user: { ...user, id: "owner-b" }, profile: { displayName: "Other", bio: "" }, productId: saved.productId, payload }), /not found/);
  });
});
