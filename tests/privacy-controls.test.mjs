import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { requireAdultConsent, requireMarketingConsent } from "../lib/form-consent.ts";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../lib/unsubscribe-token.ts";
import { renderEmailHtml } from "../lib/email-template.ts";

const secret = "privacy-test-secret-32-characters-long";

test("adult and marketing confirmations reject missing, false, and ambiguous values", () => {
  for (const confirm of [requireAdultConsent, requireMarketingConsent]) {
    for (const value of [undefined, null, false, "false", "true", 1, {}, []]) assert.throws(() => confirm(value));
    for (const value of [true, "on"]) assert.doesNotThrow(() => confirm(value));
  }
});

test("unsubscribe links cannot be forged, changed to another scope, or signed with a weak secret", async () => {
  const token = await createUnsubscribeToken("community", "subscriber-1", secret);
  assert.deepEqual(await verifyUnsubscribeToken(token, secret), { scope: "community", id: "subscriber-1" });
  for (const invalid of [token.replace("community", "hunt"), token.replace("subscriber-1", "subscriber-2"), token + "a", "", "v1.community.x.00"]) {
    assert.equal(await verifyUnsubscribeToken(invalid, secret), null);
  }
  assert.equal(await verifyUnsubscribeToken(token, secret + "different"), null);
  await assert.rejects(createUnsubscribeToken("hunt", "HUNT-1", "short"));
});

test("optional email footers include escaped business details and a visible unsubscribe link", () => {
  const html = renderEmailHtml("Update", "<p>Requested update</p>", "https://example.test", "support@example.test", { unsubscribeUrl: "https://example.test/unsubscribe?token=x&other=y", businessName: "Models & Co", mailingAddress: "<Office>" });
  assert.match(html, /Unsubscribe from optional emails/);
  assert.match(html, /Models &amp; Co/);
  assert.match(html, /&lt;Office&gt;/);
  assert.match(html, /token=x&amp;other=y/);
  assert.doesNotMatch(renderEmailHtml("Sign in", "<p>Sign in</p>"), /Unsubscribe from optional emails/);
});

test("signed unsubscribe POST stops only the matching recipient and does not delete purchases", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = await mkdtemp(join(root, ".privacy-test-"));
  const file = join(directory, "unsubscribe.mjs");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE community_subscribers (id TEXT PRIMARY KEY, email TEXT, consent_timestamp TEXT);
    CREATE TABLE wanted_requests (id TEXT PRIMARY KEY, reference_code TEXT, collector_email TEXT, status TEXT);
    CREATE TABLE availability_alerts (id TEXT PRIMARY KEY, unsubscribe_token TEXT, email TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, buyer_email TEXT);
    INSERT INTO community_subscribers VALUES ('subscriber-1','one@example.test','2026-09-16'), ('subscriber-2','two@example.test','2026-09-16');
    INSERT INTO wanted_requests VALUES ('hunt-1','HUNT-1','one@example.test','open'), ('hunt-2','HUNT-2','two@example.test','open');
    INSERT INTO availability_alerts VALUES ('alert-1','restock-1','one@example.test','active',NULL), ('alert-2','restock-2','two@example.test','active',NULL);
    INSERT INTO orders VALUES ('order-1','one@example.test');
  `);
  const binding = {
    prepare(query) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  globalThis.__privacyTest = { binding, db: drizzle(binding), config: { betterAuthSecret: secret } };
  t.after(async () => { delete globalThis.__privacyTest; sqlite.close(); await unlink(file); await rmdir(directory); });
  await build({ entryPoints: [join(root, "app/api/unsubscribe/route.ts")], outfile: file, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{
    name: "privacy-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "database", namespace: "privacy" }));
      builder.onResolve({ filter: /(^@\/lib\/config$|^\.\/config$)/ }, () => ({ path: "config", namespace: "privacy" }));
      builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path: join(root, path.slice(2) + ".ts") }));
      builder.onLoad({ filter: /.*/, namespace: "privacy" }, ({ path }) => ({ contents: path === "database" ? "export const getDb=()=>globalThis.__privacyTest.db; export const getD1=()=>globalThis.__privacyTest.binding;" : "export const config=globalThis.__privacyTest.config;" }));
    },
  }] });
  const route = await import(pathToFileURL(file).href);
  const token = await createUnsubscribeToken("community", "subscriber-1", secret);
  const post = (value) => route.POST(new Request("https://example.test/api/unsubscribe", { method: "POST", body: new URLSearchParams({ token: value }) }));
  assert.equal((await post(token.replace("subscriber-1", "subscriber-2"))).status, 400);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM community_subscribers").get().n, 2);
  const response = await post(token);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/unsubscribe?done=1");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM community_subscribers").get().n, 1);
  assert.equal(sqlite.prepare("SELECT status FROM wanted_requests WHERE id='hunt-1'").get().status, "closed");
  assert.equal(sqlite.prepare("SELECT status FROM availability_alerts WHERE id='alert-1'").get().status, "unsubscribed");
  assert.equal(sqlite.prepare("SELECT status FROM wanted_requests WHERE id='hunt-2'").get().status, "open");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM orders").get().n, 1);
  assert.equal((await post(token)).status, 303);
  const second = await createUnsubscribeToken("restock", "restock-2", secret);
  assert.equal((await route.POST(new Request(`https://example.test/api/unsubscribe?token=${second}`, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM wanted_requests WHERE id='hunt-2'").get().status, "closed");
});

test("account deletion removes optional email data before removing the verified account", async () => {
  const source = await readFile(new URL("../lib/collector-store.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export async function deleteCollectorAccount("));
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT);
    CREATE TABLE session (id TEXT, user_id TEXT);
    CREATE TABLE community_subscribers (id TEXT, email TEXT);
    CREATE TABLE availability_alerts (id TEXT, user_id TEXT, email TEXT);
    CREATE TABLE wanted_requests (id TEXT, user_id TEXT, collector_email TEXT);
    CREATE TABLE sellers (id TEXT, owner_user_id TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE products (id TEXT, seller_id TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE orders (id TEXT, buyer_email TEXT);
    CREATE TABLE preorder_reservations (id TEXT,buyer_user_id TEXT,status TEXT,allocated_quantity INTEGER,actor TEXT,reason TEXT,updated_at TEXT);
    CREATE TABLE preorder_waitlist (id TEXT,buyer_user_id TEXT,status TEXT);
    CREATE TABLE collection_offers (id TEXT,buyer_id TEXT,owner_id TEXT,status TEXT);
    INSERT INTO user VALUES ('account-1','one@example.test'), ('account-2','two@example.test');
    INSERT INTO session VALUES ('session-1','account-1'), ('session-2','account-2');
    INSERT INTO community_subscribers VALUES ('sub-1','ONE@example.test'), ('sub-2','two@example.test');
    INSERT INTO availability_alerts VALUES ('alert-1',NULL,'one@example.test'), ('alert-2','account-2','two@example.test');
    INSERT INTO wanted_requests VALUES ('hunt-1',NULL,'one@example.test'), ('hunt-2','account-2','two@example.test');
    INSERT INTO sellers VALUES ('seller-1','account-1','active',NULL), ('seller-2','account-2','active',NULL);
    INSERT INTO products VALUES ('product-1','seller-1','active',NULL), ('product-2','seller-2','active',NULL);
    INSERT INTO orders VALUES ('order-1','one@example.test');
    INSERT INTO preorder_reservations VALUES ('reserve-1','account-1','awaiting_payment',1,NULL,NULL,NULL);
    INSERT INTO preorder_waitlist VALUES ('wait-1','account-1','waiting');
    INSERT INTO collection_offers VALUES ('offer-1','account-1','account-2','reserved'),('offer-paid','account-1','account-2','completed');
  `);
  try {
    // Compile and execute the actual production function against an isolated SQL database.
    const { transform } = await import("esbuild");
    const js = await transform(body.replace("export async function", "async function"), { loader: "ts" });
    const factory = new Function("getD1", `${js.code}; return deleteCollectorAccount;`);
    const remove = factory(() => ({
      prepare(query) { return { bind(...values) { return () => sqlite.prepare(query).run(...values); } }; },
      async batch(statements) { sqlite.exec("BEGIN"); try { statements.forEach((run) => run()); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; } },
    }));
    await remove("account-1");
    for (const table of ["user", "session", "community_subscribers", "availability_alerts", "wanted_requests"]) assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1, table);
    assert.equal(sqlite.prepare("SELECT email FROM community_subscribers").get().email, "two@example.test");
    assert.equal(sqlite.prepare("SELECT status FROM products WHERE id='product-1'").get().status, "inactive");
    assert.equal(sqlite.prepare("SELECT status FROM sellers WHERE id='seller-1'").get().status, "suspended");
    assert.equal(sqlite.prepare("SELECT status FROM products WHERE id='product-2'").get().status, "active");
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM orders").get().n, 1);
    assert.equal(sqlite.prepare("SELECT status FROM preorder_reservations").get().status, "cancelled");
    assert.equal(sqlite.prepare("SELECT allocated_quantity FROM preorder_reservations").get().allocated_quantity, 0);
    assert.equal(sqlite.prepare("SELECT status FROM preorder_waitlist").get().status, "cancelled");
    assert.equal(sqlite.prepare("SELECT status FROM collection_offers WHERE id='offer-1'").get().status, "withdrawn");
    assert.equal(sqlite.prepare("SELECT status FROM collection_offers WHERE id='offer-paid'").get().status, "completed");
  } finally { sqlite.close(); }
});
