import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { parseEstimateZip, parseCheckoutShippingAddress } from "../lib/shipping-rules.ts";
import { getShippingZip, setShippingZip, subscribeShippingZip, serverShippingZip } from "../lib/shipping-destination.ts";

test("ZIP estimates preserve leading zeros and ZIP+4, while checkout requires an address", () => {
  assert.equal(parseEstimateZip(" 02108 "), "02108");
  assert.equal(parseEstimateZip("02108-1234"), "02108-1234");
  for (const value of [null, 2108, "", "1234", "123456", "ABCDE", "90210\n90211", {}, "SW1A 1AA"])
    assert.throws(() => parseEstimateZip(value), /valid U.S. ZIP/);
  assert.throws(() => parseCheckoutShippingAddress({ zip: "02108", country: "US" }), /Complete the delivery/);
});

test("the ZIP is shared with the cart, survives remounts, and works without browser storage", (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new Map();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete globalThis.sessionStorage;
  });
  let observed;
  const unsubscribe = subscribeShippingZip(() => { observed = getShippingZip(); });
  setShippingZip("02108");
  assert.equal(observed, "02108");
  unsubscribe();
  assert.equal(getShippingZip(), "02108");
  assert.equal(storage.get("mcc-shipping-zip-v1"), "02108");
  assert.equal(serverShippingZip(), "");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("Storage disabled"); } });
  setShippingZip("90210-1234");
  assert.equal(getShippingZip(), "90210-1234");
  setShippingZip("");
});

test("product estimate API uses authoritative shipping data without creating checkout quotes", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".shipping-estimate-test-"));
  const bundlePath = join(scratch, "route.mjs");
  const originalFetch = globalThis.fetch;
  const cart = {
    shippingMode: "calculated", currency: "usd", totals: { subtotalCents: 60000 },
    items: [{ id: "model-1", quantity: 1, packageLength: "12", packageWidth: "6", packageHeight: "5", packageWeight: "2" }],
    seller: {
      sellerId: "seller-1", contactName: "Seller", sellerName: "Model Store", sellerEmail: "seller@example.test",
      shippingCents: 1295, shippingOriginStreet1: "10 Origin Lane", shippingOriginStreet2: null,
      shippingOriginCity: "Los Angeles", shippingOriginRegion: "CA", shippingOriginPostalCode: "90001",
      shippingOriginCountry: "US", shippingOriginPhone: "5551234567",
      defaultPackageLength: "10", defaultPackageWidth: "5", defaultPackageHeight: "4", defaultPackageWeight: "1",
    },
  };
  const state = { cart, requested: null, loadError: null };
  globalThis.__shippingEstimateTest = state;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete globalThis.__shippingEstimateTest;
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch);
  });
  await build({
    entryPoints: [join(root, "app/api/shipping/estimate/route.ts")], outfile: bundlePath,
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{ name: "estimate-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(@\/db$|@\/lib\/inventory$|\.\/inventory$|\.\/config$)/ }, ({ path }) => ({ path, namespace: "estimate-test" }));
      builder.onLoad({ filter: /.*/, namespace: "estimate-test" }, ({ path }) => ({ contents:
        path === "@/db" ? 'export const getDb = () => { throw new Error("Estimates must not persist checkout quotes"); };' :
        path.endsWith("/inventory") ? 'export async function loadAuthoritativeCart(items) { const state = globalThis.__shippingEstimateTest; state.requested = items; if (state.loadError) throw new Error(state.loadError); return state.cart; }' :
        'export const config = { shippoInsuranceThresholdCents: 20000, shippoSignatureThresholdCents: 50000, shippoMaxLabelCostCents: 20000, shippoApiVersion: "2018-02-08", shippingCountries: ["US"] }; export const requireConfig = () => "shippo_test_fixture";',
      }));
    } }],
  });
  const { POST } = await import(pathToFileURL(bundlePath).href);
  let calls = [];
  let providerStatus = 201;
  let providerRates = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.goshippo.com/shipments/");
    calls.push(JSON.parse(init.body));
    return Response.json({ object_id: "shipment-1", rates: providerRates }, { status: providerStatus });
  };
  const post = async (payload, expectedStatus = 200) => {
    const response = await POST(new Request("http://localhost/api/shipping/estimate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }));
    const body = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(body));
    if (expectedStatus === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
    return body;
  };
  await t.test("invalid input is rejected before catalog or carrier calls", async () => {
    await post({ productId: "model-1", zip: "12" }, 400);
    await post({ zip: "02108" }, 400);
    assert.equal(state.requested, null);
    assert.equal(calls.length, 0);
  });
  await t.test("ZIP-only request includes real origin, package, insurance, and signature", async () => {
    providerRates = [
      { object_id: "rate-1", provider: "USPS", amount: "12.34", currency: "USD", servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" } },
      { object_id: "rate-2", provider: "UPS", amount: "4.00", currency: "CAD" },
      { object_id: "rate-3", provider: "UPS", amount: "999.00", currency: "USD" },
    ];
    const result = await post({ productId: "model-1", zip: "02108", quantity: 10, priceCents: 1, shippingCents: 0 });
    assert.deepEqual(state.requested, [{ productId: "model-1", quantity: 1 }]);
    assert.deepEqual(calls[0].address_to, { zip: "02108", country: "US", is_residential: true, validate: false });
    assert.equal(calls[0].address_from.street1, "10 Origin Lane");
    assert.equal(calls[0].address_from.validate, true);
    assert.equal(calls[0].parcels[0].weight, "2");
    assert.equal(calls[0].parcels[0].length, "12");
    assert.equal(calls[0].extra.insurance.amount, "600.00");
    assert.equal(calls[0].extra.signature_confirmation, "STANDARD");
    assert.equal(result.estimate, true);
    assert.equal(result.requiresAddress, false);
    assert.deepEqual(result.options, [{ provider: "USPS", serviceLevel: "Ground Advantage", amountCents: 1234, currency: "USD" }]);
    assert.equal(result.quoteId, undefined);
    assert.equal(result.options[0].id, undefined);
  });
  await t.test("no ZIP-only rates prompts for a complete address instead of free shipping", async () => {
    providerRates = [];
    const result = await post({ productId: "model-1", zip: "90210" });
    assert.equal(result.requiresAddress, true);
    assert.deepEqual(result.options, []);
  });
  await t.test("provider failures allow retry and full-address fallback", async () => {
    providerStatus = 400;
    const result = await post({ productId: "model-1", zip: "90210" }, 502);
    assert.match(result.error, /complete delivery address/);
    providerStatus = 201;
  });
  await t.test("free and flat shipping use seller settings without carrier calls", async () => {
    calls = [];
    cart.shippingMode = "free";
    assert.equal((await post({ productId: "model-1", zip: "90210" })).options[0].amountCents, 0);
    cart.shippingMode = "flat";
    assert.equal((await post({ productId: "model-1", zip: "90210" })).options[0].amountCents, 1295);
    assert.equal(calls.length, 0);
  });
  await t.test("unavailable products cannot get an estimate", async () => {
    state.loadError = "This product is no longer available.";
    await post({ productId: "model-1", zip: "90210" }, 400);
    assert.equal(calls.length, 0);
  });
});
