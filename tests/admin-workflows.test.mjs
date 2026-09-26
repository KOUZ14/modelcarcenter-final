import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { awaitingShipment, overdueShipment, orderItemProblem } from "../lib/admin-order-rules.ts";

test("shipment workload includes processing, preserves terminal states, and flags missing evidence", () => {
  assert.equal(awaitingShipment({ paymentStatus: "paid", fulfillmentStatus: "processing" }), true);
  for (const fulfillmentStatus of ["shipped", "delivered", "cancelled"]) assert.equal(awaitingShipment({ paymentStatus: "paid", fulfillmentStatus }), false);
  assert.equal(overdueShipment({ paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shipByAt: "2026-01-01 00:00:00" }, Date.parse("2026-02-01")), true);
  assert.equal(overdueShipment({ paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shipByAt: null }), false);
  assert.match(orderItemProblem({ subtotalCents: 500, items: [] }), /missing/);
  assert.match(orderItemProblem({ subtotalCents: 500, items: [{ quantity: 1, unitPriceCents: 100 }] }), /totals/);
  assert.equal(orderItemProblem({ subtotalCents: 500, items: [{ quantity: 2, unitPriceCents: 250 }] }), null);
});

test("admin recovery, API payloads, editor initial state, and maintenance preview", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime", "admin-test-"));
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(n => n.endsWith(".sql") && n < "0036").sort()) sqlite.exec(await readFile(join(root, "drizzle", file), "utf8"));
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(`INSERT INTO sellers (id,slug,store_name,contact_name,contact_email,status) VALUES ('seller','store','Test store','Owner','owner@example.test','active');
    INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','AUTOart','autoart','1:18','Porsche','911','Porsche 911');
    INSERT INTO products (id,catalog_product_id,seller_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,condition_notes) VALUES ('product','model','seller','porsche','DEMO-002','Porsche 911','1:18','AUTOart','Porsche','911',2500,3,'Original condition note');`);
  for (const [id, subtotal, itemTotal, session] of [["recover", 2500, 2500, "cs_test_recover"], ["mismatch", 2500, 2400, "cs_live_mismatch"], ["partial", 2500, 2500, "cs_live_partial"], ["unpaid", 2500, 2500, "cs_live_unpaid"]]) {
    sqlite.prepare("INSERT INTO orders (id,order_number,seller_id,buyer_email,currency,stripe_checkout_session_id,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status,fulfillment_status) VALUES (?,?, 'seller','buyer@example.test','usd',?, ?,0,0,?,'paid','processing')").run(id,id,session,subtotal,subtotal);
    sqlite.prepare("INSERT INTO checkout_reservations (id,seller_id,stripe_checkout_session_id,status,subtotal_cents,shipping_cents,platform_fee_cents,currency,expires_at) VALUES (?, 'seller',?,?,?,0,0,'usd','2026-12-01T00:00:00Z')").run(id,session,id === "unpaid" ? "pending" : "completed",subtotal);
    sqlite.prepare("INSERT INTO checkout_reservation_items (id,reservation_id,product_id,product_title_snapshot,seller_sku_snapshot,scale_snapshot,manufacturer_snapshot,unit_price_cents,quantity,image_url_snapshot) VALUES (?,?,'product','Purchased title','ORDER-SKU','1:18','AUTOart',?,1,'/snapshot.jpg')").run(id,id,itemTotal);
  }
  sqlite.exec("INSERT INTO order_items (id,order_id,product_title_snapshot,seller_sku_snapshot,scale_snapshot,manufacturer_snapshot,unit_price_cents,quantity) VALUES ('existing','partial','Original partial item','KEEP','1:18','AUTOart',1200,1)");
  sqlite.exec(await readFile(join(root, "drizzle/0036_admin_workflows.sql"), "utf8"));
  await t.test("recovery uses exact historical evidence and leaves mismatches and existing items untouched", () => {
    const items = sqlite.prepare("SELECT * FROM order_items WHERE order_id='recover'").all();
    assert.equal(items.length, 1); assert.equal(items[0].seller_sku_snapshot, "ORDER-SKU"); assert.equal(items[0].product_title_snapshot, "Purchased title");
    assert.equal(sqlite.prepare("SELECT count(*) n FROM order_items WHERE order_id IN ('mismatch','unpaid')").get().n, 0);
    assert.equal(sqlite.prepare("SELECT id FROM order_items WHERE order_id='partial'").get().id, "existing");
    assert.equal(sqlite.prepare("SELECT is_test_order FROM orders WHERE id='recover'").get().is_test_order, 1);
    assert.equal(sqlite.prepare("SELECT is_test_order FROM orders WHERE id='mismatch'").get().is_test_order, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  });
  const binding = { prepare(query) { let values = []; return {
    bind(...args) { values = args; return this; },
    async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
    async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
    async first() { return sqlite.prepare(query).get(...values) ?? null; },
    async run() { return { meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
  }; }, async batch(statements) { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  globalThis.__adminWorkflow = { db: drizzle(binding), binding };
  const bundle = join(scratch, "api.mjs"), view = join(scratch, "view.mjs");
  t.after(async () => { delete globalThis.__adminWorkflow; sqlite.close(); await unlink(bundle).catch(() => {}); await unlink(view).catch(() => {}); await rmdir(scratch); });
  const boundary = { name: "admin-test", setup(builder) {
    builder.onResolve({ filter: /^@\/db$|^@\/lib\/admin-auth$/ }, ({ path }) => ({ path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "@/db" ? "export const getDb=()=>globalThis.__adminWorkflow.db; export const getD1=()=>globalThis.__adminWorkflow.binding;" : "export const requireAdminApi=async()=>({email:'founder@example.test'});" }));
  } };
  const compiled = await build({ stdin: { contents: "export {GET,POST} from './app/api/admin/route.ts'; export {previewPreorderMaintenance} from './lib/preorder-preview.ts';", resolveDir: root }, bundle: true, format: "esm", platform: "node", packages: "external", write: false, plugins: [boundary] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  const productsResponse = await api.GET(new Request("http://localhost/api/admin?section=products"));
  assert.equal(productsResponse.status, 200);
  const products = await productsResponse.json(), product = products.products[0];
  await t.test("product API preserves the catalog association, notes, price and inventory", () => {
    assert.equal(product.catalogProductId, "model"); assert.equal(product.conditionNotes, "Original condition note");
    assert.equal(product.priceCents, 2500); assert.equal(product.inventoryQuantity, 3);
  });
  await t.test("order payload contains snapshot SKUs and photos, and missing items block shipment before provider calls", async () => {
    const response = await api.GET(new Request("http://localhost/api/admin?section=orders")); assert.equal(response.status, 200);
    const order = (await response.json()).orders.find(row => row.id === "recover");
    assert.equal(order.items[0].sellerSkuSnapshot, "ORDER-SKU"); assert.equal(order.items[0].imageUrlSnapshot, "/snapshot.jpg");
    const shipped = await api.POST(new Request("http://localhost/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ship_order", orderId: "mismatch", carrier: "UPS", trackingNumber: "TEST" }) }));
    assert.equal(shipped.status, 400); assert.match((await shipped.json()).error, /Item records missing/);
  });
  await t.test("overview and preorder previews use real schema and do not mutate records", async () => {
    const response = await api.GET(new Request("http://localhost/api/admin?section=overview")); assert.equal(response.status, 200);
    const overview = await response.json(); assert.equal(overview.counts.unfulfilledOrders, 4); assert.equal(overview.counts.missingOrderItems, 2);
    const before = sqlite.prepare("SELECT total_changes() n").get().n;
    const preview = await api.previewPreorderMaintenance(); assert.equal(preview.expiring, 0); assert.equal(preview.lastRun, null);
    assert.equal(sqlite.prepare("SELECT total_changes() n").get().n, before);
  });
  const componentSource = await readFile(join(root, "components/admin-dashboard.tsx"), "utf8");
  const compiledView = await build({ stdin: { contents: componentSource + "\nexport {ProductEditor, Orders};", resolveDir: root, loader: "tsx" }, jsx: "automatic", bundle: true, format: "esm", platform: "node", packages: "external", write: false, loader: { ".css": "empty", ".module.css": "empty" }, plugins: [{ name: "next-test", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, ({ path }) => ({ path, namespace: "next" }));
    builder.onLoad({ filter: /.*/, namespace: "next" }, ({ path }) => ({ contents: path === "next/navigation" ? "export const useSearchParams=()=>new URLSearchParams(); export const usePathname=()=>'/admin';" : "export default function NextStub(){return null;}" }));
  } }] });
  await writeFile(view, compiledView.outputFiles[0].contents);
  const ui = await import(pathToFileURL(view).href);
  await t.test("existing product editor immediately renders editable current listing fields", () => {
    const html = renderToStaticMarkup(createElement(ui.ProductEditor, { product, sellers: products.sellers, action: async () => ({}), onClose() {} }));
    assert.match(html, /name="price"[^>]*value="25.00"/); assert.match(html, /name="inventoryQuantity"[^>]*value="3"/);
    assert.match(html, /Original condition note/); assert.match(html, /name="catalogProductId" value="model"/);
    assert.doesNotMatch(html, /<h2>Find your model<\/h2>|class="catalog-listing-fields" hidden/);
  });
  await t.test("existing product edits save price and stock while retaining the catalog identity", async () => {
    const response = await api.POST(new Request("http://localhost/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...product, action: "save_product", priceCents: 2600, inventoryQuantity: 4, modelCondition: "mint", packagingCondition: "excellent", originalBoxStatus: "included", missingParts: "None known", defects: "None known", restorationCustomization: "None known", material: "Die-cast metal", coaStatus: "not_applicable", accessories: "None included" }) }));
    assert.equal(response.status, 200, await response.text());
    const saved = sqlite.prepare("SELECT catalog_product_id, condition_notes, price_cents, inventory_quantity FROM products WHERE id='product'").get();
    assert.equal(saved.catalog_product_id, "model"); assert.equal(saved.condition_notes, "Original condition note");
    assert.equal(saved.price_cents, 2600); assert.equal(saved.inventory_quantity, 4);
  });
  await t.test("application decisions require notes and retain actor history; a stale decision is rejected", async () => {
    sqlite.exec("INSERT INTO seller_applications (id,store_name,contact_name,email,current_selling_channels,approximate_inventory_size) VALUES ('application','Applicant','Owner','applicant@example.test','Online',10)");
    const decide = note => api.POST(new Request("http://localhost/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject_application", applicationId: "application", note }) }));
    assert.equal((await decide("")).status, 400);
    assert.equal((await decide("Application needs more inventory detail")).status, 200);
    assert.equal(sqlite.prepare("SELECT status FROM seller_applications WHERE id='application'").get().status, "rejected");
    const record = sqlite.prepare("SELECT actor,detail FROM admin_activity WHERE record_id='application'").get();
    assert.equal(record.actor, "founder@example.test"); assert.match(JSON.parse(record.detail).note, /inventory detail/);
    assert.equal((await decide("Stale duplicate decision")).status, 400);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM admin_activity WHERE record_id='application'").get().n, 1);
  });
});
