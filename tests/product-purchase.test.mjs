import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("listing purchase actions share cart limits and activate the mobile bar only after scrolling past", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".purchase-test-"));
  const bundle = join(scratch, "purchase.mjs");
  const states = [], refs = [], effects = [], pending = [], calls = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, accept = true, saved = false, observer;
  const originalObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback) { observer = { callback }; this.record = observer; }
    observe(target) { this.record.target = target; }
    disconnect() { this.record.disconnected = true; }
  };
  const fixture = {
    state(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    },
    ref(initial) { return refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }); },
    effect(callback, dependencies) {
      const index = effectIndex++, previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) pending.push(() => {
        previous?.cleanup?.();
        effects[index] = { dependencies, cleanup: callback() };
      });
    },
    marketplace: {
      authReady: false, cart: [], collector: null,
      wishlistHas: () => saved, toggleWishlist: () => { saved = !saved; },
      addToCart(product) { calls.push(product); return accept; },
    },
  };
  globalThis.__purchaseTest = fixture;
  t.after(async () => {
    effects.forEach(effect => effect?.cleanup?.());
    globalThis.IntersectionObserver = originalObserver;
    delete globalThis.__purchaseTest;
    await unlink(bundle).catch(() => {});
    await rmdir(scratch);
  });
  const mocks = {
    react: "const f=globalThis.__purchaseTest; export const useState=f.state, useEffect=f.effect, useRef=f.ref;",
    "next/link": "export default 'link';",
    "./marketplace-provider": "export const useMarketplace=()=>globalThis.__purchaseTest.marketplace;",
    "./preorder-offer": "export const PreorderOffer='preorder';",
  };
  const result = await build({
    entryPoints: [join(root, "components/product-purchase.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "purchase-test", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "purchase-mock" };
        if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) };
      });
      builder.onLoad({ filter: /.*/, namespace: "purchase-mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, result.outputFiles[0].contents);
  const { ProductPurchase } = await import(pathToFileURL(bundle).href);
  const product = { id: "listing", title: "Model", priceCents: 25000, currency: "usd", availableQuantity: 3, availabilityType: "in_stock" };
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return null;
  }
  function render(overrides = {}) {
    stateIndex = refIndex = effectIndex = 0;
    const tree = ProductPurchase({ product: { ...product, ...overrides } });
    const actions = find(tree, node => node.props?.className === "purchase-actions");
    refs[0].current = actions ? { id: "purchase-actions" } : null;
    pending.splice(0).forEach(callback => callback());
    return tree;
  }
  const buy = tree => find(tree, node => node.props?.className === "button dark buy-button");
  const sticky = tree => find(tree, node => node.props?.className === "product-sticky-purchase");
  const save = tree => find(tree, node => node.props?.["aria-label"] === "Save listing");

  let tree = render();
  assert.equal(buy(tree).props.disabled, true);
  buy(tree).props.onClick();
  assert.equal(calls.length, 0, "Do not write before cart hydration");
  observer.callback([{ isIntersecting: false, boundingClientRect: { bottom: 900 } }]);
  assert.equal(sticky(render()), null, "A purchase section below the viewport must not show the bar");
  observer.callback([{ isIntersecting: false, boundingClientRect: { bottom: -1 } }]);
  tree = render();
  assert.ok(sticky(tree));
  fixture.marketplace.authReady = true;
  tree = render();
  buy(sticky(tree)).props.onClick();
  assert.deepEqual(calls, [product], "The sticky button uses the same shared cart action");
  tree = render();
  assert.equal(buy(tree).props.disabled, true);
  assert.equal(buy(sticky(tree)).props.disabled, true, "Both controls prevent repeat taps during feedback");
  buy(tree).props.onClick();
  assert.equal(calls.length, 1);
  save(tree).props.onClick();
  assert.equal(save(render()).props["aria-pressed"], true);

  states[0] = false;
  accept = false;
  buy(render()).props.onClick();
  assert.equal(buy(render()).props.disabled, false, "A rejected addition can be retried");
  for (const [availableQuantity, quantity] of [[3, 3], [20, 10]]) {
    fixture.marketplace.cart = [{ productId: product.id, quantity }];
    tree = render({ availableQuantity });
    assert.equal(buy(tree).props.href, "/cart");
    assert.equal(buy(sticky(tree)).props.href, "/cart", "Stock and quantity limits offer a route to the existing cart");
  }
  observer.callback([{ isIntersecting: true, boundingClientRect: { bottom: 50 } }]);
  assert.equal(sticky(render()), null, "Returning to the main action restores normal navigation");
  for (const overrides of [{ availableQuantity: 0 }, { availabilityType: "preorder" }]) {
    tree = render(overrides);
    assert.equal(buy(tree), null);
    assert.equal(sticky(tree), null);
  }
  assert.equal(observer.disconnected, true, "Observers are cleaned up when the listing cannot be purchased");
});
