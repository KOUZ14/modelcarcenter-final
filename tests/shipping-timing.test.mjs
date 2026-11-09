import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { securityDatabase } from "./fixtures/security-database.mjs";
import { trackingEvidence } from "../lib/tracking-evidence.ts";

const accepted = "2026-09-01T17:00:00.000Z";
const delivery = "2026-09-05T17:00:00.000Z";
const scan = (status, status_date) => ({ status, status_date });
const tracking = (tracking_status, tracking_history = []) => ({ carrier: "usps", tracking_number: "940001", tracking_status, tracking_history });

test("dispatch evidence uses the earliest dated carrier scan across unordered history and timezones", () => {
  const result = trackingEvidence(tracking(scan("DELIVERED", delivery), [
    scan("TRANSIT", "2026-09-03T17:00:00Z"), scan("PRE_TRANSIT", "2026-08-30T17:00:00Z"),
    scan("TRANSIT", "2026-09-01T10:00:00-07:00"), scan("TRANSIT", "not-a-date"),
  ]));
  assert.equal(result.shippedAt, accepted);
  assert.equal(result.deliveredAt, delivery);
  assert.equal(result.hasUndatedDispatch, true);
  assert.equal(trackingEvidence(tracking(scan("DELIVERED", delivery))).shippedAt, delivery);
});

test("labels, missing dates, invalid dates and future scans never fabricate dispatch", () => {
  for (const event of [scan("PRE_TRANSIT", accepted), scan("TRANSIT"), scan("DELIVERED", "invalid"), scan("TRANSIT", "2099-01-01T00:00:00Z")]) {
    const result = trackingEvidence(tracking(event));
    assert.equal(result.shippedAt, null);
    assert.equal(result.deliveredAt, null);
  }
});

test("carrier updates repair shipment timing and protect delivery and cancellation workflows", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/shipping-timing-"));
  const file = join(scratch, "fixture.mjs");
  const refunds = [];
  globalThis.__shippingTiming = {
    binding, db: drizzle(binding), tracking: tracking(scan("PRE_TRANSIT", accepted)),
    refund: async input => { refunds.push(input); return { id: "re-test", status: "succeeded", sellerTransferReversedCents: 0 }; },
  };
  t.after(async () => { delete globalThis.__shippingTiming; await unlink(file); await rmdir(scratch); });
  const mocks = {
    "@/db": "export const getDb=()=>globalThis.__shippingTiming.db; export const getD1=()=>globalThis.__shippingTiming.binding;",
    "./config": "export const config={siteUrl:'https://example.test',supportEmail:'support@example.test',shippoApiKey:'shippo_test_fixture'}; export const requireConfig=key=>config[key];",
    "./email": "export const sendShipmentEmail=async()=>{}; export const sendLabelCreatedEmail=async()=>{}; export const sendEmail=async()=>({sent:true}); export const escapeHtml=v=>v;",
    "./shippo": "export const retrieveShippoTracking=async()=>globalThis.__shippingTiming.tracking; export const createShippoShipment=()=>{throw Error('Unexpected label')}; export const purchaseShippoLabel=createShippoShipment,retrieveShippoTransaction=createShippoShipment; export class ShippoApiError extends Error {}",
    "./preorder-order-refunds": "export const createFullRefund=input=>globalThis.__shippingTiming.refund(input);",
    "./stripe": "export const retrieveChargeRefunds=async()=>[];",
  };
  const output = await build({ stdin: { contents: "export {recordOrderTrackingUpdate,processShippoTrackingWebhook,syncOwnedShipment} from './lib/shipping.ts'; export {getSellerReputation} from './lib/reputation.ts'; export {processShippingDelays} from './lib/consumer-shipping.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "shipping-fixture", setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
    } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  const api = await import(pathToFileURL(file).href);
  sqlite.exec("INSERT INTO user(id,name,email,created_at,updated_at) VALUES('seller','Seller','seller@example.test',0,0); INSERT INTO sellers(id,slug,store_name,contact_name,contact_email,owner_user_id) VALUES('seller','seller','Store','Seller','seller@example.test','seller')");
  const makeOrder = id => sqlite.prepare("INSERT INTO orders(id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status,fulfillment_status,ship_by_at,protection_policy_version,carrier,tracking_number,stripe_payment_intent_id) VALUES(?,?,'seller',?,'buyer@example.test','usd',1000,0,0,1000,'paid','processing','2026-09-02T23:59:59Z','delivery-14-v2','usps','940001',?)").run(id,id,`cs-${id}`,`pi-${id}`);
  const order = id => sqlite.prepare("SELECT shipped_at,delivered_at,fulfillment_status,refund_request_deadline,payout_eligible_at,payment_status FROM orders WHERE id=?").get(id);

  await t.test("direct tracking corrects a late recorded scan and preserves delivery windows on replay", async () => {
    makeOrder("direct");
    await api.recordOrderTrackingUpdate(["direct"], tracking(scan("DELIVERED", delivery)));
    assert.equal((await api.getSellerReputation("seller")).onTimeShipmentRate, 0);
    const before = order("direct");
    await api.recordOrderTrackingUpdate(["direct"], tracking(scan("DELIVERED", delivery), [scan("TRANSIT", accepted)]));
    assert.equal(order("direct").shipped_at, accepted);
    assert.equal((await api.getSellerReputation("seller")).onTimeShipmentRate, 100);
    assert.deepEqual({ ...order("direct"), shipped_at: before.shipped_at }, { ...before });
    await api.recordOrderTrackingUpdate(["direct"], tracking(scan("TRANSIT", "2026-09-04T00:00:00Z")));
    await api.recordOrderTrackingUpdate(["direct"], tracking(scan("PRE_TRANSIT", "2026-08-30T00:00:00Z")));
    assert.equal(order("direct").shipped_at, accepted);
    assert.equal(order("direct").fulfillment_status, "delivered");
    assert.equal(order("direct").payout_eligible_at, before.payout_eligible_at);
  });

  await t.test("unknown dispatch dates do not mark an order shipped", async () => {
    makeOrder("undated");
    for (const event of [scan("PRE_TRANSIT", accepted), scan("TRANSIT"), scan("DELIVERED", "bad"), scan("TRANSIT", "2099-01-01")]) await api.recordOrderTrackingUpdate(["undated"], tracking(event));
    assert.equal(order("undated").shipped_at, null);
    assert.equal(order("undated").fulfillment_status, "processing");
    sqlite.exec("UPDATE orders SET protection_policy_version='delivery-3-v1' WHERE id='undated'");
  });

  await t.test("label webhooks and polling use verified history and cannot move dates forward", async () => {
    makeOrder("label");
    sqlite.exec(`INSERT INTO shipping_quotes(id,seller_id,shippo_shipment_id,order_ids,parcel_length,parcel_width,parcel_height,parcel_weight,declared_value_cents,rates,expires_at) VALUES('q','seller','sq','["label"]','1','1','1','1',1000,'[]','2099-01-01');
      INSERT INTO shipments(id,seller_id,quote_id,shippo_shipment_id,shippo_transaction_id,shippo_rate_id,carrier,service_level,rate_amount_cents,parcel_length,parcel_width,parcel_height,parcel_weight,declared_value_cents,tracking_number) VALUES('s','seller','q','sq','tx','r','usps','Ground',100,'1','1','1','1',1000,'940001');
      INSERT INTO shipment_orders(id,shipment_id,order_id) VALUES('link','s','label')`);
    globalThis.__shippingTiming.tracking = tracking(scan("DELIVERED", delivery), [scan("TRANSIT", accepted)]);
    const webhook = { event: "track_updated", test: true, data: { transaction: "tx", carrier: "usps", tracking_number: "940001", tracking_status: scan("TRANSIT", "2020-01-01") } };
    await api.processShippoTrackingWebhook(webhook);
    const shipment = () => sqlite.prepare("SELECT shipped_at,delivered_at,status FROM shipments WHERE id='s'").get();
    assert.equal(shipment().shipped_at, accepted);
    assert.equal(order("label").shipped_at, accepted);
    globalThis.__shippingTiming.tracking = tracking(scan("TRANSIT", "2026-09-03T17:00:00Z"));
    await api.syncOwnedShipment("seller", "s");
    assert.equal(shipment().shipped_at, accepted);
    assert.equal(shipment().status, "delivered");
    assert.equal(order("label").fulfillment_status, "delivered");
    const earlier = "2026-08-31T17:00:00.000Z";
    globalThis.__shippingTiming.tracking = tracking(scan("DELIVERED", delivery), [scan("TRANSIT", earlier)]);
    await api.processShippoTrackingWebhook(webhook);
    assert.equal(shipment().shipped_at, earlier);
    assert.equal(order("label").shipped_at, earlier);
  });

  await t.test("scheduled delay processing recovers carrier acceptance before cancellation", async () => {
    makeOrder("delayed-update");
    globalThis.__shippingTiming.tracking = tracking(scan("DELIVERED", delivery), [scan("TRANSIT", accepted)]);
    await api.processShippingDelays();
    assert.equal(order("delayed-update").shipped_at, accepted);
    assert.equal(order("delayed-update").payment_status, "paid");
    assert.equal(refunds.length, 0);
    assert.equal(sqlite.prepare("SELECT status FROM order_shipping_delays WHERE order_id='delayed-update'").get().status, "fulfilled");
  });

  await t.test("ambiguous or mismatched carrier evidence holds refunds for review", async () => {
    makeOrder("review");
    globalThis.__shippingTiming.tracking = tracking(scan("TRANSIT"));
    await api.processShippingDelays();
    assert.equal(order("review").shipped_at, null);
    assert.equal(refunds.length, 0);
    assert.ok(sqlite.prepare("SELECT error FROM order_shipping_delays WHERE order_id='review'").get().error);
    globalThis.__shippingTiming.tracking = { ...tracking(scan("PRE_TRANSIT", accepted)), tracking_number: "wrong" };
    await api.processShippingDelays();
    assert.equal(refunds.length, 0);
  });

  await t.test("labels alone still allow an eligible overdue order to be refunded", async () => {
    globalThis.__shippingTiming.tracking = tracking(scan("PRE_TRANSIT", accepted));
    await api.processShippingDelays();
    assert.equal(refunds.length, 1);
    assert.equal(order("review").payment_status, "refunded");
    assert.equal(order("review").fulfillment_status, "cancelled");
    await api.recordOrderTrackingUpdate(["review"], tracking(scan("TRANSIT", accepted)));
    assert.equal(order("review").shipped_at, null);
  });
});
