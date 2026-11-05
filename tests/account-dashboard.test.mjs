import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { orderDeliveryLabel, orderTrackingHref } from "../lib/account-presentation.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

test("order progress distinguishes a label from dispatch and handles manual carrier tracking", () => {
  const order = { paymentStatus: "paid", fulfillmentStatus: "processing", carrier: "USPS", trackingNumber: "9400 123&45" };
  assert.equal(orderDeliveryLabel(order), "Preparing to ship");
  assert.equal(orderDeliveryLabel({ ...order, shipment: { status: "label_created" } }), "Label created");
  assert.equal(orderDeliveryLabel({ ...order, shipment: { status: "in_transit" } }), "In transit");
  assert.equal(orderDeliveryLabel({ ...order, fulfillmentStatus: "delivered" }), "Delivered");
  assert.equal(orderDeliveryLabel({ ...order, fulfillmentStatus: "delivered", shipment: { status: "in_transit" } }), "Delivered");
  assert.equal(orderDeliveryLabel({ ...order, fulfillmentStatus: "cancelled" }), "Cancelled");
  assert.equal(orderDeliveryLabel({ paymentStatus: "pending", fulfillmentStatus: "unfulfilled" }), "Not dispatched");
  assert.equal(orderTrackingHref(order), "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400%20123%2645");
  assert.equal(orderTrackingHref({ ...order, carrier: "Unknown courier" }), null);
  assert.equal(orderTrackingHref({ ...order, trackingNumber: "" }), null);
  assert.equal(orderTrackingHref({ shipment: { trackingUrl: "javascript:alert(1)" } }), null);
  assert.equal(orderTrackingHref({ shipment: { trackingUrl: "https://user:secret@carrier.test/track" } }), null);
  assert.equal(orderTrackingHref({ shipment: { trackingUrl: "https://carrier.test/track/123" } }), "https://carrier.test/track/123");
});

test("account views expose real activity, actionable counts and concise order support", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/account-test-")), bundle = join(scratch, "account.mjs");
  const mocks = {
    "next/link": 'import React from "react"; export default function Link({children,...props}) {return React.createElement("a",props,children)}',
    "next/image": 'import React from "react"; export default function Image({unoptimized,...props}) {return React.createElement("img",props)}',
    "next/navigation": 'export const useRouter=()=>({push(){},refresh(){}});',
    "./preorder-dashboard": 'import React from "react"; export const PreorderDashboard=({children})=>React.createElement("div",{className:"garage-list integrated-preorders"},children([])); export const PreorderOrderHistory=()=>null;',
  };
  const output = await build({ stdin: { contents: "export {AccountDashboard} from './components/account-dashboard.tsx'; export {OrderProtectionSummary} from './components/order-protection-summary.tsx';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "account-ui-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
      builder.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "export default {};" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { AccountDashboard, OrderProtectionSummary } = await import(pathToFileURL(bundle).href);
  t.after(async () => { await unlink(bundle); await rmdir(scratch); });
  const order = { id: "order-1", orderNumber: "MCC-001", createdAt: "2026-09-18T12:00:00Z", paidAt: "2026-09-18T12:00:00Z", shippedAt: "2026-09-20T12:00:00Z", sellerName: "Apex Miniatures", sellerSlug: "apex", currency: "usd", totalCents: 25695, paymentStatus: "paid", fulfillmentStatus: "shipped", carrier: "UPS", trackingNumber: "1Z123", shipment: null,
    items: [{ id: "item-1", productTitleSnapshot: "Nissan Fairlady Z", scaleSnapshot: "1:18", manufacturerSnapshot: "AUTOart", quantity: 1, imageUrlSnapshot: "/car.png" }] };
  const data = { wishlist: ["saved-1", "saved-2"], savedListings: [{ id: "saved-1", slug: "saved-nissan", title: "Saved Nissan", scale: "1:18", modelManufacturer: "AUTOart", modelCondition: "excellent", sellerName: "Seller One", primaryImageUrl: null, priceCents: 25000, currency: "usd", availabilityType: "in_stock", availableQuantity: 1 }], orders: [order], hunts: [], listings: [], sales: [], seller: null };
  const render = (initialView, overrides = {}) => renderToStaticMarkup(React.createElement(AccountDashboard, { initialView, data: { ...data, ...overrides }, profile: { displayName: "Alex", handle: "alex", avatarUrl: null, bio: "", onboardingCompleted: true }, email: "alex@example.test", isNew: false }));
  await t.test("overview leads with the purchased model and saved listings; every count has a destination", () => {
    const html = render("overview");
    assert.ok(html.indexOf("Nissan Fairlady Z") < html.indexOf("Account activity totals"));
    assert.ok(html.indexOf("Saved Nissan") < html.indexOf("Account activity totals"));
    for (const [label, count, view] of [["Wishlist", 2, "wishlist"], ["Orders", 1, "orders"], ["Sales", 0, "sales"]]) assert.ok(html.includes(`href="/account?view=${view}#account-content"><span>${label}</span><strong>${count}</strong>`));
    assert.match(html, /href="\/account\?view=orders#order-order-1"/);
    assert.doesNotMatch(html, />Sell a Model</);
    assert.match(render("orders"), /value="orders" selected=""/);
    assert.match(render("unknown"), /value="overview" selected=""/);
  });
  await t.test("tracking and help precede policy copy; the exact deadline remains visible", () => {
    const html = render("orders");
    assert.ok(html.indexOf("Nissan Fairlady Z") < html.indexOf("Open an MCC request by"));
    assert.ok(html.indexOf(">Track package<") < html.indexOf("Open an MCC request by"));
    assert.ok(html.indexOf("Get help with this order") < html.indexOf("Open an MCC request by"));
    assert.match(html, /href="https:\/\/www\.ups\.com\/track\?tracknum=1Z123"/);
    assert.match(html, /href="\/resolution\?order=order-1"/);
    assert.match(html, /dateTime="2026-10-20T12:00:00.000Z"/);
    assert.match(html, /<details[^>]*><summary>Protection &amp; return details/);
    assert.doesNotMatch(html, /<details[^>]*open[^>]*><summary>Protection/);
    assert.match(html, /1:18 · AUTOart/);
    const delivered = render("orders", { orders: [{ ...order, deliveredAt: "2026-09-21T12:00:00Z", fulfillmentStatus: "delivered", refundRequestDeadline: "2026-09-24T16:00:00Z" }] });
    assert.match(delivered, /dateTime="2026-09-24T16:00:00Z"/);
    assert.match(delivered, /3 calendar days after confirmed delivery/);
    assert.match(delivered, /fromOrderItem=item-1/);
    const noTracking = render("orders", { orders: [{ ...order, trackingNumber: null }] });
    assert.doesNotMatch(noTracking, />Track package</);
    assert.match(noTracking, /Tracking has not been added yet/);
    assert.match(noTracking, /Get help with this order/);
    const expandedElsewhere = renderToStaticMarkup(React.createElement(OrderProtectionSummary, { order }));
    assert.doesNotMatch(expandedElsewhere, /<details/);
  });
  await t.test("empty and unavailable saved items preserve a useful next action", () => {
    const html = render("overview", { orders: [], wishlist: [], savedListings: [] });
    assert.match(html, /No orders yet/); assert.match(html, /href="\/marketplace"/);
    assert.match(html, /No saved listings yet/);
    const unavailable = render("wishlist", { savedListings: [] });
    assert.match(unavailable, /aren’t currently available/);
    assert.match(unavailable, /href="\/wishlist"/);
    assert.equal((render("listings").match(/>Sell a Model</g) || []).length, 1);
  });
  await t.test("collector sales can create labels and reprint shipped labels without exposing seller actions to buyers", () => {
    const shipping = { configured: true, insuranceThresholdCents: 25000, signatureThresholdCents: 75000 };
    const sale = { ...order, shippingMode: "calculated", shippingCents: 950, subtotalCents: 25000, fulfillmentStatus: "unfulfilled", selectedShippingCarrier: "USPS", selectedShippingService: "Priority Mail", selectedShippingEstimatedDays: 3 };
    const seller = { id: "collector", sellerType: "collector", defaultPackageLength: "12", defaultPackageWidth: "8", defaultPackageHeight: "6", defaultPackageWeight: "2" };
    const html = render("sales", { sales: [sale], shipping, seller });
    assert.match(html, /Create shipping label/);
    assert.match(html, /Get carrier rates/);
    assert.match(html, /The buyer paid.*\$9\.50.*Checkout does not buy a label/);
    assert.match(html, /name="length"[^>]*value="12"/);
    const shipment = { id: "owned-shipment", carrier: "USPS", serviceLevel: "Priority Mail", currency: "usd", parcelLength: "12", parcelWidth: "8", parcelHeight: "6", parcelWeight: "2", declaredValueCents: 25000, insuranceRequired: true, signatureRequired: false, trackingNumber: "940001", trackingUrl: null, status: "in_transit", statusDetails: "", eta: null, combinedOrderIds: [sale.id], events: [] };
    const shipped = { ...sale, fulfillmentStatus: "shipped", shipment };
    const existing = render("sales", { sales: [shipped], shipping: { ...shipping, configured: false }, seller });
    assert.match(existing, /href="\/api\/shipping\/label\?shipment_id=owned-shipment"/);
    assert.match(existing, /Print 4×6 label/);
    assert.doesNotMatch(existing, /Get carrier rates|Buy label/);
    assert.doesNotMatch(render("orders", { orders: [shipped] }), /Print 4×6 label|\/api\/shipping\/label/);
    for (const fulfillmentStatus of ["processing", "shipped", "delivered", "cancelled"]) {
      assert.doesNotMatch(render("sales", { sales: [{ ...sale, fulfillmentStatus }], shipping, seller }), /Get carrier rates|Mark shipped manually/);
    }
    const unavailable = render("sales", { sales: [sale], shipping: { ...shipping, configured: false }, seller });
    assert.match(unavailable, /Label purchasing is temporarily unavailable/);
    assert.match(unavailable, /Mark shipped manually/);
  });
  await t.test("listing cards keep draft actions private and offer live controls only for published listings", () => {
    const listing = { id: "my-listing", slug: "mclaren-f1", title: "UT Models Mclaren F1 LM Orange 1:18", status: "draft", priceCents: 100, currency: "usd", inventoryQuantity: 1, reservedQuantity: 0, primaryImageUrl: "/car.png" };
    const draft = render("listings", { listings: [listing] });
    assert.match(draft, />Continue editing<\/a>/);
    assert.match(draft, /href="\/sell\/model\?id=my-listing"/);
    assert.match(draft, />Not published</);
    assert.match(draft, /\$1.00/);
    assert.match(draft, /1 in stock/);
    assert.doesNotMatch(draft, /0 reserved|Deactivate|Take off sale|href="\/products\//);
    const live = render("listings", { listings: [{ ...listing, status: "active", inventoryQuantity: 3, reservedQuantity: 1 }] });
    assert.match(live, />Edit listing<\/a>/);
    assert.match(live, />View listing<\/a>/);
    assert.match(live, /href="\/products\/mclaren-f1"/);
    assert.match(live, />Take off sale<\/button>/);
    assert.match(live, /1 reserved/);
    for (const status of ["inactive", "pending_review", "rejected", "sold_out"]) {
      const html = render("listings", { listings: [{ ...listing, status, primaryImageUrl: null }] });
      assert.match(html, /No photo yet/);
      assert.doesNotMatch(html, /Take off sale|href="\/products\//);
    }
    const rejected = render("listings", { listings: [{ ...listing, status: "rejected", rejectionReason: "Disclose the chipped paint." }] });
    assert.match(rejected, />Fix listing<\/a>/);
    assert.match(rejected, /Marketplace note<\/strong>Disclose the chipped paint/);
  });
  await t.test("Payments exposes Stripe management and explains release totals without claiming bank deposits", () => {
    const seller = { id: "collector", sellerType: "collector", status: "active", stripeAccountId: "acct_fixture", stripeChargesEnabled: true, stripePayoutsEnabled: true };
    const payment = { ...order, subtotalCents: 25000, shippingCents: 695, taxCents: 0, marketplaceFeeBps: 1000, platformFeeCents: 2500, processingFeePayer: "seller", paymentProcessingFeeCents: 800, sellerProceedsCents: 22395, shippingLabelCostCents: 695, refundedAmountCents: 0, paymentFlow: "separate", sellerTransferStatus: "transferred", sellerTransferAmountCents: 21700, sellerTransferReversedCents: 1000, sellerTransferredAt: "2026-10-05", payoutEligibleAt: "2026-10-05", payoutHold: false, isTestOrder: false };
    const html = render("payments", { seller, payments: [payment, { ...payment, id: "refunded", orderNumber: "MCC-REFUNDED", paymentStatus: "refunded", sellerTransferStatus: "reversed", sellerTransferReversedCents: 21700 }] });
    assert.match(html, /value="payments" selected=""/);
    assert.match(html, /Manage payouts &amp; bank details/);
    assert.match(html, /\$207\.00/);
    assert.match(html, /not your current Stripe balance or money deposited into your bank/);
    assert.match(html, /MCC-REFUNDED/);
    assert.match(html, /Release reversed/);
    assert.match(html, /view=sales#sale-order-1/);
    assert.match(render("payments", { seller, payments: [] }), /No payments yet/);
    assert.match(render("payments", { seller: null }), /Start a collector listing/);
    assert.match(render("payments", { seller: { ...seller, sellerType: "professional" } }), /href="\/store\?view=payments"/);
    const setup = render("payments", { seller: { ...seller, stripeAccountId: null, stripePayoutsEnabled: false } });
    assert.match(setup, /disabled="">Connect payout account/);
    assert.doesNotMatch(setup, /Manage payouts &amp; bank details/);
  });
});

test("saved previews are scoped to the buyer, sorted by save date, and omit private or suspended listings", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/account-data-test-")), bundle = join(scratch, "data.mjs");
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", file), "utf8"));
  const binding = { prepare(query) { let values = []; return { bind(...args) { values = args; return this; }, async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); } }; } };
  globalThis.__accountDb = drizzle(binding);
  t.after(async () => { sqlite.close(); delete globalThis.__accountDb; await unlink(bundle); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {getGarageData} from './lib/collector-store.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "account-db", setup(builder) { builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const getDb=()=>globalThis.__accountDb; export const getD1=()=>null;" })); } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { getGarageData } = await import(pathToFileURL(bundle).href);
  for (const id of ["buyer", "other"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  sqlite.prepare("INSERT INTO sellers (id,slug,store_name,contact_name,contact_email,status,seller_terms_version,seller_terms_accepted_at) VALUES ('seller','seller','Seller','Owner','seller@example.test','active',?,CURRENT_TIMESTAMP)").run(POLICY_VERSION);
  sqlite.exec("INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','AUTOart','autoart','1:18','Nissan','Fairlady','Nissan Fairlady')");
  for (const [id, status, inventory, reserved] of [["oldest", "active", 1, 0], ["older", "active", 1, 0], ["newer", "active", 2, 1], ["sold", "sold_out", 0, 0], ["draft", "draft", 1, 0]]) sqlite.prepare("INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,reserved_quantity,status) VALUES (?,'seller','model',?,?,?,'1:18','AUTOart','Nissan','Fairlady',25000,?,?,?)").run(id, id, id, id, inventory, reserved, status);
  for (const [id, timestamp, owner] of [["oldest", "2026-08-01", "buyer"], ["older", "2026-09-01", "buyer"], ["newer", "2026-09-02", "buyer"], ["draft", "2026-09-04", "buyer"], ["sold", "2026-09-03", "other"]]) sqlite.prepare("INSERT INTO wishlist_items (id,user_id,product_id,created_at) VALUES (?,?,?,?)").run(`${owner}-${id}`, owner, id, timestamp);
  const data = await getGarageData("buyer");
  assert.equal(data.wishlist.length, 4); assert.deepEqual(data.savedListings.map(row => row.id), ["newer", "older"]);
  assert.equal(data.savedListings[0].availableQuantity, 1);
  assert.deepEqual((await getGarageData("other")).savedListings.map(row => row.id), ["sold"]);
  assert.equal((await getGarageData("other")).savedListings[0].availableQuantity, 0);
  sqlite.exec("UPDATE sellers SET status='suspended'");
  assert.deepEqual((await getGarageData("buyer")).savedListings, []);
  sqlite.exec("UPDATE sellers SET status='active',seller_terms_version='outdated'");
  assert.deepEqual((await getGarageData("buyer")).savedListings, []);
});
