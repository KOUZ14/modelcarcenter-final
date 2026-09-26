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
    stdin: { contents: `export * from './lib/catalog-products.ts'; export { saveStoreProduct, connectStorePayments } from './lib/store.ts'; export { saveCollectorListing } from './lib/listings.ts'; export { getCatalogListings, getRelatedProducts, searchCatalog, getSellerStorefront } from './lib/catalog.ts'; export { commitInventoryCsv, inventoryCsvTemplate, previewStoreInventoryCsv, updateStoreStock } from './lib/csv-import.ts'; export { GET, POST } from './app/api/catalog-products/route.ts'; export { GET as getOffers } from './app/api/catalog-products/[id]/listings/route.ts'; export { GET as getCatalog } from './app/api/catalog/route.ts';`, resolveDir: root },
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

  await t.test("listing budgets filter exact cents, inclusive bounds, counts and pagination together", async () => {
    const response = await api.getCatalog(new Request("http://localhost/api/catalog?minPrice=250&maxPrice=279&sort=price_asc"));
    assert.equal(response.status, 200);
    const range = await response.json();
    assert.deepEqual(range.products.map(product => product.id), ["different-sku", "old-a"]);
    assert.equal(range.pagination.total, 2);
    assert.deepEqual((await api.searchCatalog({ minPrice: "90.01", maxPrice: "100" })).products.map(product => product.id), ["no-sku-a"]);
    assert.deepEqual((await api.searchCatalog({ maxPrice: "90" })).products.map(product => product.id), ["no-sku-b"]);
    assert.deepEqual((await api.searchCatalog({ minPrice: "279.01" })).products.map(product => product.id), ["old-b"]);
    const paged = await api.searchCatalog({ minPrice: "90", maxPrice: "289", sort: "price_asc", page: 2, pageSize: 2 });
    assert.deepEqual(paged.products.map(product => product.id), ["different-sku", "old-a"]);
    assert.deepEqual(paged.pagination, { page: 2, pageSize: 2, total: 5, pages: 3 });
    assert.equal((await api.searchCatalog({ maxPrice: "100", scale: "1:64" })).pagination.total, 0);
  });

  await t.test("invalid budgets return a useful client error and unknown preorder prices do not match", async () => {
    for (const query of ["minPrice=-1", "maxPrice=nope", "minPrice=100&maxPrice=50", "maxPrice=1000001", "minPrice=1.001", "maxPrice=Infinity"]) {
      const response = await api.getCatalog(new Request(`http://localhost/api/catalog?${query}`));
      assert.equal(response.status, 400, query);
      assert.match((await response.json()).error, /price/i);
    }
    sqlite.exec("UPDATE products SET availability_type='preorder', price_cents=0 WHERE id='old-a'");
    try {
      assert.ok((await api.searchCatalog({})).products.some(product => product.id === "old-a"));
      assert.equal((await api.searchCatalog({ maxPrice: "0" })).pagination.total, 0);
      assert.ok(!(await api.searchCatalog({ maxPrice: "300" })).products.some(product => product.id === "old-a"));
      assert.ok(!(await api.searchCatalog({ minPrice: "0" })).products.some(product => product.id === "old-a"));
    } finally {
      sqlite.exec("UPDATE products SET availability_type='in_stock', price_cents=27900 WHERE id='old-a'");
    }
  });

  await t.test("similar models exclude the current release and show distinct active releases before limiting", async () => {
    const current = (await api.getCatalogListings(catalogId)).listings.find(product => product.id === "old-a");
    const otherCatalogId = row("different-sku").catalog_product_id;
    const duplicate = await api.saveStoreProduct(store("a"), { ...listing, sellerSku: "another-offer", catalogProductId: otherCatalogId });
    try {
      const related = await api.getRelatedProducts(current, 4);
      assert.equal(related.length, 3);
      assert.ok(related.every(product => product.id !== current.id && product.catalogProductId !== catalogId));
      assert.equal(new Set(related.map(product => product.catalogProductId)).size, 3);
      assert.equal((await api.getRelatedProducts(current, 2)).length, 2);
      sqlite.prepare("UPDATE products SET inventory_quantity=0 WHERE catalog_product_id=?").run(otherCatalogId);
      assert.ok(!(await api.getRelatedProducts(current, 4)).some(product => product.catalogProductId === otherCatalogId));
      assert.ok((await api.getCatalogListings(catalogId)).listings.some(product => product.id === "old-b"), "Same-release alternatives remain in the offer comparison");
    } finally {
      sqlite.prepare("DELETE FROM products WHERE id=?").run(duplicate.productId);
      sqlite.prepare("UPDATE products SET inventory_quantity=2 WHERE id='different-sku'").run();
    }
  });

  await t.test("storefront search, scale facets and pagination stay within the approved store", async () => {
    const insert = sqlite.prepare("INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status,created_at) VALUES (?, ?, ?, ?, ?, 'Storefront fixture', ?, 'AUTOart', 'McLaren', 'F1', ?, 1, ?, ?)");
    const ids = [];
    const add = (id, seller, scale, price, status, created) => { ids.push(id); insert.run(id, seller, catalogId, id, id, scale, price, status, created); };
    for (let i = 0; i < 25; i++) add(`storefront-${i}`, 'a', '1:43', 100000 + i, 'active', `2027-01-${String(i + 1).padStart(2, '0')} 00:00:00`);
    add('storefront-other', 'b', '1:64', 1, 'active', '2027-02-01 00:00:00');
    add('storefront-draft', 'a', '1:8', 1, 'draft', '2027-02-01 00:00:00');
    try {
      const first = await api.getSellerStorefront('a', { q: 'Storefront fixture', sort: 'newest', seller: 'b' });
      assert.equal(first.catalog.pagination.total, 25);
      assert.equal(first.products.length, 24);
      assert.equal(first.products[0].id, 'storefront-24');
      assert.ok(first.products.every(product => product.sellerId === 'a'));
      assert.ok(!first.scales.includes('1:64') && !first.scales.includes('1:8'), 'Other sellers and unpublished listings do not contribute scale choices');
      const second = await api.getSellerStorefront('a', { q: 'Storefront fixture', page: 2 });
      assert.deepEqual(second.products.map(product => product.id), ['storefront-0']);
      assert.equal(second.catalog.pagination.pages, 2);
      const cheap = await api.getSellerStorefront('a', { q: 'Storefront fixture', scale: '1:43', sort: 'price_asc' });
      assert.equal(cheap.products[0].priceCents, 100000);
      const expensive = await api.getSellerStorefront('a', { q: 'Storefront fixture', sort: 'price_desc' });
      assert.equal(expensive.products[0].priceCents, 100024);
      const empty = await api.getSellerStorefront('a', { scale: '1:64' });
      assert.equal(empty.catalog.pagination.total, 0);
      assert.ok(empty.scales.includes('1:43'), 'Available scale choices remain useful after an empty filter');
      sqlite.prepare("UPDATE products SET price_cents=100000,created_at='2027-01-01 00:00:00' WHERE seller_id='a' AND title='Storefront fixture'").run();
      const tiedFirst = await api.getSellerStorefront('a', { q: 'Storefront fixture', sort: 'price_asc' });
      const tiedSecond = await api.getSellerStorefront('a', { q: 'Storefront fixture', sort: 'price_asc', page: 2 });
      assert.deepEqual([...tiedFirst.products, ...tiedSecond.products].map(product => product.id), Array.from({ length: 25 }, (_, i) => `storefront-${i}`).sort().reverse(), 'Identical prices and dates have stable page boundaries');
      for (const status of ['suspended', 'applicant', 'onboarding']) {
        sqlite.prepare("UPDATE sellers SET status=? WHERE id='a'").run(status);
        assert.equal(await api.getSellerStorefront('a'), null);
      }
      sqlite.prepare("UPDATE sellers SET status='active',seller_terms_version='older-terms' WHERE id='a'").run();
      assert.equal(await api.getSellerStorefront('a'), null, 'Outdated terms keep the public storefront unavailable');
      sqlite.prepare("UPDATE sellers SET seller_terms_version=?,seller_terms_accepted_at=NULL WHERE id='a'").run(POLICY_VERSION);
      assert.equal(await api.getSellerStorefront('a'), null, 'A version alone is not recorded acceptance');
    } finally {
      sqlite.prepare("UPDATE sellers SET status='active',seller_terms_version=?,seller_terms_accepted_at=CURRENT_TIMESTAMP WHERE id='a'").run(POLICY_VERSION);
      for (const id of ids) sqlite.prepare('DELETE FROM products WHERE id=?').run(id);
    }
    assert.ok(await api.getSellerStorefront('a'), 'An active store with accepted current terms has a public storefront');
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
    const repeat = `${header}\n${first.replace('SKU-001', 'sku-001').replace('249.95', '189.95')}\n`;
    const preview = await api.previewStoreInventoryCsv('a', repeat);
    assert.equal(preview.valid[0].operation, 'update');
    assert.equal(preview.valid[0].id, rows[0].id);
    assert.equal(preview.valid[0].sellerSku, 'SKU-001');
    const repeated = await api.commitInventoryCsv('a', repeat);
    assert.equal(repeated.created, 0); assert.equal(repeated.updated, 1);
    assert.equal(row(rows[0].id).price_cents, 18995);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM products WHERE seller_id='a' AND lower(seller_sku)='sku-001'").get().n, 1);
    sqlite.prepare('UPDATE products SET reserved_quantity=2 WHERE id=?').run(rows[0].id);
    const belowReserved = repeat.replace(',2,in_stock,', ',1,in_stock,');
    const invalid = await api.previewStoreInventoryCsv('a', belowReserved);
    assert.equal(invalid.validCount, 0);
    assert.equal(invalid.errors[0].row, 2);
    assert.match(invalid.errors[0].errors.join(' '), /reserved/);
    await assert.rejects(api.commitInventoryCsv('a', belowReserved), /reserved/);
    await assert.rejects(api.updateStoreStock('b', [{id: rows[0].id, price: '120', inventoryQuantity: 3}]), /does not belong/);
    await assert.rejects(api.updateStoreStock('a', [{id: rows[0].id, price: '120', inventoryQuantity: 1}]), /reserved/);
    await api.updateStoreStock('a', [{id: rows[0].id, price: '120', inventoryQuantity: 3}]);
    assert.equal(row(rows[0].id).price_cents, 12000);
    assert.equal(row(rows[0].id).inventory_quantity, 3);
    assert.equal(row(rows[0].id).status, 'draft', 'A stock update cannot publish an unreviewed draft');
  });

  await t.test('bank setup cannot approve an applicant store', async () => {
    await assert.rejects(api.connectStorePayments({ ...store('a'), status: 'applicant' }), /awaiting review/);
    await assert.rejects(api.connectStorePayments({ ...store('a'), status: 'applicant' }, true), /awaiting review/);
  });

  await t.test("collectors can reuse catalog models and edit only their own independent listing", async () => {
    const user = { id: "owner-c", email: "owner-c@example.test", name: "Collector", emailVerified: true };
    const payload = { ...listing, catalogProductId: catalogId, sellerSku: "COLLECTOR-01", quantity: 1, sellerDisplayName: "Collector", sellerDescription: "", packageLength: "12", packageWidth: "9", packageHeight: "6", packageWeight: "2", shippingOriginStreet1: "100 Market St", shippingOriginCity: "San Francisco", shippingOriginRegion: "CA", shippingOriginPostalCode: "94105", shippingOriginCountry: "US", shippingOriginPhone: "4155550100", shipFromAddressId: "new" };
    const before = count();
    const saved = await api.saveCollectorListing({ user, profile: { displayName: "Collector", bio: "" }, payload });
    assert.equal(saved.catalogProductId, catalogId);
    assert.equal(count(), before);
    assert.equal(row(saved.productId).seller_sku, "COLLECTOR-01");
    assert.equal(row(saved.productId).status, "draft");
    sqlite.prepare("UPDATE products SET status='active' WHERE id=?").run(saved.productId);
    await api.saveCollectorListing({ user, profile: { displayName: "Collector", bio: "" }, productId: saved.productId, payload: { ...payload, price: "199", shipFromAddressId: saved.shipFromAddress.id } });
    assert.equal(row(saved.productId).price_cents, 19900);
    assert.equal(row(saved.productId).status, "draft", "Save draft unpublishes without queuing an admin review");
    await assert.rejects(api.saveCollectorListing({ user: { ...user, id: "owner-b" }, profile: { displayName: "Other", bio: "" }, productId: saved.productId, payload }), /not found/);
  });
});
