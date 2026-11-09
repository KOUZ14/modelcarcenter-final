import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { securityDatabase } from "./fixtures/security-database.mjs";
import { parseCollectibleDetails, parseCollectibleDraft, legacyConditionFromCollectibleDetails, validateImportRows } from "../lib/validation.ts";
import { newConditionDefaults } from "../lib/condition-defaults.ts";
import { storeListingIssues } from "../lib/store-listing-readiness.ts";
import { photoAltForViews } from "../lib/listing-evidence.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

const condition = { modelCondition: "new", packagingCondition: "mint", originalBoxStatus: "included", coaStatus: "not_applicable" };
const photos = ["front", "rear", "left", "right", "top", "underside", "packaging"].map(view => ({ url: `/media/${view}.jpg`, alt: photoAltForViews([view], "Item") }));

test("New defaults only unanswered disclosures and retains uncertainty and recorded issues", () => {
  const details = parseCollectibleDetails(condition);
  assert.equal(details.defects, "None known");
  assert.equal(details.missingParts, "None known");
  assert.equal(details.restorationCustomization, "None known");
  assert.equal(parseCollectibleDetails({ ...condition, defects: "Not sure" }).defects, "Not sure");
  assert.equal(parseCollectibleDetails(newConditionDefaults(condition, { defects: "Chipped mirror" })).defects, "Chipped mirror");
  assert.equal(legacyConditionFromCollectibleDetails({ ...condition, packagingCondition: "sealed_good" }), "new_sealed");
  assert.equal(legacyConditionFromCollectibleDetails(condition), "new_opened");
  assert.throws(() => parseCollectibleDetails({ ...condition, modelCondition: "mint" }), error => Boolean(error.fields.defects));
  assert.throws(() => parseCollectibleDetails({ modelCondition: "new" }), error => Boolean(error.fields.packagingCondition && error.fields.coaStatus));
});

test("draft validation permits missing details while publication reports actionable missing fields", () => {
  const draft = parseCollectibleDraft({ modelCondition: "new" });
  assert.equal(draft.packagingCondition, "not_specified");
  assert.equal(draft.defects, "None known");
  const incomplete = storeListingIssues({ ...draft, priceCents: 0, inventoryQuantity: 0 }, []);
  for (const name of ["catalogProductId", "sellerSku", "price", "inventoryQuantity", "packagingCondition", "images"]) assert.ok(incomplete[name], name);
  const ready = { ...condition, catalogProductId: "model", sellerSku: "NEW-1", priceCents: 10000, inventoryQuantity: 2, reservedQuantity: 1 };
  assert.deepEqual(storeListingIssues(ready, photos), {});
  assert.ok(storeListingIssues({ ...ready, defects: "Chipped mirror" }, photos).images.includes("Disclosed defects"));
  assert.ok(storeListingIssues({ ...ready, inventoryQuantity: 1 }, photos).inventoryQuantity);
  assert.deepEqual(storeListingIssues({ ...ready, packagingCondition: "sealed_good" }, ["packaging", "seal"].map(view => ({ alt: photoAltForViews([view], "Sealed box") }))), {});
});

test("CSV New rows can omit repetitive disclosures but other conditions still require answers", () => {
  const row = { seller_sku: "NEW-1", title: "Car", scale: "1:18", model_manufacturer: "AUTOart", vehicle_make: "Porsche", vehicle_model: "911", model_condition: "new", packaging_condition: "mint", original_box: "included", coa: "not_applicable", price: "100", inventory_quantity: "2" };
  const result = validateImportRows([row]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.valid[0].defects, "None known");
  assert.ok(validateImportRows([{ ...row, model_condition: "good" }]).errors.length);
});

test("store drafts, publication, pagination, SKU errors and imports remain owned and consistent", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const root = process.cwd(), scratch = await mkdtemp(join(root, ".sites-runtime/inventory-test-")), bundle = join(scratch, "test.mjs");
  globalThis.__inventoryTest = { db: drizzle(binding), binding };
  t.after(async () => { delete globalThis.__inventoryTest; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {saveStoreProduct,setStoreProductStatus,getStoreDashboardData} from './lib/store.ts'; export {getStoreInventoryProduct} from './lib/store-inventory-data.ts'; export {previewInventoryCsv,commitInventoryCsv,previewStoreInventoryCsv,updateStoreStock,inventoryCsvHeaders} from './lib/csv-import.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false, plugins: [{ name: "inventory-boundaries", setup(b) {
    b.onResolve({ filter: /^@\/db$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    b.onResolve({ filter: /^\.\/availability$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "@/db" ? "export const getDb=()=>globalThis.__inventoryTest.db,getD1=()=>globalThis.__inventoryTest.binding;" : `export {parseProductAvailability} from ${JSON.stringify(join(root, "lib/availability-rules.ts"))}; export const notifyRestockSubscribers=async()=>{},syncPreorderReleaseSchedule=async()=>{};`, resolveDir: root }));
  } }] });
  await writeFile(bundle, output.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  for (const id of ["owner", "other"]) {
    sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id,id,`${id}@example.test`);
    sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,seller_type,status) VALUES (?,?,?,?,?,?,'professional','active')").run(id,id,id,id,id,`${id}@example.test`);
  }
  sqlite.prepare("INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','AUTOart','autoart','1:18','Porsche','911','Porsche 911')").run();
  const data = await api.getStoreDashboardData("owner", {});
  const store = { ...data.store, description: "A professional model car store with original stock.", specialty: "Models", packingApproach: "Original boxes in padded outer cartons.", stripeChargesEnabled: true, stripePayoutsEnabled: true, shippingMode: "flat", shippingOriginCountry: "US", shippingOriginRegion: "CA", shippingOriginStreet1: "1 Main", shippingOriginCity: "City", shippingOriginPostalCode: "90001", shippingOriginPhone: "1234567890", shippingPolicySummary: "Dispatch within three business days.", handlingTimeBusinessDays: 3, sellerTermsVersion: POLICY_VERSION, sellerTermsAcceptedAt: new Date().toISOString() };
  const payload = { catalogProductId: "model", sellerSku: "NEW-1", inventoryQuantity: 2, modelCondition: "new", price: "" };
  const { productId } = await api.saveStoreProduct(store, payload);
  let product = await api.getStoreInventoryProduct(store.id, productId);
  assert.equal(product.status, "draft"); assert.equal(product.priceCents, 0); assert.equal(product.defects, "None known");
  await assert.rejects(api.setStoreProductStatus(store, productId, "active"), error => Boolean(error.fields.packagingCondition && error.fields.images));
  await api.saveStoreProduct(store, { ...payload, ...condition, id: productId, price: "100", defects: "Paint chip" });
  await api.saveStoreProduct(store, { ...payload, ...condition, id: productId, price: "100" });
  assert.equal((await api.getStoreInventoryProduct(store.id, productId)).defects, "Paint chip", "Switching to New never clears a saved disclosure");
  await assert.rejects(api.saveStoreProduct(store, { ...payload, sellerSku: "new-1" }), error => Boolean(error.fields.sellerSku));
  await api.saveStoreProduct(store, { ...payload, ...condition, id: productId, price: "100", defects: "None known" });
  for (const [i, image] of photos.entries()) sqlite.prepare("INSERT INTO product_images (id,product_id,url,alt) VALUES (?,?,?,?)").run(`photo-${i}`,productId,image.url,image.alt);
  await api.setStoreProductStatus(store, productId, "active");
  assert.equal((await api.getStoreInventoryProduct(store.id, productId)).status, "active");
  assert.equal(await api.getStoreInventoryProduct("other", productId), null);
  for (let i=0;i<55;i++) sqlite.prepare("INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,status) VALUES (?,?, 'model',?,?,?,'1:18','AUTOart','Porsche','911',0,'draft')").run(`draft-${i}`,"owner",`draft-${i}`,`SKU-${i}`,`Model ${i}`);
  let page = await api.getStoreDashboardData("owner", { filter: "draft", page: "2" });
  assert.equal(page.inventoryPage.total, 55); assert.equal(page.inventory.length, 5); assert.equal(page.inventoryPage.counts.listed, 1); assert.equal(page.inventoryPage.totalInventory, 56);
  assert.deepEqual(page.orders, []); assert.deepEqual(page.demand.products, []); assert.ok(page.inventory.every(row => row.detailsLoaded === false && row.images.length === 0));
  page = await api.getStoreDashboardData("owner", { q: "NEW-1", edit: productId });
  assert.equal(page.inventory.length, 1); assert.equal(page.inventoryEditor.images.length, photos.length); assert.deepEqual(page.inventory[0].issues, {});
  assert.equal((await api.getStoreDashboardData("other", {})).inventoryPage.totalInventory, 0);
  const imported = { seller_sku: "NEW-1", title: "Porsche 911", scale: "1:18", model_manufacturer: "AUTOart", vehicle_make: "Porsche", vehicle_model: "911", model_condition: "new", packaging_condition: "mint", original_box: "included", coa: "not_applicable", price: "110", inventory_quantity: "3" };
  sqlite.prepare("UPDATE products SET defects='Box scuff' WHERE id=?").run(productId);
  const csv = `${api.inventoryCsvHeaders.join(",")}\n${api.inventoryCsvHeaders.map(key => imported[key] ?? "").join(",")}`;
  const preview = await api.previewStoreInventoryCsv(store.id,csv); assert.equal(preview.errors.length,0); assert.equal(preview.valid[0].defects,"Box scuff");
  await api.commitInventoryCsv(store.id,csv); product = await api.getStoreInventoryProduct(store.id,productId); assert.equal(product.defects,"Box scuff"); assert.equal(product.priceCents,11000);
  await assert.rejects(api.updateStoreStock(store.id,[{id:productId,price:"wrong",inventoryQuantity:1}]), /NEW-1/);
});
