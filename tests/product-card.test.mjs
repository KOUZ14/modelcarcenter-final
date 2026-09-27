import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("product cards add directly to the shared cart and respect purchase restrictions", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".product-card-test-"));
  const bundlePath = join(scratch, "card.mjs");
  const states = [], cleanups = [], calls = [], removals = [];
  let stateIndex = 0, accept = true, productClicks = 0;
  const fixture = {
    state(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    effect(callback) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
    marketplace: {
      authReady: false, cart: [], wishlistHas: () => false, toggleWishlist(id) { removals.push(id); },
      addToCart(product) { calls.push(product); return accept; },
    },
  };
  globalThis.__productCardTest = fixture;
  t.after(async () => {
    cleanups.forEach((cleanup) => cleanup());
    delete globalThis.__productCardTest;
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch);
  });
  const mocks = {
    react: "const f=globalThis.__productCardTest; export const useState=f.state, useEffect=f.effect;",
    "next/link": "export default 'link';", "next/image": "export default 'image';",
    "./marketplace-provider": "export const useMarketplace=()=>globalThis.__productCardTest.marketplace;",
  };
  const result = await build({
    stdin: { contents: "export { ProductCard } from './components/product-card.tsx'; export { SavedListingCard } from './components/saved-listing-card.tsx';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "card-test", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "card-mock" };
        if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) };
      });
      builder.onLoad({ filter: /.*/, namespace: "card-mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const { ProductCard, SavedListingCard } = await import(pathToFileURL(bundlePath).href);
  const product = { id: "model", slug: "model", title: "Long model title", availableQuantity: 3, priceCents: 7500, currency: "usd", modelCondition: "new", availabilityType: "in_stock" };
  function render(overrides = {}) {
    stateIndex = 0;
    return ProductCard({ product: { ...product, ...overrides }, onProductClick: () => { productClicks++; } });
  }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return null;
  }
  const buy = (tree) => find(tree, (node) => node.type === "button" && node.props.className === "product-quick-add");
  const status = (tree) => find(tree, (node) => node.props?.role === "status").props.children;

  let tree = render();
  assert.equal(buy(tree).props.disabled, true, "Existing cart must hydrate before adding");
  buy(tree).props.onClick();
  assert.equal(calls.length, 0);
  fixture.marketplace.authReady = true;
  tree = render();
  assert.equal(buy(tree).props.disabled, false, "Guest users can add without signing in");
  buy(tree).props.onClick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], product);
  assert.equal(productClicks, 0, "Adding does not navigate to or record a product-page visit");
  tree = render();
  assert.match(status(tree), /added to cart/);
  assert.equal(buy(tree).props.disabled, true, "Feedback prevents accidental repeat taps");
  buy(tree).props.onClick();
  assert.equal(calls.length, 1);

  states.length = 0;
  accept = false;
  buy(render()).props.onClick();
  tree = render();
  assert.equal(status(tree), "", "A rejected cart write must not announce success");
  assert.equal(buy(tree).props.disabled, false, "A rejected addition can be retried");

  for (const [availableQuantity, quantity] of [[3, 3], [20, 10]]) {
    fixture.marketplace.cart = [{ productId: product.id, quantity }];
    tree = render({ availableQuantity });
    assert.equal(buy(tree).props.disabled, true, "Respect both available stock and the ten-item cap");
    const before = calls.length;
    buy(tree).props.onClick();
    assert.equal(calls.length, before);
  }
  fixture.marketplace.cart = [{ productId: product.id, quantity: 1 }];
  assert.equal(buy(render()).props.disabled, false, "Additional units remain available below the limit");

  for (const [overrides, label] of [[{ availableQuantity: 0 }, "View details"], [{ availabilityType: "preorder" }, "View preorder"]]) {
    tree = render(overrides);
    assert.equal(buy(tree), null, "Sold-out items and preorders cannot be added directly");
    const link = find(tree, (node) => node.props?.className === "product-quick-add secondary");
    assert.equal(link.props.children, label);
    assert.equal(link.props.href, "/products/model");
  }

  await t.test("storefront cards add the selected seller's offer through the same stock checks", () => {
    states.length = 0;
    fixture.marketplace.cart = [];
    accept = true;
    const before = calls.length;
    stateIndex = 0;
    const storefrontProduct = { ...product, sellerId: "seller-a" };
    const storefront = ProductCard({ product: storefrontProduct, storefront: true });
    buy(storefront).props.onClick();
    assert.deepEqual(calls[before], storefrontProduct);
    assert.equal(productClicks, 0);
    states.length = 0;
    fixture.marketplace.cart = [{ productId: product.id, quantity: 3 }];
    stateIndex = 0;
    const full = ProductCard({ product: storefrontProduct, storefront: true });
    assert.equal(buy(full).props.disabled, true);
    buy(full).props.onClick();
    assert.equal(calls.length, before + 1);
  });

  await t.test("saved listing rows keep cart restrictions and remove only the selected listing", () => {
    states.length = 0;
    calls.length = 0;
    accept = true;
    fixture.marketplace.cart = [];
    fixture.marketplace.authReady = false;
    const renderSaved = (overrides = {}) => {
      stateIndex = 0;
      return SavedListingCard({ product: { ...product, ...overrides } });
    };
    const action = (row) => find(row, (node) => node.props?.className?.includes("saved-listing-buy"));
    let row = renderSaved();
    assert.equal(action(row).props.disabled, true);
    action(row).props.onClick();
    assert.equal(calls.length, 0, "Do not add before the persisted cart loads");

    fixture.marketplace.authReady = true;
    action(renderSaved()).props.onClick();
    assert.deepEqual(calls, [product], "Guests can add the specific seller's listing");
    row = renderSaved();
    assert.match(status(row), /added to cart/);
    assert.equal(action(row).props.disabled, true);
    action(row).props.onClick();
    assert.equal(calls.length, 1, "Prevent repeated taps during feedback");

    states.length = 0;
    accept = false;
    action(renderSaved()).props.onClick();
    assert.equal(status(renderSaved()), "", "Do not report a rejected addition as successful");
    const before = calls.length;
    for (const [availableQuantity, quantity] of [[3, 3], [20, 10]]) {
      fixture.marketplace.cart = [{ productId: product.id, quantity }];
      row = renderSaved({ availableQuantity });
      assert.equal(action(row).type, "link");
      assert.equal(action(row).props.href, "/cart", "At the stock or quantity limit, offer the existing cart");
    }
    fixture.marketplace.cart = [];
    for (const overrides of [{ availableQuantity: 0 }, { availabilityType: "preorder" }]) {
      row = renderSaved(overrides);
      assert.equal(action(row).type, "link");
      assert.equal(action(row).props.href, "/products/model");
    }
    row = renderSaved();
    find(row, (node) => node.props?.className === "saved-listing-remove").props.onClick();
    assert.deepEqual(removals, [product.id]);
    assert.equal(calls.length, before, "Unavailable items and removal do not add anything to the cart");
  });
});
