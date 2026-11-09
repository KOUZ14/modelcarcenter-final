import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { securityDatabase } from "./fixtures/security-database.mjs";
import { collectorPaymentState, collectorPaymentSummary } from "../lib/collector-payments.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

const payment = { id: "sale", orderNumber: "MCC-1", currency: "usd", createdAt: "2026-09-01", subtotalCents: 10000, shippingCents: 1000, taxCents: 0, totalCents: 11000, marketplaceFeeBps: 1000, platformFeeCents: 1000, processingFeePayer: "seller", paymentProcessingFeeCents: 400, sellerProceedsCents: 9600, shippingLabelCostCents: 600, refundedAmountCents: 0, paymentStatus: "paid", paymentFlow: "separate", sellerTransferStatus: "pending", sellerTransferAmountCents: 0, sellerTransferReversedCents: 0, payoutEligibleAt: null, sellerTransferredAt: null, payoutHold: false, isTestOrder: false };

test("collector totals separate currencies and actual releases from held, unknown and legacy proceeds", () => {
  const rows = [payment,
    { ...payment, paymentStatus: "partially_refunded", refundedAmountCents: 5500 },
    { ...payment, sellerTransferStatus: "processing", sellerTransferAmountCents: 9000 },
    { ...payment, sellerTransferStatus: "transferred", sellerTransferAmountCents: 9000, sellerTransferReversedCents: 2500 },
    { ...payment, sellerTransferStatus: "reversed", sellerTransferAmountCents: 9000, sellerTransferReversedCents: 9000, paymentStatus: "refunded" },
    { ...payment, sellerTransferStatus: "cancelled" },
    { ...payment, paymentStatus: "refunded" },
    { ...payment, paymentProcessingFeeCents: null },
    { ...payment, sellerProceedsCents: null },
    { ...payment, paymentFlow: "destination" },
    { ...payment, currency: "eur" },
    { ...payment, isTestOrder: true },
  ];
  assert.deepEqual(collectorPaymentSummary(rows, "USD"), { heldCents: 22200, releasedCents: 6500, pendingCount: 2, legacyCount: 1 });
  assert.equal(collectorPaymentSummary(rows, "eur").heldCents, 9000);
  assert.equal(collectorPaymentState({ ...payment, payoutHold: true }).label, "Held for a case, dispute or refund");
  assert.equal(collectorPaymentState({ ...payment, sellerTransferStatus: "failed" }).label, "Release will be retried");
  assert.equal(collectorPaymentState({ ...payment, shippingLabelCostCents: 20000 }).amount, 0);
});

test("collector payment access uses the authenticated owner and preserves refunded history", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/collector-payments-")), file = join(scratch, "test.mjs");
  const originalFetch = globalThis.fetch;
  const calls = [];
  let providerFails = false;
  const boundary = { db: drizzle(binding), binding, account: { user: { id: "owner", email: "owner@example.test", emailVerified: true, name: "Owner" }, profile: { displayName: "Owner", bio: "" } } };
  globalThis.__collectorPayments = boundary;
  t.after(async () => { globalThis.fetch = originalFetch; delete globalThis.__collectorPayments; await unlink(file).catch(() => {}); await rmdir(scratch); });
  const mocks = {
    "@/db": "export const getDb=()=>globalThis.__collectorPayments.db; export const getD1=()=>globalThis.__collectorPayments.binding;",
    "@/lib/collector-auth": "export const requireCollectorApi=async()=>globalThis.__collectorPayments.account;",
    "cloudflare:workers": "export const env={DB:globalThis.__collectorPayments.binding};",
  };
  const output = await build({ stdin: { contents: "export {POST} from './app/api/account/payments/route.ts'; export {getGarageData} from './lib/collector-store.ts'; export {config} from './lib/config.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "payments-boundary", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
    } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  const { POST, getGarageData, config } = await import(pathToFileURL(file).href);
  config.stripeSecretKey = "sk_test_collector_payment_fixture";
  config.siteUrl = "https://marketplace.test";
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, method: options.method, body: new URLSearchParams(options.body) });
    if (providerFails) return Response.json({ error: { message: "Private provider diagnostic" } }, { status: 500 });
    if (path.endsWith("/login_links")) return Response.json({ url: "https://connect.stripe.com/express/fixture" });
    if (path === "/v1/account_links") return Response.json({ url: "https://connect.stripe.com/setup/fixture" });
    if (path === "/v1/accounts/acct_owner") return Response.json({ id: "acct_owner", charges_enabled: true, payouts_enabled: true });
    throw new Error(`Unexpected provider request: ${path}`);
  };
  for (const id of ["owner", "other", "professional", "unconnected", "buyer"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  for (const id of ["owner", "other", "professional", "unconnected"]) sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type,stripe_account_id) VALUES (?,?,?,?,?,?,'active',?,?)").run(id, id, id, id, id, `${id}@example.test`, id === "professional" ? "professional" : "collector", id === "unconnected" ? null : `acct_${id}`);
  const account = boundary.account;
  const request = (action, extra = {}, origin = "https://marketplace.test") => new Request("https://marketplace.test/api/account/payments", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });

  await t.test("unauthenticated, cross-origin and non-collector requests never contact Stripe", async () => {
    boundary.account = new Response("Unauthorized", { status: 401 });
    assert.equal((await POST(request("dashboard"))).status, 401);
    boundary.account = account;
    assert.equal((await POST(request("dashboard", {}, "https://foreign.test"))).status, 403);
    for (const id of ["buyer", "professional", "unconnected"]) {
      boundary.account = { ...account, user: { ...account.user, id } };
      const response = await POST(request("dashboard", { sellerId: "other", stripeAccountId: "acct_other" }));
      assert.equal(response.status, id === "unconnected" ? 400 : 403);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    assert.equal(calls.length, 0);
    boundary.account = account;
  });
  await t.test("dashboard links are fresh, private and scoped to the owner even when suspended", async () => {
    sqlite.exec("UPDATE sellers SET status='suspended' WHERE id='owner'");
    for (let i = 0; i < 2; i++) {
      const response = await POST(request("dashboard", { sellerId: "other", stripeAccountId: "acct_other" }));
      assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal((await response.json()).url, "https://connect.stripe.com/express/fixture");
    }
    assert.deepEqual(calls.map(call => [call.path, call.method]), [["/v1/accounts/acct_owner/login_links", "POST"], ["/v1/accounts/acct_owner/login_links", "POST"]]);
    providerFails = true;
    const failed = await POST(request("dashboard"));
    assert.equal(failed.status, 500); assert.equal(failed.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(await failed.text(), /Private provider diagnostic|sk_test/);
    providerFails = false;
    await POST(request("refresh"));
    assert.equal(sqlite.prepare("SELECT status FROM sellers WHERE id='owner'").get().status, "suspended");
    sqlite.exec("UPDATE sellers SET status='onboarding' WHERE id='owner'");
  });
  await t.test("setup preserves consent and returns to Payments; refresh only updates the owned account", async () => {
    const before = calls.length;
    assert.equal((await POST(request("onboarding", { sellerTermsVersion: "outdated" }))).status, 400);
    assert.equal(calls.length, before);
    assert.equal((await POST(request("onboarding", { sellerTermsVersion: POLICY_VERSION }))).status, 200);
    const setup = calls.at(-1);
    assert.equal(setup.body.get("account"), "acct_owner");
    assert.equal(setup.body.get("return_url"), "https://marketplace.test/account?view=payments&stripe=returned");
    assert.equal(setup.body.get("refresh_url"), "https://marketplace.test/account?view=payments&stripe=refresh");
    const refreshed = await POST(request("refresh", { sellerId: "other" }));
    assert.deepEqual(await refreshed.json(), { status: "active", chargesEnabled: true, payoutsEnabled: true });
    assert.equal(sqlite.prepare("SELECT stripe_payouts_enabled FROM sellers WHERE id='other'").get().stripe_payouts_enabled, 0);
  });
  await t.test("the payment ledger includes refunds and holds, but never another seller's orders", async () => {
    for (const [id, seller, status] of [["paid", "owner", "paid"], ["refunded", "owner", "refunded"], ["pending", "owner", "pending"], ["private", "other", "paid"]]) {
      sqlite.prepare("INSERT INTO orders (id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status) VALUES (?,?,?,?,'buyer@example.test','usd',10000,1000,1000,11000,?)").run(id, id, seller, `checkout-${id}`, status);
    }
    sqlite.exec("UPDATE orders SET ship_by_at='2026-11-12T23:59:59Z' WHERE id='paid'");
    const garage = await getGarageData("owner");
    assert.deepEqual(garage.payments.map(row => row.id).sort(), ["paid", "refunded"]);
    assert.deepEqual(garage.sales.map(row => row.id), ["paid"]);
    assert.equal(garage.sales[0].shipByAt, "2026-11-12T23:59:59Z");
    sqlite.exec("UPDATE orders SET ship_by_at='2026-11-19T23:59:59Z' WHERE id='paid'");
    assert.equal((await getGarageData("owner")).sales[0].shipByAt, "2026-11-19T23:59:59Z", "Show the current saved deadline after a buyer-approved extension");
    assert.equal(garage.payments[0].payoutHold, false);
    sqlite.exec("INSERT INTO disputes (id,order_id,stripe_charge_id,amount_cents,currency,status) VALUES ('dp_fixture','paid','ch_fixture',11000,'usd','needs_response')");
    assert.equal((await getGarageData("owner")).payments.find(row => row.id === "paid").payoutHold, true);
    sqlite.exec("UPDATE disputes SET status='won'");
    assert.equal((await getGarageData("owner")).payments.find(row => row.id === "paid").payoutHold, false);
  });
});
