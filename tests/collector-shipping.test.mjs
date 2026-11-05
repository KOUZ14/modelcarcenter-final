import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { securityDatabase } from "./fixtures/security-database.mjs";
import { processEligibleSellerTransfers } from "../lib/seller-transfers.ts";
import { sellerLabelBudget, sellerProceedsAfterRefund } from "../lib/seller-proceeds.ts";
import { sellerTransferReversalTarget } from "../lib/stripe.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
async function bundle(t, entry, mocks) {
  const scratch = await mkdtemp(join(root, ".sites-runtime/collector-shipping-"));
  const file = join(scratch, "fixture.mjs");
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "collector-shipping", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
    } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  return import(pathToFileURL(file).href);
}

test("collector labels require an owned paid order, purchase once, persist in My Sales, and reprint without buying", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const quoted = [], purchases = [], retrieved = [], emails = [], feeLookups = [];
  const paymentSessions = new Map();
  const rate = { id: "rate-usps", provider: "USPS", serviceLevel: "Priority Mail", serviceToken: "usps_priority", amountCents: 950, currency: "USD", estimatedDays: 3 };
  const transaction = { object_id: "transaction-one", status: "SUCCESS", tracking_number: "9400012345", tracking_url_provider: "https://carrier.example.test/track", label_url: "https://labels.example.test/label.pdf" };
  let purchaseFailure = false;
  globalThis.__collectorShipping = {
    db: drizzle(binding), binding,
    quote: async input => { quoted.push(input); return { shippoShipmentId: `shipment-quote-${quoted.length}`, rates: [rate] }; },
    purchase: async (...args) => { purchases.push(args); if (purchaseFailure) throw Error("Response lost"); return purchases.length === 1 ? transaction : { ...transaction, object_id: `transaction-${purchases.length}`, tracking_number: `94000${purchases.length}` }; },
    retrieve: async id => { retrieved.push(id); return transaction; },
    email: async input => { emails.push(input); },
    retrieveSession: async id => {
      feeLookups.push(id);
      const session = paymentSessions.get(id);
      if (!session) throw Error("Unexpected payment lookup");
      return session;
    },
  };
  t.after(() => { delete globalThis.__collectorShipping; });
  const { quoteOwnedOrders, purchaseOwnedLabel, getOwnedLabelUrl, getGarageData } = await bundle(t,
    "export {quoteOwnedOrders,purchaseOwnedLabel,getOwnedLabelUrl} from './lib/shipping.ts'; export {getGarageData} from './lib/collector-store.ts';", {
      "@/db": "export const getDb=()=>globalThis.__collectorShipping.db; export const getD1=()=>globalThis.__collectorShipping.binding;",
      "./shippo": "const f=globalThis.__collectorShipping; export const createShippoShipment=f.quote,purchaseShippoLabel=f.purchase,retrieveShippoTransaction=f.retrieve; export const retrieveShippoTracking=()=>{throw Error('Unexpected tracking call')}; export class ShippoApiError extends Error {}",
      "./email": "export const sendLabelCreatedEmail=globalThis.__collectorShipping.email; export const sendShipmentEmail=()=>{throw Error('Label is not dispatch')}; export const sendEmail=()=>{throw Error('Unexpected email')}; export const escapeHtml=value=>value;",
      "./stripe.ts": "export * from './lib/stripe.ts'; export const retrieveCheckoutSession=(...args)=>globalThis.__collectorShipping.retrieveSession(...args);",
    });
  for (const id of ["collector", "other", "buyer"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  for (const id of ["collector", "other"]) sqlite.prepare("INSERT INTO sellers (id,slug,store_name,contact_name,contact_email,status,seller_type,owner_user_id) VALUES (?,?,?,?,?,'active','collector',?)").run(id, id, id, id, `${id}@example.test`, id);
  const address = JSON.stringify({ name: "Buyer", address: { line1: "123 Main St", city: "Los Angeles", state: "CA", postal_code: "90012", country: "US" } });
  const origin = JSON.stringify({ street1: "456 Oak St", city: "San Francisco", region: "CA", postalCode: "94103", country: "US", phone: "4155550100" });
  for (const [id, seller, payment, fulfillment] of [["sale", "collector", "paid", "unfulfilled"], ["private", "other", "paid", "unfulfilled"], ["unpaid", "collector", "pending", "unfulfilled"], ["cancelled", "collector", "paid", "cancelled"]]) {
    sqlite.prepare("INSERT INTO orders (id,order_number,seller_id,stripe_checkout_session_id,buyer_user_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status,fulfillment_status,shipping_mode,selected_shipping_carrier,selected_shipping_service_token,selected_shipping_estimated_days,shipping_address,ship_from_address) VALUES (?,?,?,?,'buyer','buyer@example.test','usd',25000,950,2500,25950,?,?,'calculated','USPS','usps_priority',3,?,?)").run(id, id, seller, `checkout-${id}`, payment, fulfillment, address, origin);
  }
  sqlite.exec("UPDATE orders SET payment_flow='separate',seller_transfer_status='pending',seller_proceeds_cents=23000");
  sqlite.exec("UPDATE orders SET seller_proceeds_cents=NULL,processing_fee_payer='seller' WHERE id IN ('private','unpaid','cancelled')");
  const parcel = { length: "12", width: "8", height: "6", weight: "2" };
  for (const [id, message] of [["private", /do not belong/], ["unpaid", /Only paid/], ["cancelled", /already in fulfillment/]]) {
    await assert.rejects(quoteOwnedOrders("collector", { orderIds: [id], ...parcel }), message);
  }
  assert.equal(quoted.length, 0, "Rejected orders never request rates");
  assert.equal(feeLookups.length, 0, "Rejected orders never request Stripe fee details");
  const { quote } = await quoteOwnedOrders("collector", { orderIds: ["sale"], ...parcel });
  const secondQuote = (await quoteOwnedOrders("collector", { orderIds: ["sale"], ...parcel })).quote;
  assert.equal(purchases.length, 0, "Quoting does not buy a label");
  assert.equal(quoted[0].to.name, "Buyer");
  assert.deepEqual(quoted[0].parcel, parcel);
  const payload = { quoteId: quote.id, rateId: rate.id };
  await assert.rejects(purchaseOwnedLabel("other", payload), /quote not found/);
  await assert.rejects(purchaseOwnedLabel("collector", { ...payload, rateId: "foreign-rate" }), /does not belong/);
  const results = await Promise.allSettled([purchaseOwnedLabel("collector", payload), purchaseOwnedLabel("collector", payload), purchaseOwnedLabel("collector", { ...payload, quoteId: secondQuote.id })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(purchases.length, 1, "Concurrent requests for one quote cause one carrier charge");
  const shipment = results.find(result => result.status === "fulfilled").value.shipment;
  assert.equal(sqlite.prepare("SELECT fulfillment_status FROM orders WHERE id='sale'").get().fulfillment_status, "processing");
  assert.equal(emails.length, 1);
  const data = await getGarageData("collector");
  const sale = data.sales.find(order => order.id === "sale");
  assert.equal(sale.shipment.id, shipment.id);
  assert.equal(sale.shipment.events[0].status, "LABEL_CREATED");
  assert.equal(sale.shipment.trackingNumber, transaction.tracking_number);
  assert.equal(sale.shippingLabelCostCents, 950);
  assert.equal(data.sales.some(order => order.id === "private" || order.id === "unpaid"), false);
  assert.deepEqual(Object.keys(data.shipping).sort(), ["configured", "insuranceThresholdCents", "signatureThresholdCents"]);
  assert.equal((await getGarageData("other")).sales[0].shipment, null);
  await assert.rejects(getOwnedLabelUrl("other", shipment.id), /Shipment not found/);
  await assert.rejects(getOwnedLabelUrl("buyer", shipment.id), /Shipment not found/);
  assert.equal(retrieved.length, 0);
  for (let i = 0; i < 2; i++) assert.equal(await getOwnedLabelUrl("collector", shipment.id), transaction.label_url);
  assert.deepEqual(retrieved, [transaction.object_id, transaction.object_id]);
  assert.equal(purchases.length, 1, "Printing twice does not buy another label");
  assert.equal(sqlite.prepare("SELECT shipping_label_cost_cents FROM orders WHERE id='sale'").get().shipping_label_cost_cents, 950, "Reprinting never deducts postage again");
  await assert.rejects(purchaseOwnedLabel("collector", payload), /already being purchased/);

  // Verify the real payout/reversal code consumes the purchase ledger.
  sqlite.exec("UPDATE sellers SET stripe_account_id='acct_fixture' WHERE id='collector'; UPDATE orders SET fulfillment_status='delivered',payout_eligible_at='2020-01-01',stripe_charge_id='ch_fixture',stripe_transfer_group='group_fixture' WHERE id='sale'");
  const transfers = [], reversals = [];
  const gateway = { create: async input => { transfers.push(input); return { id: 'tr_fixture' }; }, reverse: async input => { reversals.push(input); return { id: 'reversal_fixture' }; } };
  await processEligibleSellerTransfers({ database: binding, gateway });
  assert.equal(transfers[0].amountCents, 22050, "Postage is withheld from the actual payout");
  await processEligibleSellerTransfers({ database: binding, gateway });
  assert.equal(transfers.length, 1, "A repeated payout job never pays or deducts again");
  sqlite.exec("UPDATE orders SET refunded_amount_cents=12975,payment_status='partially_refunded' WHERE id='sale'");
  await processEligibleSellerTransfers({ database: binding, gateway });
  assert.equal(reversals[0].amountCents, 11500, "Refunding the buyer does not refund the carrier postage");
  await processEligibleSellerTransfers({ database: binding, gateway });
  assert.equal(reversals.length, 1);

  const clone = id => sqlite.prepare("INSERT INTO orders (id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status,fulfillment_status,shipping_mode,shipping_address,ship_from_address,payment_flow,seller_transfer_status,seller_proceeds_cents) SELECT ?,?,'collector',? ,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,'paid','unfulfilled','flat',shipping_address,ship_from_address,'separate','pending',23000 FROM orders WHERE id='sale'").run(id,id,`checkout-${id}`);
  clone("legacy"); sqlite.exec("UPDATE orders SET payment_flow='destination' WHERE id='legacy'");
  await assert.rejects(quoteOwnedOrders("collector", { orderIds: ["legacy"], ...parcel }), /held seller proceeds/);
  const pendingFee = (id, fee = null) => {
    sqlite.prepare("UPDATE orders SET seller_proceeds_cents=NULL,payment_processing_fee_cents=NULL,processing_fee_payer='seller',stripe_charge_id=?,stripe_transfer_group=? WHERE id=?").run(`ch_${id}`, `group_${id}`, id);
    paymentSessions.set(`checkout-${id}`, {
      id: `checkout-${id}`, payment_status: "paid", currency: "usd", amount_total: 25950,
      total_details: { amount_tax: 0 }, metadata: { processing_fee_payer: "seller" },
      payment_intent: { id: `pi_${id}`, latest_charge: { id: `ch_${id}`,
        balance_transaction: fee == null ? null : { id: `txn_${id}`, fee, net: 25950 - fee } } },
    });
  };
  clone("settling"); pendingFee("settling");
  clone("unrelated-pending"); pendingFee("unrelated-pending", 500);
  const settlingQuote = (await quoteOwnedOrders("collector", { orderIds: ["settling"], ...parcel })).quote;
  await purchaseOwnedLabel("collector", { quoteId: settlingQuote.id, rateId: rate.id });
  assert.deepEqual(feeLookups, ["checkout-settling", "checkout-settling"], "Only selected owned orders refresh fees");
  const unsettled = sqlite.prepare("SELECT seller_proceeds_cents,payment_processing_fee_cents,shipping_label_cost_cents,fulfillment_status FROM orders WHERE id='settling'").get();
  assert.equal(unsettled.seller_proceeds_cents, null, "Label funding never invents final proceeds");
  assert.equal(unsettled.payment_processing_fee_cents, null, "No estimated Stripe fee is recorded");
  assert.equal(unsettled.shipping_label_cost_cents, 950);
  assert.equal(unsettled.fulfillment_status, "processing");
  assert.equal(sqlite.prepare("SELECT seller_proceeds_cents FROM orders WHERE id='unrelated-pending'").get().seller_proceeds_cents, null);
  clone("fee-ready"); pendingFee("fee-ready", 500);
  await quoteOwnedOrders("collector", { orderIds: ["fee-ready"], ...parcel });
  const ready = sqlite.prepare("SELECT seller_proceeds_cents,payment_processing_fee_cents,stripe_transfer_id FROM orders WHERE id='fee-ready'").get();
  assert.equal(ready.payment_processing_fee_cents, 500);
  assert.equal(ready.seller_proceeds_cents, 22950, "Rates refresh the actual fee without waiting for a scheduled job");
  assert.equal(ready.stripe_transfer_id, null, "Requesting rates must not release a payout");
  clone("fee-changed"); pendingFee("fee-changed");
  const changedQuote = (await quoteOwnedOrders("collector", { orderIds: ["fee-changed"], ...parcel })).quote;
  pendingFee("fee-changed", 23000);
  const beforeChangedPurchase = purchases.length;
  await assert.rejects(purchaseOwnedLabel("collector", { quoteId: changedQuote.id, rateId: rate.id }), /cannot cover/);
  assert.equal(purchases.length, beforeChangedPurchase, "Purchase rechecks fees and never overspends a now-known balance");
  sqlite.exec("UPDATE orders SET fulfillment_status='delivered',payout_eligible_at='2020-01-01' WHERE id='settling'");
  const delayedTransfers = [];
  const delayedGateway = { ...gateway, retrieveSession: async id => paymentSessions.get(id), create: async input => { delayedTransfers.push(input); return { id: 'tr_settling' }; } };
  await processEligibleSellerTransfers({ database: binding, gateway: delayedGateway });
  assert.equal(delayedTransfers.length, 0, "Even after shipping and delivery, unknown actual fees hold the payout");
  pendingFee("settling", 700);
  await processEligibleSellerTransfers({ database: binding, gateway: delayedGateway });
  assert.equal(delayedTransfers.length, 1);
  assert.equal(delayedTransfers[0].amountCents, 21800, "Final payout deducts both the actual fee and the already purchased label");
  await processEligibleSellerTransfers({ database: binding, gateway: delayedGateway });
  assert.equal(delayedTransfers.length, 1, "Delayed fee reconciliation cannot double deduct or double pay");
  clone("low-funds"); sqlite.exec("UPDATE orders SET seller_proceeds_cents=100 WHERE id='low-funds'");
  await assert.rejects(quoteOwnedOrders("collector", { orderIds: ["low-funds"], ...parcel }), /No label fits/);
  clone("combined-a"); clone("combined-b");
  sqlite.exec("UPDATE orders SET seller_proceeds_cents=1000 WHERE id='combined-a'; UPDATE orders SET seller_proceeds_cents=3000 WHERE id='combined-b'");
  const combined = (await quoteOwnedOrders("collector", { orderIds: ["combined-b", "combined-a"], ...parcel })).quote;
  await purchaseOwnedLabel("collector", { quoteId: combined.id, rateId: rate.id });
  const combinedCosts = sqlite.prepare("SELECT shipping_label_cost_cents AS cost FROM orders WHERE id IN ('combined-a','combined-b') ORDER BY id").all();
  assert.deepEqual(combinedCosts.map(row => row.cost), [238, 712]);
  assert.equal(combinedCosts.reduce((sum, row) => sum + row.cost, 0), 950, "Combining two orders charges one label total");

  clone("uncertain");
  const uncertain = (await quoteOwnedOrders("collector", { orderIds: ["uncertain"], ...parcel })).quote;
  const retry = (await quoteOwnedOrders("collector", { orderIds: ["uncertain"], ...parcel })).quote;
  purchaseFailure = true;
  await assert.rejects(purchaseOwnedLabel("collector", { quoteId: uncertain.id, rateId: rate.id }), /did not confirm/);
  const attempted = purchases.length;
  await assert.rejects(purchaseOwnedLabel("collector", { quoteId: retry.id, rateId: rate.id }), /already being purchased/);
  await assert.rejects(quoteOwnedOrders("collector", { orderIds: ["uncertain"], ...parcel }), /purchase already exists/);
  assert.equal(purchases.length, attempted, "An uncertain carrier response must not trigger another charge");
  assert.equal(sqlite.prepare("SELECT shipping_label_cost_cents FROM orders WHERE id='uncertain'").get().shipping_label_cost_cents, 0, "No seller deduction until a label is confirmed and saved");
  sqlite.prepare("UPDATE shipping_quotes SET expires_at='2020-01-01' WHERE id=?").run(uncertain.id);
  await assert.rejects(purchaseOwnedLabel("collector", { quoteId: uncertain.id, rateId: rate.id }), /already being purchased/);
  assert.equal(sqlite.prepare("SELECT status FROM shipping_quotes WHERE id=?").get(uncertain.id).status, "purchasing", "Quote expiry cannot clear an uncertain purchase lock");
});

test("pending-fee label budgets exclude protected money, refunds and prior postage without inventing fees", () => {
  const order = { processingFeePayer: "seller", totalCents: 10000, taxCents: 800, platformFeeCents: 700,
    paymentProcessingFeeCents: null, sellerProceedsCents: null, refundedAmountCents: 0, shippingLabelCostCents: 0 };
  assert.equal(sellerLabelBudget(order), 8500);
  assert.equal(sellerLabelBudget({ ...order, paymentProcessingFeeCents: 320 }), 8180);
  assert.equal(sellerLabelBudget({ ...order, refundedAmountCents: 5000, shippingLabelCostCents: 1000 }), 2500);
  assert.equal(sellerLabelBudget({ ...order, refundedAmountCents: 10000 }), 0);
  assert.equal(sellerLabelBudget({ ...order, sellerProceedsCents: 0 }), 0, "A known zero balance must not use provisional funds");
  assert.equal(sellerLabelBudget({ ...order, sellerProceedsCents: 8180, refundedAmountCents: 5000, shippingLabelCostCents: 1000 }), 3090);
});

test("label costs are deducted after refund allocation and never produce a negative payout", () => {
  const order = { totalCents: 10000, sellerProceedsCents: 9000, shippingLabelCostCents: 1000 };
  assert.equal(sellerProceedsAfterRefund({ ...order, refundedAmountCents: 0 }), 8000);
  assert.equal(sellerProceedsAfterRefund({ ...order, refundedAmountCents: 5000 }), 3500);
  assert.equal(sellerProceedsAfterRefund({ ...order, refundedAmountCents: 10000 }), 0);
  assert.equal(sellerProceedsAfterRefund({ ...order, refundedAmountCents: 9500 }), 0);
  assert.equal(sellerTransferReversalTarget({ ...order, sellerTransferAmountCents: 8000, refundedAmountCents: 5000 }), 4500);
});

test("label UI quotes before explicit purchase, blocks repeated clicks, surfaces failures and uses collector tracking action", async t => {
  const original = { fetch: globalThis.fetch, window: globalThis.window, FormData: globalThis.FormData };
  const states = [], refs = [], pending = [], navigations = [], actions = [];
  let stateIndex = 0, refIndex = 0, tree;
  globalThis.__collectorShippingUi = {
    state(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    ref(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
  };
  globalThis.FormData = class { constructor(values) { this.values = values; } [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); } };
  globalThis.window = { location: { reload: () => navigations.push("reload") } };
  globalThis.fetch = (url, init) => new Promise(resolve => pending.push({ url, body: JSON.parse(init.body), resolve }));
  t.after(() => { Object.assign(globalThis, original); delete globalThis.__collectorShippingUi; });
  const { SellerShipmentPanel } = await bundle(t, "export {SellerShipmentPanel} from './components/seller-shipment-panel.tsx';", {
    react: "export const useState=globalThis.__collectorShippingUi.state,useRef=globalThis.__collectorShippingUi.ref;",
  });
  const props = {
    order: { id: "sale", orderNumber: "MCC-1", currency: "usd", subtotalCents: 10000, shippingCents: 950, shippingMode: "calculated", selectedShippingCarrier: "USPS", selectedShippingService: "Priority Mail", selectedShippingEstimatedDays: 3, paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shipment: null },
    compatibleOrders: [], store: { defaultPackageLength: "12", defaultPackageWidth: "8", defaultPackageHeight: "6", defaultPackageWeight: "2" },
    shipping: { configured: true, insuranceThresholdCents: 25000, signatureThresholdCents: 75000 }, disabled: false, manualTrackingAction: "ship_sale",
    action: async payload => { actions.push(payload); throw Error("Tracking is invalid"); },
  };
  function render() { stateIndex = refIndex = 0; tree = SellerShipmentPanel(props); return tree; }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { if (!child || typeof child !== "object") continue; const found = find(predicate, child); if (found) return found; }
    return null;
  }
  const text = node => !node ? "" : typeof node !== "object" ? String(node) : [node.props?.children].flat(Infinity).map(text).join(" ");
  const event = values => ({ preventDefault() {}, currentTarget: values });
  render();
  const quoting = find(node => node.type === "form").props.onSubmit(event({ length: "12", width: "8", height: "6", weight: "2" }));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].body.action, "quote");
  assert.deepEqual(pending[0].body.orderIds, ["sale"]);
  pending[0].resolve(Response.json({ quote: { id: "quote", expiresAt: "2030-01-01T12:00:00Z", orderNumbers: ["MCC-1"], declaredValueCents: 10000, insuranceRequired: false, signatureRequired: false, selectedServices: [], rates: [{ id: "rate", provider: "USPS", serviceLevel: "Priority Mail", amountCents: 950, currency: "USD", estimatedDays: 3 }] } }));
  await quoting;
  render();
  assert.equal(pending.length, 1, "Receiving a quote must not buy a label");
  const buy = () => find(node => node.type === "button" && /Buy label/.test(text(node)));
  buy().props.onClick(); buy().props.onClick();
  assert.equal(pending.length, 2, "Double clicks cause one purchase request");
  assert.deepEqual(pending[1].body, { action: "buy_label", quoteId: "quote", rateId: "rate" });
  render(); assert.equal(buy().props.disabled, true);
  pending[1].resolve(Response.json({ error: "Carrier unavailable. Try again." }, { status: 503 }));
  await new Promise(resolve => setImmediate(resolve));
  render();
  assert.match(text(find(node => node.props?.role === "alert")), /Carrier unavailable/);
  assert.equal(buy().props.disabled, false);
  assert.deepEqual(navigations, []);
  buy().props.onClick();
  pending[2].resolve(Response.json({ shipment: { id: "shipment" } }));
  await new Promise(resolve => setImmediate(resolve));
  render();
  assert.deepEqual(navigations, ["reload"]);
  assert.equal(buy().props.disabled, true, "Keep purchasing disabled until the saved shipment reloads");
  buy().props.onClick(); assert.equal(pending.length, 3);

  states.length = refs.length = 0;
  props.shipping.configured = false;
  render();
  const manual = find(node => typeof node.type === "function" && node.type.name === "ManualTrackingForm");
  await manual.props.onSubmit(event({ carrier: "USPS", trackingNumber: "940001" }));
  assert.deepEqual(actions, [{ action: "ship_sale", orderId: "sale", carrier: "USPS", trackingNumber: "940001" }]);
  render(); assert.match(text(find(node => node.props?.role === "alert")), /Tracking is invalid/);
});
