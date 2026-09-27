import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir, readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sellerFixture, reviewDate } from "./fixtures/seller-dashboard.mjs";
import { prioritizeOrders, sellerOrderPayout, sellerPaymentStatus, sellerSalesReport, sellerTimestamp } from "../lib/seller-dashboard.ts";
import { matchesInventoryView } from "../lib/seller-hub.ts";
import { buildSellerSetup } from "../lib/seller-setup.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

test("dispatch queue puts earliest paid deadlines first without mutating history", () => {
  const order = sellerFixture().orders[0];
  const rows = [{ ...order, id: "missing", shipByAt: null }, { ...order, id: "later", shipByAt: "2026-09-23T12:00:00Z" }, { ...order, id: "shipped", fulfillmentStatus: "shipped", shipByAt: "2026-09-01T00:00:00Z" }, { ...order, id: "overdue" }];
  assert.deepEqual(prioritizeOrders(rows).map(row => row.id), ["overdue", "later", "missing", "shipped"]);
  assert.equal(rows[0].id, "missing");
  assert.equal(sellerTimestamp("2026-09-22 12:00:00"), reviewDate.getTime());
});

test("store data keeps packing snapshots and messages within the seller account", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url)), scratch = await mkdtemp(join(root, ".sites-runtime/seller-data-test-")), bundle = join(scratch, "data.mjs");
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", file), "utf8"));
  const binding = { prepare(query) { let values = []; return { bind(...params) { values = params; return this; }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); }, async all() { return { results: sqlite.prepare(query).all(...values), success: true }; }, async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; } }; } };
  globalThis.__sellerDashboardTest = { db: drizzle(binding), binding };
  t.after(async () => { delete globalThis.__sellerDashboardTest; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {getStoreDashboardData,saveStoreProfile} from './lib/store.ts'; export {getMessagingCenterData} from './lib/messaging.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "seller-db-boundary", setup(builder) { builder.onResolve({ filter: /^@\/db$/ }, ({ path }) => ({ path, namespace: "seller-db" })); builder.onLoad({ filter: /.*/, namespace: "seller-db" }, () => ({ contents: "export const getDb=()=>globalThis.__sellerDashboardTest.db; export const getD1=()=>globalThis.__sellerDashboardTest.binding;" })); } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { getStoreDashboardData, getMessagingCenterData, saveStoreProfile } = await import(pathToFileURL(bundle).href);
  for (const id of ["owner", "other", "buyer"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  for (const id of ["owner", "other"]) sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type) VALUES (?,?,?,?,?,?,'active','professional')").run(id, id, id, id, id, `${id}@example.test`);
  for (const [id, seller] of [["one", "owner"], ["missing", "owner"], ["private", "other"]]) sqlite.prepare("INSERT INTO orders (id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,marketplace_fee_bps,platform_fee_cents,total_cents,payment_status,paid_at) VALUES (?,?,?,?,?,'usd',10000,0,1000,1000,10000,'paid','2026-09-21T12:00:00Z')").run(id, id, seller, `session-${id}`, "buyer@example.test");
  for (const id of ["one", "private"]) sqlite.prepare("INSERT INTO order_items (id,order_id,product_title_snapshot,seller_sku_snapshot,scale_snapshot,manufacturer_snapshot,unit_price_cents,quantity,image_url_snapshot) VALUES (?,?,?,'SKU-123','1:18','AUTOart',5000,2,'/snapshot.jpg')").run(`item-${id}`, id, `${id} car`);
  const data = await getStoreDashboardData("owner");
  assert.deepEqual(data.orders.map(order => order.id).sort(), ["missing", "one"]);
  const item = data.orders.find(order => order.id === "one").items[0];
  assert.equal(item.quantity, 2); assert.equal(item.sellerSkuSnapshot, "SKU-123"); assert.equal(item.imageUrlSnapshot, "/snapshot.jpg"); assert.equal(item.scaleSnapshot, "1:18");
  assert.equal(data.orders.find(order => order.id === "missing").items.length, 0, "Never reconstruct missing purchased items from current inventory");
  assert.equal(data.analytics.unitsSold, 2);
  assert.equal(sellerSalesReport(data.orders, 30, reviewDate).current.missingItems, 1);
  for (const [id, buyer, seller] of [["incoming", "buyer", "owner"], ["outgoing", "owner", "other"], ["private", "buyer", "other"]]) sqlite.prepare("INSERT INTO conversations (id,buyer_user_id,seller_id,product_slug_snapshot,product_title_snapshot) VALUES (?,?,?,'car','Car enquiry')").run(id, buyer, seller);
  const inbox = await getMessagingCenterData("owner", { sellerOnly: true, conversationId: "outgoing" });
  assert.deepEqual(inbox.conversations.map(row => row.id), ["incoming"]);
  assert.equal(inbox.activeConversation.id, "incoming");
  assert.deepEqual((await getMessagingCenterData("owner")).conversations.map(row => row.id).sort(), ["incoming", "outgoing"]);
  const intro = { ...sellerFixture().store, section: "introduction", logoUrl: "/media/store-logos/owner/abc-123.jpg" };
  await saveStoreProfile({ ...data.store, id: "owner" }, intro);
  assert.equal(sqlite.prepare("SELECT logo_url FROM sellers WHERE id='owner'").get().logo_url, intro.logoUrl);
  await assert.rejects(saveStoreProfile({ ...data.store, id: "owner" }, { ...intro, logoUrl: "/media/store-logos/other/abc-123.jpg" }), /uploaded for this store/);
});

test("payment state gives one actionable blocker and keeps legacy releases distinct", () => {
  const { store, orders } = sellerFixture();
  assert.match(sellerPaymentStatus(store, false).title, /accept Seller Terms/);
  assert.match(sellerPaymentStatus(store, false).detail, /Stripe is connected/);
  assert.equal(sellerPaymentStatus({ ...store, status: "applicant", stripeChargesEnabled: false }, true).action, "Ask about store approval");
  assert.match(sellerPaymentStatus({ ...store, stripePayoutsEnabled: false }, true).title, /finish bank setup/);
  assert.equal(sellerPaymentStatus({ ...store, status: "onboarding" }, true).action, "Refresh status");
  assert.equal(sellerPaymentStatus(store, true).title, "Ready to receive payments");
  assert.match(sellerPaymentStatus({ ...store, status: "suspended" }, true).title, /suspended/);
  assert.deepEqual(sellerOrderPayout(orders[1]), { label: "Legacy direct payout", amount: null, legacy: true });
  assert.equal(sellerOrderPayout({ ...orders[2], sellerTransferReversedCents: 1167 }).amount, 9000);
  assert.equal(sellerOrderPayout({ ...orders[0], sellerProceedsCents: null }).amount, null);
  assert.equal(sellerOrderPayout({ ...orders[0], paymentStatus: "refunded" }).amount, 0);
});

test("logo uploads require an eligible store, strip metadata, and only expose the public logo path", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url)), scratch = await mkdtemp(join(root, ".sites-runtime/seller-logo-test-")), bundle = join(scratch, "logo.mjs");
  const objects = new Map();
  const boundary = { account: { user: { id: "owner" }, seller: { id: "seller-one", sellerType: "professional", status: "active" } }, env: { IMAGES: { async put(key, bytes, options) { objects.set(key, { bytes, options }); }, async get(key) { const object = objects.get(key); return object ? { body: object.bytes, httpEtag: '"logo-etag"', writeHttpMetadata(headers) { headers.set("Content-Type", object.options.httpMetadata.contentType); } } : null; } } } };
  globalThis.__sellerLogoTest = boundary;
  t.after(async () => { delete globalThis.__sellerLogoTest; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {POST} from './app/api/store/logo/route.ts'; export {GET} from './app/media/[...key]/route.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false, plugins: [{ name: "logo-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(cloudflare:workers|@\/lib\/collector-auth)$/ }, ({ path }) => ({ path, namespace: "logo-test" }));
    builder.onLoad({ filter: /.*/, namespace: "logo-test" }, ({ path }) => ({ contents: path === "cloudflare:workers" ? "export const env=globalThis.__sellerLogoTest.env;" : "export const requireCollectorApi=async()=>globalThis.__sellerLogoTest.account;" }));
  } }] });
  await writeFile(bundle, output.outputFiles[0].contents); const { POST, GET } = await import(pathToFileURL(bundle).href);
  const jpeg = new Uint8Array([255,216,255,225,0,5,71,80,83,255,218,0,2,12,255,217]);
  const request = (bytes = jpeg, name = "logo.jpg") => { const form = new FormData(); form.set("photo", new File([bytes], name)); return new Request("http://localhost/api/store/logo", { method: "POST", body: form }); };
  const validAccount = boundary.account;
  boundary.account = new Response("Unauthorized", { status: 401 }); assert.equal((await POST(request())).status, 401);
  boundary.account = { ...validAccount, seller: null }; assert.equal((await POST(request())).status, 403);
  boundary.account = { ...validAccount, seller: { ...validAccount.seller, status: "suspended" } }; assert.equal((await POST(request())).status, 403);
  boundary.account = validAccount;
  assert.equal((await POST(request(new TextEncoder().encode("<svg/>"), "logo.svg"))).status, 400);
  assert.equal(objects.size, 0);
  const response = await POST(request()); assert.equal(response.status, 201);
  const { url } = await response.json(); assert.match(url, /^\/media\/store-logos\/seller-one\/[a-f0-9-]+\.jpg$/);
  const key = url.slice("/media/".length);
  assert.equal(Buffer.from(objects.get(key).bytes).includes(Buffer.from("GPS")), false);
  const image = await GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ key: key.split("/") }) });
  assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/jpeg");
  const cached = await GET(new Request(`http://localhost${url}`, { headers: { "if-none-match": '"logo-etag"' } }), { params: Promise.resolve({ key }) }); assert.equal(cached.status, 304);
  assert.equal((await GET(new Request("http://localhost/media/community/private.jpg"), { params: Promise.resolve({ key: "community/private.jpg" }) })).status, 404);
});

test("one date range drives sales, previous period, chart, and product performance", () => {
  const { orders } = sellerFixture();
  const rows = [...orders, { ...orders[0], id: "previous", createdAt: "2026-07-01", paidAt: "2026-08-01T12:00:00Z" }, { ...orders[0], id: "test", isTestOrder: true }, { ...orders[0], id: "refunded", paymentStatus: "refunded" }, { ...orders[0], id: "euro", currency: "eur" }, { ...orders[0], id: "future", paidAt: "2026-09-23T00:00:00Z" }];
  const report = sellerSalesReport(rows, 30, reviewDate);
  assert.equal(report.current.orders, 3); assert.equal(report.previous.orders, 1);
  assert.equal(report.current.revenueCents, 11707 * 3); assert.equal(report.current.units, 2);
  assert.equal(report.current.missingItems, 1); assert.deepEqual(report.missingOrderIds, ["o2"]);
  assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.revenueCents, 0), report.current.revenueCents);
  assert.equal(report.products[0].previousRevenueCents, 11707);
  assert.equal(sellerSalesReport(rows, 90, reviewDate).current.orders, 4);
  assert.equal(sellerSalesReport(rows, 30, reviewDate, "eur").current.orders, 1);
  assert.equal(report.excludedTestOrders, 1);
});

test("attention queue includes incomplete photo evidence exactly once", () => {
  const { inventory } = sellerFixture();
  assert.deepEqual(inventory.filter(product => matchesInventoryView(product, "attention", [])).map(product => product.id), ["p2", "p3"]);
  assert.equal(matchesInventoryView({ ...inventory[1], availabilityType: "preorder" }, "attention", []), false);
});

test("seller screens render useful queues, honest payments and available navigation", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url)), scratch = await mkdtemp(join(root, ".sites-runtime/seller-ui-test-")), bundle = join(scratch, "seller.mjs");
  const mocks = {
    "next/link": 'import React from "react"; export default function Link({children,...props}) {return React.createElement("a",props,children)}',
    "next/image": 'import React from "react"; export default function Image({unoptimized,...props}) {return React.createElement("img",props)}',
    "next/navigation": 'export const useRouter=()=>({push(){},replace(){},refresh(){}}); export const useSearchParams=()=>new URLSearchParams(); export const usePathname=()=>"/store";',
  };
  const output = await build({ stdin: { contents: "export {StoreDashboard} from './components/store-dashboard.tsx'; export {MessageCenter} from './components/message-center.tsx'; export {storeLogoUrl} from './lib/store-logo.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "seller-ui-adapters", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
      builder.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "export default {};" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { StoreDashboard, MessageCenter, storeLogoUrl } = await import(pathToFileURL(bundle).href);
  t.after(async () => { await unlink(bundle); await rmdir(scratch); });
  const render = (initialView, props = {}) => renderToStaticMarkup(React.createElement(StoreDashboard, { initialView, data: sellerFixture(), email: "seller@example.test", ...props }));
  await t.test("storefront navigation only links to public stores and explains setup blockers", () => {
    const data = sellerFixture();
    for (const [status, version, acceptedAt, expected] of [
      ["active", null, null, "Review Seller Terms"],
      ["active", "older-terms", "2026-01-01", "Review Seller Terms"],
      ["active", POLICY_VERSION, null, "Review Seller Terms"],
      ["onboarding", POLICY_VERSION, "2026-09-22", "Complete payment setup"],
      ["applicant", POLICY_VERSION, "2026-09-22", "Check store approval"],
      ["suspended", POLICY_VERSION, "2026-09-22", "Contact seller support"],
      ["active", POLICY_VERSION, "2026-09-22", "View storefront"],
    ]) {
      const store = { ...data.store, status, sellerTermsVersion: version, sellerTermsAcceptedAt: acceptedAt };
      const html = render("overview", { data: { ...data, store, setup: buildSellerSetup(store, data.inventory, false) } });
      const sidebar = html.match(/<aside class="store-sidebar">([\s\S]*?)<\/aside>/)[1];
      assert.ok(sidebar.includes(expected), `${status}: ${expected}`);
      if (expected === "View storefront") assert.match(sidebar, /href="\/sellers\/apex-review"/);
      else {
        assert.match(sidebar, /Storefront not live/);
        assert.doesNotMatch(sidebar, /href="\/sellers\//);
        if (expected === "Review Seller Terms") assert.match(sidebar, /href="\/store\?view=settings&amp;filter=terms#seller-terms"/);
      }
    }
  });
  await t.test("seller inbox dates render identically across browser and server time zones", () => {
    const previousTimezone = process.env.TZ;
    try {
      for (const lastMessageAt of ["2026-08-21T04:39:00Z", "2026-08-21 04:39:00"]) {
        const conversation = { id: "enquiry", viewerRole: "seller", otherPartyName: "Buyer", sellerName: "Store", sellerSlug: "store", productTitle: "Model", productSlug: "model", productImageUrl: null, lastMessageAt, lastMessagePreview: "Packing question", unreadCount: 0 };
        const initialData = { conversations: [conversation], activeConversation: { ...conversation, messages: [{ id: "message", isOwn: false, senderLabel: "Buyer", createdAt: lastMessageAt, body: "Packing question" }] }, newConversation: null, totalUnread: 0 };
        const markup = zone => { process.env.TZ = zone; return renderToStaticMarkup(React.createElement(MessageCenter, { initialData, sellerContext: true })); };
        const server = markup("UTC");
        assert.equal(markup("America/Los_Angeles"), server);
        assert.equal(markup("Asia/Tokyo"), server);
        assert.match(server, /Aug 21, 2026/);
        assert.match(server, /4:39 AM UTC/);
      }
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
  await t.test("overview shows shipping work before setup and growth destinations stay actionable", () => {
    const html = render("overview");
    assert.ok(html.indexOf("Orders to ship") < html.indexOf("Store setup"));
    assert.ok(html.indexOf("Nissan Fairlady") < html.indexOf("Store setup"));
    assert.match(html, /href="\/store\?view=messages"/);
    assert.doesNotMatch(html, />Opportunities<|>Marketing<|>Sales and performance</);
    assert.match(render("marketing"), /<h2>Growth<\/h2>/);
    assert.match(render("growth"), /Listings collectors saved/);
  });
  await t.test("orders keep items, deadline and shipment action ahead of collapsed finances", () => {
    const html = render("orders", { initialFilter: "all" });
    assert.ok(html.indexOf("APEX-001") < html.indexOf("Payment &amp; fee details"));
    assert.match(html, /Qty 1/); assert.match(html, /Dispatch deadline/);
    assert.match(html, /class="seller-money">\$117\.07/);
    assert.match(html, /<details class="seller-fulfillment"><summary>Create shipment/);
    assert.match(html, /<details class="seller-order-finances"><summary>Payment &amp; fee details/);
    assert.match(html, /Item details are missing/);
    assert.match(html, /Legacy direct payouts are excluded/);
  });
  await t.test("payments explain connected accounts with outstanding terms and excluded legacy amounts", () => {
    const html = render("payments");
    assert.match(html, /Action required: accept Seller Terms/); assert.match(html, /Stripe is connected/);
    assert.match(html, /legacy direct-payout order is excluded/); assert.match(html, /Legacy direct payout/);
    assert.doesNotMatch(html, /Your connection is ready to accept payments/);
  });
  await t.test("inventory has compact photo actions and a persistent four-section editor", () => {
    const html = render("inventory"); assert.match(html, /Update stock &amp; price/); assert.match(html, /Import CSV/);
    assert.match(html, /Photos incomplete · Review/); assert.match(html, /seller-thumbnail/);
    const editor = render("inventory", { initialProductId: "p1" });
    for (const section of ["model", "price", "condition", "photos"]) assert.match(editor, new RegExp(`id="listing-${section}"`));
    assert.match(editor, /seller-editor-footer/); assert.match(editor, /Save changes/);
    assert.match(editor, /Before publishing/);
    assert.match(render("inventory", { initialProductId: "new" }), /Save draft/);
  });
  await t.test("analytics flags missing items and settings use owned image uploads", () => {
    const html = render("analytics"); assert.match(html, /Date range/); assert.match(html, /Recorded units/); assert.match(html, /paid order has.*no item records/);
    assert.match(html, /seller-revenue-chart/); assert.match(html, /Review listing/);
    const settings = render("settings"); assert.match(settings, /Settings section/); assert.match(settings, /Choose logo/); assert.doesNotMatch(settings, /Logo URL|two-letter code/);
    assert.equal(storeLogoUrl("/media/store-logos/review-store/abc-123.jpg", "review-store"), "/media/store-logos/review-store/abc-123.jpg");
    assert.throws(() => storeLogoUrl("/media/store-logos/other/abc.jpg", "review-store"));
    assert.throws(() => storeLogoUrl("javascript:alert(1)", "review-store"));
    assert.equal(storeLogoUrl("https://example.test/legacy.png", "review-store"), "https://example.test/legacy.png");
  });
});
