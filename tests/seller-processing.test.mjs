import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripeSettlementDetails } from "../lib/stripe.ts";
import { processEligibleSellerTransfers } from "../lib/seller-transfers.ts";
import { buildTaxYearReports } from "../lib/tax-admin.ts";
import { sellerProcessingDeduction } from "../lib/seller-proceeds.ts";

function session(id, fee = 697, payer = "seller") {
  return {
    id: `cs_${id}`, url: null, payment_status: "paid", status: "complete", currency: "usd",
    amount_total: 23000, total_details: { amount_tax: 2000 },
    customer_details: { email: "buyer@example.test" },
    metadata: { reservation_id: id, payment_flow: "separate", ...(payer ? { processing_fee_payer: payer } : {}) },
    payment_intent: { id: `pi_${id}`, latest_charge: {
      id: `ch_${id}`, balance_transaction: fee == null ? null : { id: `txn_${id}`, fee, net: 23000 - fee },
    } },
  };
}

test("seller settlement deducts the actual fee, preserves zero and unknown, and caps recovery", () => {
  assert.deepEqual(stripeSettlementDetails(session("new"), 1400), {
    processingFeePayer: "seller", paymentProcessingFeeCents: 697, sellerProceedsCents: 18903,
  });
  assert.equal(stripeSettlementDetails(session("unknown", null), 1400).sellerProceedsCents, null);
  assert.equal(stripeSettlementDetails(session("zero", 0), 1400).sellerProceedsCents, 19600);
  assert.equal(stripeSettlementDetails(session("legacy", 697, null), 1400).sellerProceedsCents, 19600);
  assert.equal(stripeSettlementDetails(session("legacy-pending", null, null), 1400).sellerProceedsCents, 19600);
  assert.equal(stripeSettlementDetails(session("excess", 22000), 1400).sellerProceedsCents, 0);
  assert.equal(sellerProcessingDeduction({ processingFeePayer: "seller", paymentProcessingFeeCents: 22000, totalCents: 23000, taxCents: 2000, platformFeeCents: 1400 }), 19600);
});

test("paid-order persistence and delayed fee reconciliation use actual fees without repeat deductions", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".seller-fee-test-"));
  const bundlePath = join(scratch, "orders.mjs");
  const sqlite = new DatabaseSync(":memory:");
  const binding = {
    prepare(query) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  globalThis.__mccSellerFeeTest = { db: drizzle(binding), binding };
  t.after(async () => {
    delete globalThis.__mccSellerFeeTest;
    sqlite.close();
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch);
  });
  for (const name of (await readdir(join(root, "drizzle"))).filter(name => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  }
  const source = await readFile(join(root, "lib/orders.ts"), "utf8");
  const built = await build({
    absWorkingDir: root, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    stdin: { contents: source + "\nexport { finalizePaidCheckout };", resolveDir: join(root, "lib"), sourcefile: "orders.ts", loader: "ts" },
    plugins: [{ name: "order-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(@\/db|\.\/email|\.\/inventory|\.\/preorder-payments)$/ }, ({ path }) => ({ path, namespace: "order-test" }));
      builder.onLoad({ filter: /.*/, namespace: "order-test" }, ({ path }) => ({ contents:
        path === "@/db" ? "export const getDb = () => globalThis.__mccSellerFeeTest.db; export const getD1 = () => globalThis.__mccSellerFeeTest.binding;" :
        path === "./preorder-payments" ? "export const preorderForCheckout = async () => null; export const syncPreorderRefund = async () => {}; export const finalizePreorderPayment = () => { throw Error('Unexpected preorder'); };" :
        path === "./email" ? "export const sendPaidOrderEmails = async () => {};" : "export const releaseReservation = () => { throw Error('Unexpected release'); };",
      }));
    } }],
  });
  await writeFile(bundlePath, built.outputFiles[0].contents);
  const { finalizePaidCheckout } = await import(pathToFileURL(bundlePath).href);
  sqlite.exec("INSERT INTO sellers (id, slug, store_name, contact_name, contact_email, status, stripe_account_id) VALUES ('seller', 'seller', 'Seller', 'Seller', 'seller@example.test', 'active', 'acct_seller')");
  sqlite.exec("INSERT INTO catalog_products (id, model_car_manufacturer, manufacturer_key, scale, vehicle_make, vehicle_model, title) VALUES ('catalog-fixture', 'Maker', 'maker', '1:18', 'Make', 'Model', 'Model')");
  sqlite.exec("INSERT INTO products (catalog_product_id, id, seller_id, slug, seller_sku, title, scale, model_manufacturer, vehicle_make, vehicle_model, price_cents, inventory_quantity, reserved_quantity) VALUES ('catalog-fixture', 'product', 'seller', 'product', 'sku', 'Model', '1:18', 'Maker', 'Make', 'Model', 20000, 5, 5)");
  for (const [id, fee, payer] of [["new",697,"seller"], ["pending",null,"seller"], ["zero",0,"seller"], ["legacy",697,null], ["early-refund",null,"seller"]]) {
    sqlite.prepare("INSERT INTO checkout_reservations (id, seller_id, subtotal_cents, shipping_cents, platform_fee_cents, marketplace_fee_bps, currency, expires_at) VALUES (?, 'seller', 20000, 1000, 1400, 700, 'usd', '2026-09-16')").run(id);
    sqlite.prepare("INSERT INTO checkout_reservation_items (id, reservation_id, product_id, product_title_snapshot, seller_sku_snapshot, scale_snapshot, manufacturer_snapshot, unit_price_cents, quantity) VALUES (?, ?, 'product', 'Model', 'sku', '1:18', 'Maker', 20000, 1)").run(id,id);
    const event = { id: `evt_${id}`, type: "checkout.session.completed", data: { object: {} } };
    const paidSession = session(id,fee,payer);
    const delivery = { name: "Delivery Recipient", street1: "123 Main St", street2: "Unit 4", city: "Los Angeles", state: "CA", zip: "90012", country: "US" };
    if (id === "new") {
      sqlite.prepare("UPDATE checkout_reservations SET quoted_shipping_address = ? WHERE id = ?").run(JSON.stringify(delivery), id);
      paidSession.metadata.delivery_address_source = "cart";
      paidSession.customer_details.name = "Billing Cardholder";
      paidSession.customer_details.address = { line1: "999 Billing Ave", state: "NY", postal_code: "10001", country: "US" };
    }
    await finalizePaidCheckout(event, paidSession);
    const order = sqlite.prepare("SELECT * FROM orders WHERE stripe_checkout_session_id = ?").get(`cs_${id}`);
    assert.equal(order.processing_fee_payer, payer ?? "platform");
    assert.equal(order.payment_processing_fee_cents, fee);
    assert.equal(order.seller_proceeds_cents, fee == null ? null : payer && fee ? 18903 : 19600);
    assert.equal(order.tax_cents, 2000);
    assert.equal(order.total_cents, 23000);
    assert.equal(order.marketplace_fee_bps, 700);
    assert.equal(order.platform_fee_cents, 1400);
    if (id === "new") {
      const shipping = JSON.parse(order.shipping_address);
      assert.equal(shipping.name, delivery.name);
      assert.equal(shipping.address.line1, delivery.street1);
      assert.equal(shipping.address.line2, delivery.street2);
      assert.equal(shipping.address.postal_code, delivery.zip, "Billing details must never replace the quoted delivery destination");
    }
  }
  assert.equal(sqlite.prepare("SELECT inventory_quantity FROM products").get().inventory_quantity, 0);
  sqlite.exec("UPDATE orders SET fulfillment_status = 'delivered', payout_eligible_at = '2026-09-15T00:00:00.000Z' WHERE stripe_checkout_session_id = 'cs_pending'");
  const created = [], reversed = [];
  let retrieved = session("pending", null);
  const gateway = {
    async retrieveSession(id) { return id === "cs_early-refund" ? session("early-refund", null) : retrieved; },
    async create(input) { created.push(input); return { id: "tr_pending", amount: input.amountCents, amount_reversed: 0 }; },
    async reverse(input) { reversed.push(input); return { id: "trr_pending", amount: input.amountCents }; },
  };
  const release = () => processEligibleSellerTransfers({ database: binding, now: new Date("2026-09-16T00:00:00Z"), gateway });
  assert.equal((await release()).transferred, 0, "unknown fee must hold the payout");
  retrieved = { ...session("pending"), amount_total: 99999 };
  assert.equal((await release()).transferred, 0, "mismatched settlement must hold the payout");
  retrieved = session("pending");
  assert.equal((await release()).transferred, 1);
  assert.equal(created[0].amountCents, 18903);
  assert.equal((await release()).transferred, 0, "retries must not pay twice");
  assert.equal(created.length, 1);
  sqlite.exec("UPDATE orders SET payment_status = 'partially_refunded', refunded_amount_cents = 11500 WHERE stripe_checkout_session_id = 'cs_pending'");
  await release();
  assert.equal(reversed[0].amountCents, 9451, "half refund reverses half the net seller proceeds, rounded in cents");
  sqlite.exec("UPDATE orders SET payment_status = 'refunded', refunded_amount_cents = 23000 WHERE stripe_checkout_session_id = 'cs_pending'");
  await release();
  assert.equal(reversed.reduce((sum, reversal) => sum + reversal.amountCents, 0), 18903);
  sqlite.exec("UPDATE orders SET payment_status = 'refunded', refunded_amount_cents = 23000, seller_transfer_status = 'cancelled' WHERE stripe_checkout_session_id = 'cs_early-refund'");
  gateway.retrieveSession = async () => session("early-refund");
  await release();
  const earlyRefund = sqlite.prepare("SELECT payment_processing_fee_cents, seller_transfer_status FROM orders WHERE stripe_checkout_session_id = 'cs_early-refund'").get();
  assert.equal(earlyRefund.payment_processing_fee_cents, 697, "fees must still reconcile when a refund precedes settlement");
  assert.equal(earlyRefund.seller_transfer_status, "cancelled");
  assert.equal(created.length, 1);
});

test("tax reporting distinguishes platform cost from seller processing recovery, including refunds", () => {
  const order = { id: "order", orderNumber: "MCC-FEE", isTestOrder: false, currency: "usd", subtotalCents: 20000,
    shippingCents: 1000, taxCents: 2000, totalCents: 23000, refundedAmountCents: 0, platformFeeCents: 1400,
    processingFeePayer: "seller", paymentProcessingFeeCents: 697, sellerProceedsCents: 18903,
    sellerTransferAmountCents: 0, sellerTransferReversedCents: 0, paymentStatus: "paid",
    shippingAddress: '{"address":{"state":"CA"}}', paidAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" };
  const totals = overrides => buildTaxYearReports([{ ...order, ...overrides }])[0].totals;
  assert.equal(totals({}).processingFeesRecoveredCents, 697);
  assert.equal(totals({}).stripeFeesCents, 697);
  assert.equal(totals({ processingFeePayer: "platform" }).processingFeesRecoveredCents, 0);
  assert.equal(totals({ paymentProcessingFeeCents: null }).processingFeesRecoveredCents, 0);
  assert.equal(totals({ paymentStatus: "refunded", refundedAmountCents: 23000 }).processingFeesRecoveredCents, 0);
  assert.equal(totals({ paymentStatus: "partially_refunded", refundedAmountCents: 11500 }).processingFeesRecoveredCents, 349);
});

test("seller disclosures render the applicable rate and accurate actual, pending, and legacy deductions", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".seller-fee-test-"));
  const bundlePath = join(scratch, "views.mjs");
  t.after(async () => { await unlink(bundlePath).catch(() => {}); await rmdir(scratch); });
  const built = await build({
    absWorkingDir: root, bundle: true, jsx: "automatic", platform: "node", format: "esm", packages: "external", write: false,
    stdin: { contents: 'export { SellerFeeDisclosure } from "./components/seller-fee-disclosure"; export { SellerOrderAmounts } from "./components/seller-order-amounts";', resolveDir: root, loader: "tsx" },
    plugins: [{ name: "link", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, ({ path }) => ({ path, namespace: "link" }));
      builder.onLoad({ filter: /.*/, namespace: "link" }, () => ({ resolveDir: root, contents: 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }' }));
    } }],
  });
  await writeFile(bundlePath, built.outputFiles[0].contents);
  const { SellerFeeDisclosure, SellerOrderAmounts } = await import(pathToFileURL(bundlePath).href);
  for (const [marketplaceFeeBps, proceeds] of [[850,"186.03"],[700,"189.03"],[500,"193.03"]]) {
    const html = renderToStaticMarkup(createElement(SellerFeeDisclosure, { marketplaceFeeBps }));
    assert.ok(html.includes(`${marketplaceFeeBps / 100}%`));
    assert.ok(html.includes(`$${proceeds}`));
    assert.match(html, /including shipping and tax/);
    assert.match(html, /Example only/);
  }
  const order = { ...stripeSettlementDetails(session("new"),1400), totalCents: 23000, taxCents: 2000, subtotalCents: 20000,
    shippingCents: 1000, platformFeeCents: 1400, marketplaceFeeBps: 700, currency: "usd", refundedAmountCents: 0, paymentStatus: "paid" };
  const view = overrides => renderToStaticMarkup(createElement(SellerOrderAmounts, { order: { ...order, ...overrides } }));
  assert.match(view({}), /−\$6\.97/);
  assert.match(view({}), /\$189\.03/);
  assert.match(view({ paymentProcessingFeeCents: null, sellerProceedsCents: null }), /Awaiting actual Stripe fee/);
  assert.doesNotMatch(view({ paymentProcessingFeeCents: null, sellerProceedsCents: null }), /NaN|−\$0\.00<\/dd><\/div><div><dt>Your proceeds/);
  assert.match(view({ processingFeePayer: "platform", sellerProceedsCents: 19600 }), /\$0\.00 deducted from you/);
  assert.match(view({ paymentStatus: "partially_refunded", refundedAmountCents: 11500 }), /\$94\.52/);
  assert.match(view({ totalCents: 100, sellerProceedsCents: 50, paymentStatus: "partially_refunded", refundedAmountCents: 55 }), /\$0\.23/);
});
