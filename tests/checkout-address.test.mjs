import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import { checkoutAddressKey, readCheckoutAddressDraft, stripeShippingAddress, validateCheckoutDestination } from "../lib/checkout-address.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

const destination = { name: "Ada Buyer", street1: "123 Main St", street2: "Unit 4", city: "Los Angeles", state: "CA", zip: "90012", country: "US" };

test("delivery drafts survive navigation without persisting quotes or extra fields", () => {
  assert.deepEqual(readCheckoutAddressDraft(JSON.stringify({ ...destination, quoteId: "stale", phone: "extra" })), destination);
  assert.equal(readCheckoutAddressDraft("invalid").country, "US");
  assert.equal(readCheckoutAddressDraft('{"street1":null}').street1, "");
  assert.equal(checkoutAddressKey(destination), checkoutAddressKey({ ...destination, street1: " 123 MAIN ST " }));
  assert.notEqual(checkoutAddressKey(destination), checkoutAddressKey({ ...destination, street2: "Unit 5" }));
  assert.equal(stripeShippingAddress(destination).address.line2, "Unit 4");
  assert.throws(() => validateCheckoutDestination({ ...destination, country: "CA" }, ["US"]), /not available/);
});

test("checkout reuses the quoted destination and closes old payment sessions before repricing", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".checkout-address-test-"));
  const bundlePath = join(scratch, "checkout.mjs");
  const sqlite = new DatabaseSync(":memory:");
  const binding = {
    prepare(query) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
  };
  for (const name of (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  }
  sqlite.exec("INSERT INTO sellers (id, slug, store_name, contact_name, contact_email) VALUES ('seller', 'seller', 'Store', 'Owner', 'owner@example.test')");
  const fixture = {
    db: drizzle(binding), sessions: new Map(), requests: [], reservations: [], operations: [], failExpiration: false,
    cart: {
      seller: {
        sellerId: "seller", sellerStripeAccountId: "acct_test", shippingCents: 800,
        contactName: "Seller", sellerName: "Store", sellerEmail: "seller@example.test",
        shippingOriginStreet1: "100 Market St", shippingOriginStreet2: "", shippingOriginCity: "San Francisco",
        shippingOriginRegion: "CA", shippingOriginPostalCode: "94105", shippingOriginCountry: "US", shippingOriginPhone: "4155550100",
        defaultPackageLength: "10", defaultPackageWidth: "8", defaultPackageHeight: "4", defaultPackageWeight: "2",
      },
      items: [{ id: "model", title: "Model", description: "", imageUrl: null, quantity: 1, priceCents: 10000, currency: "usd", shipFromAddressId: "origin", packageLength: null, packageWidth: null, packageHeight: null, packageWeight: null }],
      shippingMode: "calculated", currency: "usd", fee: { marketplaceFeeBps: 700 }, totals: { subtotalCents: 10000 },
    },
    async shipment(input) {
      fixture.operations.push("quote");
      return { shippoShipmentId: crypto.randomUUID(), rates: [{ id: crypto.randomUUID(), provider: "Carrier", serviceLevel: "Ground", serviceToken: "ground", amountCents: input.to.zip === "10001" ? 1900 : 900, currency: "USD", estimatedDays: 3, durationTerms: "", arrivesBy: null }] };
    },
  };
  globalThis.__checkoutAddressTest = fixture;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    assert.ok(String(url).startsWith("https://api.stripe.com/"), "No real service calls are allowed");
    const path = new URL(url).pathname;
    const body = new URLSearchParams(init.body);
    fixture.requests.push({ path, body, headers: init.headers });
    if (path === "/v1/accounts/acct_test") return Response.json({ charges_enabled: true, payouts_enabled: true });
    if (path === "/v1/customers") return Response.json({ id: `cus_${fixture.requests.length}` });
    if (path === "/v1/checkout/sessions") {
      fixture.operations.push("create-session");
      const id = `cs_test_${fixture.sessions.size + 1}`;
      const session = { id, url: `https://checkout.stripe.com/${id}`, status: "open", payment_status: "unpaid", metadata: {
        reservation_id: body.get("metadata[reservation_id]"), return_token: body.get("metadata[return_token]"),
      } };
      fixture.sessions.set(id, session);
      return Response.json(session);
    }
    const id = path.split("/")[4];
    const session = fixture.sessions.get(id);
    assert.ok(session, `Unexpected Stripe request: ${path}`);
    if (path.endsWith("/expire")) {
      fixture.operations.push("expire");
      if (fixture.failExpiration) return Response.json({ error: { message: "Expiration temporarily unavailable" } }, { status: 503 });
      session.status = "expired";
    }
    return Response.json(session);
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    delete globalThis.__checkoutAddressTest;
    sqlite.close();
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch);
  });
  const mocks = {
    db: "export const getDb = () => globalThis.__checkoutAddressTest.db;",
    config: `export const config = { siteUrl: 'https://shop.example', marketplaceMode: 'test', stripeSecretKey: 'sk_test_fixture', stripeApiVersion: '2026-02-25.clover', automaticTax: true, stripeTaxBehavior: 'exclusive', stripeShippingTaxCode: 'txcd_92010001', shippingCountries: ['US'], shippoInsuranceThresholdCents: 50000, shippoSignatureThresholdCents: 50000, shippoMaxLabelCostCents: 50000, shippoQuoteExpirationMinutes: 30 }; export const requireConfig = key => config[key];`,
    auth: "export const getCurrentCollector = async () => null;",
    shippo: "export const createShippoShipment = input => globalThis.__checkoutAddressTest.shipment(input); export const createShippoEstimate = () => { throw new Error('Unexpected estimate'); };",
    inventory: `const f = () => globalThis.__checkoutAddressTest;
      export const loadAuthoritativeCart = async () => { f().operations.push('load-cart'); return f().cart; };
      export const releaseStaleReservations = async () => {};
      export const attachStripeSession = async () => {};
      export const releaseReservation = async () => { f().operations.push('release'); };
      export const reserveCart = async (cart, buyer, policy, shipping) => { f().reservations.push({cart, shipping}); return {reservationId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000)}; };`,
  };
  const result = await build({
    stdin: { contents: `export { POST } from './app/api/checkout/route.ts'; export { POST as close, GET as returnFromStripe } from './app/api/checkout/return/route.ts'; export { quoteCheckoutShipping as quote, checkoutCartFingerprint } from './lib/checkout-shipping.ts';`, resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "checkout-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(?:@\/|\.\/)/ }, ({ path }) => {
        let mock;
        if (path === "@/db") mock = "db";
        else if (/\/(config)(?:\.ts)?$/.test(path)) mock = "config";
        else if (/\/collector-auth$/.test(path)) mock = "auth";
        else if (/\/inventory(?:\.ts)?$/.test(path)) mock = "inventory";
        else if (/\/shippo(?:\.ts)?$/.test(path)) mock = "shippo";
        if (mock) return { path: mock, namespace: "checkout-mock" };
        if (path.startsWith("@/")) return { path: join(root, path.slice(2) + ".ts") };
      });
      builder.onLoad({ filter: /.*/, namespace: "checkout-mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundlePath).href);
  const quote = (address = destination) => api.quote(fixture.cart, address, null, null);
  const checkout = (address, rate, cookie) => api.POST(new Request("https://shop.example/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ policyVersion: POLICY_VERSION, items: [{ productId: "model", quantity: 1 }], destination: address, previousReservationId: cookie?.split("=")[0].slice("mcc-checkout-return-".length), shippingSelection: rate ? { quoteId: rate.quoteId, rateId: rate.options[0].id } : undefined }),
  }));
  let firstCookie;
  await t.test("guest address is sent to Stripe shipping and tax exactly once", async () => {
    const rate = await quote();
    const response = await checkout(destination, rate);
    assert.equal(response.status, 200);
    firstCookie = response.headers.get("set-cookie").split(";")[0];
    const customer = fixture.requests.findLast((entry) => entry.path === "/v1/customers").body;
    const session = fixture.requests.findLast((entry) => entry.path === "/v1/checkout/sessions").body;
    assert.equal(customer.get("shipping[address][line2]"), "Unit 4");
    assert.equal(customer.get("shipping[address][postal_code]"), "90012");
    assert.match(session.get("customer"), /^cus_/);
    assert.equal(session.get("customer_email"), null);
    assert.equal(session.get("automatic_tax[enabled]"), "true");
    assert.equal(session.get("payment_intent_data[shipping][address][postal_code]"), "90012");
    assert.equal([...session.keys()].some((key) => key.startsWith("shipping_address_collection")), false);
    assert.equal(session.get("metadata[delivery_address_source]"), "cart");
    assert.equal(session.get("line_items[1][price_data][unit_amount]"), "900");
    assert.deepEqual(JSON.parse(fixture.reservations.at(-1).shipping.quotedAddress), destination);
  });
  await t.test("address edits, including unit, reject a stale quote before creating a payment", async () => {
    const rate = await quote();
    const count = fixture.sessions.size;
    for (const change of [{ street1: "125 Main St" }, { street2: "Unit 5" }, { zip: "10001" }, { name: "Other recipient" }]) {
      const response = await checkout({ ...destination, ...change }, rate);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /address changed/);
    }
    assert.equal(fixture.sessions.size, count);
  });
  await t.test("expired quotes and changed prices or parcel dimensions require fresh rates", async () => {
    const rate = await quote();
    sqlite.prepare("UPDATE checkout_shipping_quotes SET expires_at = ? WHERE id = ?").run(new Date(0).toISOString(), rate.quoteId);
    assert.match((await (await checkout(destination, rate)).json()).error, /expired/);
    const fresh = await quote();
    fixture.cart.items[0].priceCents += 100;
    assert.match((await (await checkout(destination, fresh)).json()).error, /cart changed/i);
    fixture.cart.items[0].priceCents -= 100;
    fixture.cart.seller.defaultPackageWeight = "3";
    assert.match((await (await checkout(destination, fresh)).json()).error, /cart changed/i);
    fixture.cart.seller.defaultPackageWeight = "2";
  });
  await t.test("replacement checkout expires the old session then quotes a new tax destination", async () => {
    const changed = { ...destination, city: "New York", state: "NY", zip: "10001" };
    const rate = await quote(changed);
    fixture.operations = [];
    const response = await checkout(changed, rate, firstCookie);
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.operations.slice(0, 3), ["expire", "release", "load-cart"]);
    const session = fixture.requests.findLast((entry) => entry.path === "/v1/checkout/sessions").body;
    const customer = fixture.requests.findLast((entry) => entry.path === "/v1/customers").body;
    assert.equal(session.get("line_items[1][price_data][unit_amount]"), "1900");
    assert.equal(customer.get("shipping[address][state]"), "NY");
    assert.equal(session.get("payment_intent_data[shipping][address][state]"), "NY");
    assert.equal(fixture.sessions.get("cs_test_1").status, "expired");
    firstCookie = response.headers.get("set-cookie").split(";")[0];
  });
  await t.test("failed cancellation cannot release stock or open another payment page", async () => {
    fixture.failExpiration = true;
    fixture.operations = [];
    const response = await checkout(destination, await quote(), firstCookie);
    assert.equal(response.status, 400);
    assert.equal(fixture.operations.includes("release"), false);
    assert.equal(fixture.operations.includes("create-session"), false);
    fixture.failExpiration = false;
  });
  await t.test("a completed session returns its confirmation without releasing inventory", async () => {
    fixture.sessions.get("cs_test_2").status = "complete";
    fixture.sessions.get("cs_test_2").payment_status = "paid";
    fixture.operations = [];
    const response = await api.returnFromStripe(new Request(`https://shop.example/api/checkout/return?reservation_id=${fixture.sessions.get("cs_test_2").metadata.reservation_id}`, { headers: { cookie: firstCookie } }));
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location"), /checkout\/success\?session_id=cs_test_2$/);
    assert.deepEqual(fixture.operations, []);
  });
  await t.test("free and flat shipping still validate and preserve the delivery destination", async () => {
    for (const mode of ["free", "flat"]) {
      fixture.cart.shippingMode = mode;
      assert.equal((await checkout(undefined)).status, 400);
      assert.equal((await checkout({ ...destination, country: "CA" })).status, 400);
      assert.equal((await checkout(destination)).status, 200);
      assert.equal(fixture.reservations.at(-1).shipping.amountCents, mode === "free" ? 0 : 800);
      assert.deepEqual(JSON.parse(fixture.reservations.at(-1).shipping.quotedAddress), destination);
    }
  });
  await t.test("returning one tab closes only that tab's payment session", async () => {
    const first = await checkout(destination);
    const firstBody = await first.json();
    const firstId = firstBody.url.split("/").at(-1);
    const second = await checkout({ ...destination, street2: "Unit 9" });
    const secondId = (await second.json()).url.split("/").at(-1);
    const cookies = [first, second].map((response) => response.headers.get("set-cookie").split(";")[0]).join("; ");
    const response = await api.returnFromStripe(new Request(`https://shop.example/api/checkout/return?reservation_id=${firstBody.reservationId}`, { headers: { cookie: cookies } }));
    assert.equal(response.status, 303);
    assert.equal(fixture.sessions.get(firstId).status, "expired");
    assert.equal(fixture.sessions.get(secondId).status, "open");
  });
});
