import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { CHECKOUT_ADDRESS_KEY } from "../lib/checkout-address.ts";

// Exercise the real component's handlers with a small hook host. Network and
// navigation are mocked, so payment creation never reaches an external service.
test("cart preserves the full address, rejects late quotes, and refreshes after edits", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".cart-checkout-test-"));
  const bundlePath = join(scratch, "cart.mjs");
  const address = { name: "Ada Buyer", street1: "123 Main St", street2: "Unit 4", city: "Los Angeles", state: "CA", zip: "90012", country: "US" };
  const storage = new Map([[CHECKOUT_ADDRESS_KEY, JSON.stringify(address)]]);
  const original = { fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, window: globalThis.window };
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, zip = "", tree;
  const pending = [], navigations = [], listeners = new Map();
  let shippingRequests = [];
  const fixture = {
    state(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    ref(initial) {
      const index = refIndex++;
      return refs[index] ??= { current: initial };
    },
    effect(callback, dependencies) {
      const index = effectIndex++;
      if (effects[index] && dependencies.every((value, i) => Object.is(value, effects[index].dependencies[i]))) return;
      effects[index]?.cleanup?.();
      effects[index] = { dependencies, cleanup: callback() };
    },
    zip: () => [zip, setZip],
    marketplace: {
      cart: [{ productId: "model", sellerId: "store", quantity: 1, priceCents: 10000, currency: "usd", shippingMode: "calculated", shippingCents: 0, availableQuantity: 3, sellerName: "Store", title: "Model" }, { productId: "other", sellerId: "other-store", quantity: 1, priceCents: 5000, currency: "usd", shippingMode: "flat", shippingCents: 600, sellerName: "Other Store" }],
      authReady: true, collector: null, removeFromCart() {}, setQuantity() {}, clearSellerCart() {},
    },
  };
  function setZip(value) { zip = value; }
  globalThis.__cartCheckoutTest = fixture;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } });
  globalThis.window = {
    location: { assign: (url) => navigations.push(url), reload: () => navigations.push("reload") },
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event) => listeners.delete(event),
  };
  globalThis.fetch = (url, init) => !init?.body ? Promise.resolve(Response.json({ requests: shippingRequests })) : new Promise((resolve) => pending.push({ url, body: JSON.parse(init.body), resolve }));
  t.after(async () => {
    effects.forEach((effect) => effect.cleanup?.());
    delete globalThis.__cartCheckoutTest;
    globalThis.fetch = original.fetch;
    globalThis.window = original.window;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: original.sessionStorage });
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch);
  });
  const mocks = {
    react: "const f=globalThis.__cartCheckoutTest; export const useState=f.state, useRef=f.ref, useEffect=f.effect;",
    "next/link": "export default 'link';", "next/image": "export default 'image';",
    "./marketplace-provider": "export const useMarketplace=()=>globalThis.__cartCheckoutTest.marketplace;",
    "./address-fields": "export const AddressFields='address-fields';",
    "./use-shipping-zip": "export const useShippingZip=()=>globalThis.__cartCheckoutTest.zip();",
  };
  const result = await build({
    entryPoints: [join(root, "components/cart-page.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "cart-test", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "cart-mock" };
        if (path.startsWith("@/")) return { path: join(root, path.slice(2) + ".ts") };
      });
      builder.onLoad({ filter: /.*/, namespace: "cart-mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const { CartPage } = await import(pathToFileURL(bundlePath).href);
  function render(props = { automaticTax: true, taxBehavior: "exclusive" }) {
    stateIndex = refIndex = effectIndex = 0;
    tree = CartPage(props);
    return tree;
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      if (!child || typeof child !== "object") continue;
      const match = find(predicate, child);
      if (match) return match;
    }
    return null;
  }
  const delivery = () => find((node) => node.type === "address-fields");
  const form = () => find((node) => node.type === "form");
  const pay = () => find((node) => node.props?.className === "button dark checkout-button");
  const mobile = () => find((node) => node.props?.className === "cart-mobile-summary");
  const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : [node.props?.children].flat(Infinity).map(text).join(" ");
  const quoteResponse = (id) => Response.json({ quoteId: id, expiresAt: new Date(Date.now() + 60000).toISOString(), options: [{ id, provider: "Carrier", serviceLevel: "Ground", amountCents: 900, currency: "USD", estimatedDays: 3 }] });
  render();
  await Promise.resolve();
  render();
  assert.deepEqual(delivery().props.values, address);
  assert.match(text(mobile()), /Item subtotal.*\$150\.00.*shipping/);
  assert.doesNotMatch(text(mobile()), /Total before tax/, "Missing carrier rates must not look like a complete total");
  form().props.ref.current = { reportValidity: () => true };
  find((node) => node.props?.className === "consent-check checkout-consent").props.children[0].props.onChange({ target: { checked: true } });
  render();
  const oldQuote = form().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(pending[0].body.items, [{ productId: "model", quantity: 1 }], "Shipping is quoted only for the selected seller");
  render();
  assert.equal(pay().props.disabled, true);
  const updated = { ...address, street2: "Unit 5" };
  delivery().props.onChange(updated);
  render();
  assert.equal(JSON.parse(storage.get(CHECKOUT_ADDRESS_KEY)).street2, "Unit 5");
  const newQuote = form().props.onSubmit({ preventDefault() {} });
  pending[1].resolve(quoteResponse("new"));
  await newQuote;
  render();
  assert.equal(pay().props.disabled, false);
  assert.match(text(mobile()), /Total before tax.*\$165\.00/, "The mobile total includes both sellers and their shipping");
  pending[0].resolve(quoteResponse("old"));
  await oldQuote;
  render();
  const payment = pay().props.onClick();
  find(node => node.type === "button", mobile()).props.onClick();
  assert.equal(pending.length, 3, "Repeated clicks start only one payment");
  assert.equal(pending[2].url, "/api/checkout");
  assert.deepEqual(pending[2].body.items, [{ productId: "model", quantity: 1 }, { productId: "other", quantity: 1 }], "One payment includes every selected seller");
  assert.deepEqual(pending[2].body.destination, updated);
  assert.deepEqual(pending[2].body.sellerSelections, [{ sellerId: "store", shippingSelection: { quoteId: "new", rateId: "new" } }, { sellerId: "other-store", shippingSelection: { rateId: "flat" } }]);
  pending[2].resolve(Response.json({ error: "Quote expired. Calculate fresh rates." }, { status: 400 }));
  await payment;
  render();
  assert.equal(pay().props.disabled, true);
  assert.deepEqual(delivery().props.values, updated);
  assert.deepEqual(navigations, []);
  const fresh = form().props.onSubmit({ preventDefault() {} });
  pending[3].resolve(quoteResponse("fresh"));
  await fresh;
  render();
  fixture.marketplace.cart[0].quantity = 2;
  render();
  assert.equal(pay().props.disabled, true, "Changing quantity invalidates the prior shipping quote");
  listeners.get("pageshow")({ persisted: true });
  assert.deepEqual(navigations, ["reload"], "Browser back must refresh the restored payment and inventory state");

  render();
  const groups = find((node) => node.props?.className === "seller-cart-groups").props.children;
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.key), ["store", "other-store"]);

  // A pending quote must block this seller, while other sellers remain payable.
  fixture.marketplace.cart[0].shippingMode = "flat";
  fixture.marketplace.collector = { id: "buyer" };
  render();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  const requestButton = find((node) => node.type === "button" && node.props.children === "Request combined shipping quote");
  const requestSent = requestButton.props.onClick();
  const requestCall = pending.at(-1);
  assert.equal(requestCall.body.action, "request");
  shippingRequests = [{ id: "combined", sellerId: "store", viewerRole: "buyer", status: "pending", amountCents: null, expiresAt: new Date(Date.now() + 600000).toISOString(), destination: updated, items: [{ productId: "model", quantity: 2, priceCents: 10000 }], currency: "usd" }];
  requestCall.resolve(Response.json({ id: "combined", requests: shippingRequests }));
  await requestSent;
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(pay().props.disabled, true, "Payment waits for the requested shipping quote");
  assert.equal(JSON.parse(storage.get("mcc-shipping-choices-buyer")).store, "combined", "The choice survives return visits");
  find((node) => node.type === "input" && node.props.type === "checkbox").props.onChange();
  render();
  assert.equal(pay().props.disabled, false, "A waiting seller can be left in the cart");
  const payOther = pay().props.onClick();
  assert.deepEqual(pending.at(-1).body.items, [{ productId: "other", quantity: 1 }]);
  pending.at(-1).resolve(Response.json({ error: "Fixture failure" }, { status: 400 }));
  await payOther;
  render();
  find((node) => node.type === "input" && node.props.type === "checkbox").props.onChange();
  shippingRequests = [{ ...shippingRequests[0], status: "quoted", amountCents: 450, carrier: "USPS", service: "Ground", estimatedDays: 4 }];
  listeners.get("focus")();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(pay().props.disabled, false, "The approved quote can be reviewed and paid");
  const payQuote = pay().props.onClick();
  assert.deepEqual(pending.at(-1).body.sellerSelections[0].shippingSelection, { combinedRequestId: "combined" });
  pending.at(-1).resolve(Response.json({ error: "Fixture failure" }, { status: 400 }));
  await payQuote;
  fixture.marketplace.cart[0].quantity = 1;
  render();
  assert.equal(pay().props.disabled, true, "An item change invalidates the seller's quote");
  find((node) => node.type === "input" && node.props.name === "shipping-source-store" && node.props.checked === false).props.onChange();
  render();
  assert.equal(pay().props.disabled, false, "Buyer can explicitly choose standard shipping");
  assert.equal(fixture.marketplace.cart.length, 2, "Requests and payment failures preserve the cart");
  // A complete address triggers carrier rates without an extra submit, while
  // partial addresses stay quiet and a one-seller cart has no selection control.
  fixture.marketplace.collector = null;
  fixture.marketplace.cart = [{ ...fixture.marketplace.cart[0], shippingMode: "calculated" }];
  render();
  delivery().props.onChange({ ...updated, zip: "" });
  render();
  const beforeAutomatic = pending.length;
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(pending.length, beforeAutomatic, "Incomplete addresses never request rates");
  assert.equal(pay().props.disabled, true);
  assert.equal(find(node => node.type === "input" && node.props.type === "checkbox", find(node => node.props?.className === "seller-cart-selection")), null, "Single seller does not need selection controls");
  delivery().props.onChange(updated);
  render();
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(pending.length, beforeAutomatic + 1, "A valid address automatically calculates shipping");
  assert.equal(pending.at(-1).url, "/api/shipping/options");
  pending.at(-1).resolve(quoteResponse("automatic"));
  await new Promise(resolve => setImmediate(resolve));
  render();
  assert.equal(pay().props.disabled, false);

  // Fixed rates are available before an address; the next action still takes
  // the buyer to delivery details and never tries to create a payment.
  fixture.marketplace.cart = [
    { ...fixture.marketplace.cart[0], shippingMode: "flat", shippingCents: 695, modelCondition: "near_mint", packagingCondition: "good", originalBoxStatus: "included", handlingTimeBusinessDays: 1 },
    { productId: "other", sellerId: "other-store", sellerName: "Other Store", quantity: 1, priceCents: 5000, currency: "usd", shippingMode: "flat", shippingCents: 795 },
  ];
  delivery().props.onChange({ ...updated, name: "", street1: "" });
  render();
  let deliveryFocus = 0;
  delivery().props.ref.current = { focusFirstInvalid: () => deliveryFocus++ };
  const beforeDelivery = pending.length;
  const next = find(node => node.type === "button", mobile());
  assert.equal(next.props.children, "Enter delivery details");
  assert.equal(next.props.disabled, false);
  assert.match(text(mobile()), /Total before tax.*\$164\.90/);
  assert.match(text(find(node => node.props?.className === "cart-summary")), /Fixed seller rates/);
  assert.match(text(find(node => node.props?.className === "cart-item-condition")), /Near mint/);
  assert.match(text(find(node => node.props?.className === "cart-item-packaging")), /Packaging:.*Good.*Original box:.*Included/);
  assert.match(text(find(node => node.props?.className === "cart-dispatch-note")), /Dispatch within 1 business day/);
  next.props.onClick();
  const blockerLink = find(node => node.type === "a", find(node => node.props?.id === "checkout-blocker"));
  blockerLink.props.onClick({ preventDefault() {} });
  assert.equal(deliveryFocus, 2, "Both delivery shortcuts reach the first incomplete field");
  assert.equal(pending.length, beforeDelivery, "A delivery shortcut cannot start checkout");
  assert.equal(pay().props.disabled, true);
  const sellerCheckbox = id => find(node => node.type === "input" && node.props.type === "checkbox", find(node => node.type === "section" && node.key === id));
  sellerCheckbox("store").props.onChange();
  render();
  assert.match(text(mobile()), /\$57\.95/, "Unselected sellers are excluded from the visible total");
  sellerCheckbox("other-store").props.onChange();
  render();
  assert.match(text(mobile()), /Order total.*-.*Select sellers/);
  assert.equal(fixture.marketplace.cart.length, 2, "Selection never removes items");
  sellerCheckbox("store").props.onChange();
  sellerCheckbox("other-store").props.onChange();
  render({ automaticTax: true, taxBehavior: "inclusive" });
  assert.match(text(mobile()), /Total \(tax included\)/, "Tax-inclusive stores must not label their price before tax");
  fixture.marketplace.cart[1].currency = "eur";
  render();
  assert.match(text(mobile()), /Order total.*-.*Select sellers/, "Currencies are never added together");
});
