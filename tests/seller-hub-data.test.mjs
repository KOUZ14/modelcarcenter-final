import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";

test("demand queries scope private interest to the seller and return only aggregated Model Hunts", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".seller-hub-test-"));
  const bundle = join(scratch, "hub.mjs");
  const sqlite = new DatabaseSync(":memory:");
  const binding = { prepare(query) { let values = []; return {
    bind(...params) { values = params; return this; },
    async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
  }; } };
  globalThis.__sellerHubTestDb = drizzle(binding);
  t.after(async () => { delete globalThis.__sellerHubTestDb; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  sqlite.exec(`
    CREATE TABLE products (id TEXT, seller_id TEXT, status TEXT);
    CREATE TABLE wishlist_items (product_id TEXT, user_id TEXT, created_at TEXT);
    CREATE TABLE availability_alerts (product_id TEXT, status TEXT);
    CREATE TABLE wanted_requests (vehicle_make TEXT, vehicle_model TEXT, preferred_scale TEXT, model_manufacturer TEXT, color TEXT, condition_preference TEXT, max_budget_cents INTEGER, status TEXT, collector_email TEXT, notes TEXT);
    CREATE TABLE orders (id TEXT, seller_id TEXT);
    CREATE TABLE resolution_cases (order_id TEXT, requested_resolution TEXT);
    INSERT INTO products VALUES ('one', 'seller-one', 'active'), ('two', 'seller-two', 'active');
    INSERT INTO wishlist_items VALUES ('one', 'buyer', '2026-09-15 12:00:00'), ('one', 'buyer-two', '2026-08-17 12:00:00'), ('one', 'older-buyer', '2026-08-01T12:00:00Z'), ('one', 'owner', '2026-09-15'), ('two', 'unrelated-buyer', '2026-09-15');
    INSERT INTO availability_alerts VALUES ('one', 'active'), ('one', 'unsubscribed'), ('two', 'active');
    INSERT INTO wanted_requests VALUES ('Porsche', '911', '1:18', NULL, NULL, NULL, 20000, 'open', 'private@example.test', 'private note'), ('Porsche', '911', '1:18', NULL, NULL, NULL, 20000, 'possible_match', 'other@example.test', 'private note'), ('Porsche', '911', '1:18', NULL, NULL, NULL, 20000, 'closed', 'closed@example.test', 'private note');
    INSERT INTO orders VALUES ('order-one', 'seller-one'), ('order-two', 'seller-two');
    INSERT INTO resolution_cases VALUES ('order-one', 'return_refund'), ('order-one', 'return_refund'), ('order-two', 'return_refund');
  `);
  const output = await build({
    entryPoints: [join(root, "lib/seller-hub-data.ts")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "hub-database", setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "hub-db" }));
      builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path: join(root, `${path.slice(2)}.ts`) }));
      builder.onLoad({ filter: /.*/, namespace: "hub-db" }, () => ({ contents: "export const getDb=()=>globalThis.__sellerHubTestDb;" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { getSellerHubDemand } = await import(pathToFileURL(bundle).href);
  const inventory = [{ id: "one", status: "active", vehicleMake: "Porsche", vehicleModel: "911", scale: "1:18", priceCents: 10000 }];
  const result = await getSellerHubDemand("seller-one", "owner", inventory, new Date("2026-09-16T12:00:00Z"));
  assert.equal(result.savedBuyers, 3);
  assert.deepEqual(result.products, [{ productId: "one", saves: 3, recent: 2, previous: 1, trending: false, restockSubscribers: 1 }]);
  assert.deepEqual(result.returnOrderIds, ["order-one"]);
  assert.equal(result.wants.length, 1);
  assert.equal(result.wants[0].requests, 2);
  assert.deepEqual(result.wants[0].productIds, ["one"]);
  assert.doesNotMatch(JSON.stringify(result), /private|@example|unrelated-buyer|buyer-two|collectorEmail/);
});
