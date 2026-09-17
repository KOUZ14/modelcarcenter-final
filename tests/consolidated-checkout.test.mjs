import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import { config } from "../lib/config.ts";
import { POLICY_VERSION } from "../lib/legal.ts";
import { allocateCents, allocateCheckoutLines } from "../lib/checkout-allocation.ts";

test("seller allocations preserve every cent and reject mismatched paid lines", () => {
  assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateCents(0, [0, 0]), [0, 0]);
  assert.throws(() => allocateCents(1, [0]), /without an order/);
  const reservations = [{ id: "a", subtotalCents: 1000, shippingCents: 100 }, { id: "b", subtotalCents: 2000, shippingCents: 0 }];
  const lines = [
    { quantity: 1, amount_total: 1100, amount_tax: 85, price: { unit_amount: 1100, product: { metadata: { reservation_id: "a" } } } },
    { quantity: 1, amount_total: 2000, amount_tax: 0, price: { unit_amount: 2000, product: { metadata: { reservation_id: "b" } } } },
  ];
  const result = allocateCheckoutLines(reservations, lines, 3100, 85, 121);
  assert.equal(result.reduce((sum, row) => sum + row.processingFeeCents, 0), 121);
  assert.deepEqual(result.map((row) => row.taxCents), [85, 0], "Inclusive tax belongs to the seller's actual taxed lines");
  assert.throws(() => allocateCheckoutLines(reservations, lines, 3000, 85, 121), /do not match/);
  assert.throws(() => allocateCheckoutLines(reservations, [{ ...lines[0], quantity: 2 }, lines[1]], 3100, 85, 121), /reserved seller/);
});

test("consolidated payments, quotes, inventory, refunds, and payouts use distinct seller orders", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".consolidated-test-")), bundle = join(scratch, "checkout.mjs");
  const sqlite = new DatabaseSync(":memory:");
  let beforeBatch;
  const binding = {
    prepare(query) {
      let values = [];
      return { query,
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async first(column) { const row = sqlite.prepare(query).get(...values); return column ? row?.[column] ?? null : row ?? null; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) {
      const intercept = beforeBatch; beforeBatch = undefined; intercept?.(statements);
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  for (const name of (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const id of ["buyer", "other-buyer", "owner-a", "owner-b"]) sqlite.prepare("INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 0, 0)").run(id, id, `${id}@example.test`);
  sqlite.exec("INSERT INTO catalog_products (id, model_car_manufacturer, manufacturer_key, scale, vehicle_make, vehicle_model, title) VALUES ('catalog-fixture', 'Maker', 'maker', '1:18', 'Make', 'Model', 'Model')");
  for (const seller of ["a", "b"]) {
    sqlite.prepare(`INSERT INTO sellers (id, owner_user_id, slug, store_name, contact_name, contact_email, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, seller_terms_version, seller_terms_accepted_at, shipping_mode, default_shipping_cents, shipping_origin_street_1, shipping_origin_city, shipping_origin_region, shipping_origin_postal_code, shipping_origin_phone) VALUES (?, ?, ?, ?, 'Owner', ?, 'active', ?, 1, 1, ?, CURRENT_TIMESTAMP, 'flat', 800, '100 Market St', 'San Francisco', 'CA', '94105', '4155550100')`).run(seller, `owner-${seller}`, seller, `Store ${seller}`, `owner-${seller}@example.test`, `acct_${seller}`, POLICY_VERSION);
    sqlite.prepare(`INSERT INTO products (catalog_product_id, id, seller_id, slug, seller_sku, title, scale, model_manufacturer, vehicle_make, vehicle_model, price_cents, inventory_quantity, status) VALUES ('catalog-fixture', ?, ?, ?, ?, ?, '1:18', 'Maker', 'Make', 'Model', ?, 50, 'active')`).run(seller, seller, seller, seller, `Model ${seller}`, seller === "a" ? 10000 : 8000);
  }
  const emails = [], requests = [], sessions = new Map(), refunds = [], reversals = [], refundKeys = new Map();
  const fixture = { db: drizzle(binding), binding, emails, config: { ...config, marketplaceMode: "test", stripeSecretKey: "sk_test_fixture", siteUrl: "https://shop.example", automaticTax: true, stripeTaxBehavior: "exclusive" } };
  globalThis.__consolidatedTest = fixture;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.stripe.com", "Tests never reach live services");
    const body = new URLSearchParams(init.body); requests.push({ path: url.pathname, body, method: init.method });
    if (url.pathname.startsWith("/v1/accounts/")) return Response.json({ charges_enabled: true, payouts_enabled: true });
    if (url.pathname === "/v1/customers") return Response.json({ id: `cus_${requests.length}` });
    if (url.pathname === "/v1/checkout/sessions") {
      const id = `cs_test_${sessions.size + 1}`;
      const metadata = Object.fromEntries([...body].filter(([key]) => /^metadata\[/.test(key)).map(([key, value]) => [key.slice(9, -1), value]));
      const lines = [];
      for (let index = 0; body.has(`line_items[${index}][quantity]`); index++) {
        const key = `line_items[${index}]`, quantity = Number(body.get(`${key}[quantity]`)), unit_amount = Number(body.get(`${key}[price_data][unit_amount]`));
        const amount_tax = Math.round(unit_amount * quantity * (index % 2 ? 0.05 : 0.0825));
        lines.push({ quantity, amount_tax, amount_total: unit_amount * quantity + amount_tax, price: { unit_amount, product: { metadata: { reservation_id: body.get(`${key}[price_data][product_data][metadata][reservation_id]`) } } } });
      }
      const session = { id, status: "open", payment_status: "unpaid", metadata, url: `https://checkout.stripe.com/${id}`, currency: "usd", amount_total: lines.reduce((sum, line) => sum + line.amount_total, 0), total_details: { amount_tax: lines.reduce((sum, line) => sum + line.amount_tax, 0) }, customer_details: { email: "buyer@example.test" }, payment_intent: { id: `pi_${id}`, latest_charge: { id: `ch_${id}`, balance_transaction: { fee: 937 } } } };
      sessions.set(id, { session, lines }); return Response.json(session);
    }
    if (url.pathname.startsWith("/v1/checkout/sessions/")) {
      const value = sessions.get(url.pathname.split("/")[4]); assert.ok(value, url.pathname);
      if (url.pathname.endsWith("/line_items")) return Response.json({ data: value.lines, has_more: false });
      if (url.pathname.endsWith("/expire")) value.session.status = "expired";
      return Response.json(value.session);
    }
    if (url.pathname === "/v1/refunds" && init.method === "POST") {
      const key = init.headers["Idempotency-Key"];
      const previous = refundKeys.get(key);
      if (previous) return previous.body === body.toString() ? Response.json(previous.refund) : Response.json({ error: { message: "Another refund already used this seller balance." } }, { status: 400 });
      const refund = { id: `re_${refunds.length}`, status: "succeeded", amount: Number(body.get("amount")), charge: body.get("charge"), metadata: { order_id: body.get("metadata[order_id]") } };
      refundKeys.set(key, { body: body.toString(), refund });
      refunds.push(refund); return Response.json(refund);
    }
    if (url.pathname === "/v1/refunds") return Response.json({ data: refunds.filter((refund) => refund.charge === url.searchParams.get("charge")), has_more: false });
    if (url.pathname.endsWith("/reversals")) { reversals.push({ body, path: url.pathname }); return Response.json({ id: `reversal_${reversals.length}`, amount: Number(body.get("amount")) }); }
    throw new Error(`Unexpected Stripe request: ${url.pathname}`);
  };
  t.after(async () => { globalThis.fetch = originalFetch; delete globalThis.__consolidatedTest; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const mocks = {
    db: "export const getDb=()=>globalThis.__consolidatedTest.db; export const getD1=()=>globalThis.__consolidatedTest.binding;",
    config: "export const config=globalThis.__consolidatedTest.config; export const requireConfig=key=>config[key];",
    email: "const emails=globalThis.__consolidatedTest.emails; export const sendPaidOrderEmails=async input=>emails.push(input); export const sendEmail=async input=>emails.push(input); export const escapeHtml=s=>String(s);",
  };
  const output = await build({
    stdin: { contents: `export * from './lib/consolidated-checkout.ts'; export * from './lib/inventory.ts'; export * from './lib/combined-shipping.ts'; export * from './lib/orders.ts'; export { createOrderRefund } from './lib/stripe.ts'; export { processEligibleSellerTransfers } from './lib/seller-transfers.ts';`, resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "consolidated-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        const mock = path === "@/db" ? "db" : /\/(config|email)(\.ts)?$/.exec(path)?.[1];
        if (mock) return { path: mock, namespace: "fixture" };
        if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  const destination = { name: "Ada Buyer", street1: "123 Main St", street2: "Unit 4", city: "Los Angeles", state: "CA", zip: "90012", country: "US" };
  const buyer = { id: "buyer", email: "buyer@example.test" }, items = [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }];
  const standard = [{ sellerId: "a", shippingSelection: { rateId: "flat" } }, { sellerId: "b", shippingSelection: { rateId: "flat" } }];
  const start = (selections = standard, selectedItems = items) => api.startConsolidatedCheckout(selectedItems, selections, destination, buyer);
  const rows = (query, ...args) => sqlite.prepare(query).all(...args);
  const paid = async (checkout, id = `evt_paid_${checkout.sessionId}`) => { const { session } = sessions.get(checkout.sessionId); session.status = "complete"; session.payment_status = "paid"; return api.processStripeEvent({ id, type: "checkout.session.completed", data: { object: { id: session.id } } }); };
  let combinedId, checkout, sellerOrders;

  await t.test("quotes require the buyer, seller ownership, exact items and address, and a current price", async () => {
    await assert.rejects(() => api.requestCombinedShipping("buyer", [{ productId: "a", quantity: 1 }], destination), /at least two/);
    await assert.rejects(() => api.requestCombinedShipping("owner-a", [items[0]], destination), /own listings/);
    combinedId = await api.requestCombinedShipping("buyer", [items[0]], destination);
    assert.equal(await api.requestCombinedShipping("buyer", [items[0]], destination), combinedId);
    assert.equal(emails.at(-1).to, "owner-a@example.test");
    assert.equal((await api.listCombinedShippingRequests("owner-b")).length, 0);
    assert.equal((await api.listCombinedShippingRequests("other-buyer")).length, 0);
    await assert.rejects(() => api.respondToCombinedShipping("owner-b", combinedId, { action: "decline" }), /Only this seller/);
    await assert.rejects(() => api.respondToCombinedShipping("other-buyer", combinedId, { action: "cancel" }), /another buyer/);
    await api.respondToCombinedShipping("owner-a", combinedId, { action: "quote", amount: "4.50", carrier: "USPS", service: "Ground", estimatedDays: 4, note: "Packed together" });
    assert.equal(emails.at(-1).to, "buyer@example.test");
    const cart = await api.loadAuthoritativeCart([items[0]]);
    assert.equal((await api.resolveCombinedShippingQuote(cart, combinedId, "buyer", destination)).amountCents, 450);
    await assert.rejects(() => api.resolveCombinedShippingQuote(cart, combinedId, "other-buyer", destination), /does not belong/);
    await assert.rejects(() => api.resolveCombinedShippingQuote(cart, combinedId, "buyer", { ...destination, street2: "Unit 5" }), /address changed/);
    await assert.rejects(() => api.resolveCombinedShippingQuote({ ...cart, items: cart.items.map((item) => ({ ...item, priceCents: item.priceCents + 1 })) }, combinedId, "buyer", destination), /items or delivery/);
    sqlite.prepare("UPDATE combined_shipping_requests SET expires_at = '2000-01-01' WHERE id = ?").run(combinedId);
    await assert.rejects(() => api.resolveCombinedShippingQuote(cart, combinedId, "buyer", destination), /expired/);
    sqlite.prepare("UPDATE combined_shipping_requests SET expires_at = ? WHERE id = ?").run(new Date(Date.now() + 600000).toISOString(), combinedId);
  });
  await t.test("all seller inventory is reserved atomically and failed reservations preserve quotes", async () => {
    const previousGroups = rows("SELECT * FROM checkout_groups").length;
    beforeBatch = () => sqlite.exec("UPDATE products SET reserved_quantity = inventory_quantity WHERE id = 'b'");
    await assert.rejects(start);
    assert.equal(rows("SELECT reserved_quantity FROM products WHERE id = 'a'")[0].reserved_quantity, 0);
    assert.equal(rows("SELECT * FROM checkout_groups").length, previousGroups);
    assert.equal(sessions.size, 0);
    sqlite.exec("UPDATE products SET reserved_quantity = 0 WHERE id = 'b'");
    const changedSelection = [{ sellerId: "a", shippingSelection: { combinedRequestId: combinedId } }, standard[1]];
    beforeBatch = () => sqlite.prepare("UPDATE combined_shipping_requests SET status = 'cancelled' WHERE id = ?").run(combinedId);
    await assert.rejects(() => start(changedSelection));
    assert.equal(rows("SELECT * FROM checkout_groups").length, previousGroups);
    assert.ok(rows("SELECT reserved_quantity FROM products").every((row) => row.reserved_quantity === 0));
    sqlite.prepare("UPDATE combined_shipping_requests SET status = 'quoted' WHERE id = ?").run(combinedId);
    checkout = await start(changedSelection);
    assert.equal(sessions.size, 1, "Only one payment session is created for two sellers");
    assert.equal(rows("SELECT * FROM checkout_reservations WHERE checkout_group_id = ?", checkout.reservationId).length, 2);
    assert.equal(rows("SELECT status FROM combined_shipping_requests WHERE id = ?", combinedId)[0].status, "used");
    await api.releaseReservation(checkout.reservationId);
    await api.releaseReservation(checkout.reservationId);
    assert.ok(rows("SELECT reserved_quantity FROM products").every((row) => row.reserved_quantity === 0));
    assert.equal(rows("SELECT status FROM combined_shipping_requests WHERE id = ?", combinedId)[0].status, "quoted");
    checkout = await start(changedSelection);
  });
  await t.test("one paid checkout creates all orders with exact shipping, taxes, and fees once", async () => {
    const result = await paid(checkout);
    assert.equal(result.orders.length, 2);
    sellerOrders = rows("SELECT * FROM orders WHERE checkout_group_id = ? ORDER BY seller_id", checkout.reservationId);
    assert.deepEqual(sellerOrders.map((order) => order.shipping_cents), [450, 800]);
    assert.equal(sellerOrders.reduce((sum, order) => sum + order.payment_processing_fee_cents, 0), 937);
    const session = sessions.get(checkout.sessionId).session;
    assert.equal(sellerOrders.reduce((sum, order) => sum + order.tax_cents, 0), session.total_details.amount_tax);
    assert.equal(sellerOrders.reduce((sum, order) => sum + order.total_cents, 0), session.amount_total);
    assert.equal(sellerOrders.reduce((sum, order) => sum + order.seller_proceeds_cents + order.platform_fee_cents + order.payment_processing_fee_cents + order.tax_cents, 0), session.amount_total);
    assert.equal(sellerOrders[0].selected_shipping_service, "Ground");
    assert.ok(sellerOrders.every((order) => JSON.parse(order.shipping_address).address.line2 === "Unit 4"));
    assert.deepEqual(rows("SELECT inventory_quantity, reserved_quantity FROM products ORDER BY id").map((row) => [row.inventory_quantity, row.reserved_quantity]), [[48, 0], [49, 0]]);
    assert.equal((await paid(checkout)).duplicate, true);
    assert.equal((await paid(checkout, "evt_paid_replay")).duplicateOrder, true);
    assert.equal(rows("SELECT * FROM orders").length, 2);
    const confirmation = await api.getPublicOrderBySession(checkout.sessionId);
    assert.equal(confirmation.orders.length, 2);
    assert.equal(confirmation.items.length, 2);
    assert.equal(confirmation.totalCents, session.amount_total);
    assert.equal(emails.filter((email) => email.orderNumber).length, 2);
    await assert.rejects(() => api.respondToCombinedShipping("buyer", combinedId, { action: "cancel" }), /cannot be cancelled/);
  });
  await t.test("seller refunds are limited to that order and webhook replays preserve siblings", async () => {
    const [a, b] = sellerOrders;
    await api.createOrderRefund({ orderId: a.id, paymentIntentId: a.stripe_payment_intent_id, chargeId: a.stripe_charge_id, paymentFlow: "separate", totalCents: a.total_cents, refundedAmountCents: 0 });
    assert.equal(refunds[0].amount, a.total_cents, "Full seller refund must not refund the whole shared charge");
    await assert.rejects(() => api.createOrderRefund({ orderId: a.id, paymentIntentId: a.stripe_payment_intent_id, chargeId: a.stripe_charge_id, paymentFlow: "separate", totalCents: a.total_cents, amountCents: a.total_cents + 1 }), /remaining order amount/);
    await assert.rejects(() => api.createOrderRefund({ orderId: a.id, paymentIntentId: a.stripe_payment_intent_id, chargeId: a.stripe_charge_id, paymentFlow: "separate", totalCents: a.total_cents, refundedAmountCents: 0, amountCents: 100, idempotencyKey: "different-refund-entry-point" }), /already used this seller balance/);
    assert.equal(refunds.length, 1, "A racing refund action cannot charge against another seller's balance");
    const event = { id: "evt_refund_a", type: "charge.refunded", data: { object: { id: a.stripe_charge_id, amount_refunded: a.total_cents } } };
    await api.processStripeEvent(event);
    assert.deepEqual(rows("SELECT payment_status, refunded_amount_cents FROM orders ORDER BY seller_id").map((row) => [row.payment_status, row.refunded_amount_cents]), [["refunded", a.total_cents], ["paid", 0]]);
    assert.equal((await api.processStripeEvent(event)).duplicate, true);
    assert.equal((await api.getPublicOrderBySession(checkout.sessionId)).orders.length, 2, "Refunded orders still appear on a returning confirmation");
    sqlite.prepare("UPDATE orders SET stripe_transfer_id = 'tr_b', seller_transfer_status = 'transferred', seller_transfer_amount_cents = seller_proceeds_cents WHERE id = ?").run(b.id);
    refunds.push({ id: "re_external", status: "succeeded", amount: b.total_cents, charge: b.stripe_charge_id, metadata: {} });
    await api.processStripeEvent({ ...event, id: "evt_external_refund" });
    assert.equal(rows("SELECT refunded_amount_cents FROM orders WHERE id = ?", b.id)[0].refunded_amount_cents, b.total_cents);
    assert.equal(reversals.length, 1);
    assert.equal(reversals[0].path, "/v1/transfers/tr_b/reversals");
    await api.processStripeEvent({ ...event, id: "evt_refund_new_delivery" });
    assert.equal(reversals.length, 1, "A fresh webhook for the same refunds does not reverse twice");
  });
  await t.test("late processing fees are split once and a shared dispute holds every seller payout", async () => {
    const later = await start();
    sessions.get(later.sessionId).session.payment_intent.latest_charge.balance_transaction = null;
    await paid(later);
    const chargeId = sessions.get(later.sessionId).session.payment_intent.latest_charge.id;
    sqlite.prepare("UPDATE orders SET fulfillment_status = 'delivered', payout_eligible_at = '2000-01-01' WHERE checkout_group_id = ?").run(later.reservationId);
    sessions.get(later.sessionId).session.payment_intent.latest_charge.balance_transaction = { fee: 943 };
    await api.processStripeEvent({ id: "evt_dispute", type: "charge.dispute.created", data: { object: { id: "dp_shared", charge: chargeId, status: "needs_response", amount: 1000, currency: "usd" } } });
    const transfers = [];
    const gateway = { retrieveSession: async (id) => sessions.get(id).session, create: async (input) => { transfers.push(input); return { id: `tr_later_${transfers.length}`, amount: input.amountCents }; }, reverse: async () => { throw new Error("Unexpected reversal"); } };
    const held = await api.processEligibleSellerTransfers({ database: binding, gateway, now: new Date() });
    assert.equal(held.transferred, 0);
    assert.equal(rows("SELECT SUM(payment_processing_fee_cents) AS fee FROM orders WHERE checkout_group_id = ?", later.reservationId)[0].fee, 943);
    await api.processStripeEvent({ id: "evt_dispute_won", type: "charge.dispute.closed", data: { object: { id: "dp_shared", charge: chargeId, status: "won", amount: 1000, currency: "usd" } } });
    const released = await api.processEligibleSellerTransfers({ database: binding, gateway, now: new Date() });
    assert.equal(released.transferred, 2);
    assert.equal(new Set(transfers.map((transfer) => transfer.sellerStripeAccountId)).size, 2);
  });
  await t.test("guest checkout works and incomplete or mixed-currency selections cannot reserve inventory", async () => {
    const count = sessions.size;
    await assert.rejects(() => start([standard[0]]), /every selected seller/);
    await assert.rejects(() => start([standard[0], standard[0]]), /Invalid seller/);
    sqlite.exec("UPDATE products SET currency = 'cad' WHERE id = 'b'");
    await assert.rejects(start, /same currency/);
    sqlite.exec("UPDATE products SET currency = 'usd' WHERE id = 'b'");
    assert.equal(sessions.size, count);
    const guest = await api.startConsolidatedCheckout(items, standard, destination, null);
    await paid(guest);
    assert.ok(rows("SELECT buyer_user_id FROM orders WHERE checkout_group_id = ?", guest.reservationId).every((row) => row.buyer_user_id === null));
  });
  await t.test("a cancellation racing with a paid webhook cannot partially finalize seller orders", async () => {
    const racing = await start();
    const previousInventory = rows("SELECT inventory_quantity FROM products ORDER BY id").map((row) => row.inventory_quantity);
    const [child] = rows("SELECT id FROM checkout_reservations WHERE checkout_group_id = ? ORDER BY id DESC LIMIT 1", racing.reservationId);
    beforeBatch = () => sqlite.prepare("UPDATE checkout_reservations SET status = 'released' WHERE id = ?").run(child.id);
    await assert.rejects(() => paid(racing), /NOT NULL/);
    assert.equal(rows("SELECT * FROM orders WHERE checkout_group_id = ?", racing.reservationId).length, 0);
    assert.deepEqual(rows("SELECT inventory_quantity FROM products ORDER BY id").map((row) => row.inventory_quantity), previousInventory);
    assert.equal(rows("SELECT * FROM stripe_events WHERE id = ?", `evt_paid_${racing.sessionId}`).length, 0, "Failed reconciliation remains retryable");
    sqlite.prepare("UPDATE checkout_reservations SET status = 'pending' WHERE id = ?").run(child.id);
    await paid(racing);
    assert.equal(rows("SELECT * FROM orders WHERE checkout_group_id = ?", racing.reservationId).length, 2);
  });
  await t.test("deleting a buyer account preserves paid order and shipping snapshots", async () => {
    const orderCount = rows("SELECT * FROM orders").length;
    sqlite.exec("DELETE FROM user WHERE id = 'buyer'");
    assert.equal(rows("SELECT * FROM combined_shipping_requests").length, 0);
    assert.equal(rows("SELECT * FROM orders").length, orderCount);
    assert.equal(rows("SELECT shipping_cents FROM orders WHERE id = ?", sellerOrders[0].id)[0].shipping_cents, 450);
    assert.equal(rows("PRAGMA foreign_key_check").length, 0);
  });
});
