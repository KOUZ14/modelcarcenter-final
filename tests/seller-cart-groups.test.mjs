import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import { groupCartBySeller, removePurchasedItems } from "../lib/cart-groups.ts";
import { POLICY_VERSION } from "../lib/legal.ts";

test("seller groups preserve order and payment removes only purchased quantities", () => {
  const cart = [
    { productId: "a", sellerId: "one", sellerName: "One", quantity: 3 },
    { productId: "b", sellerId: "two", sellerName: "Two", quantity: 1 },
    { productId: "c", sellerId: "one", sellerName: "One", quantity: 1 },
  ];
  assert.deepEqual(groupCartBySeller(cart).map((group) => group.items.map((item) => item.productId)), [["a", "c"], ["b"]]);
  const remaining = removePurchasedItems(cart, [{ productId: "a", quantity: 2 }, { productId: "c", quantity: 1 }, { productId: null, quantity: 1 }]);
  assert.deepEqual(remaining, [{ ...cart[0], quantity: 1 }, cart[1]]);
  assert.equal(cart[0].quantity, 3);
});

test("account carts persist and merge sellers while shipping requests use one seller", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".seller-cart-test-"));
  const bundle = join(scratch, "cart.mjs");
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
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  globalThis.__sellerCartTest = { db: drizzle(binding), binding };
  t.after(async () => { delete globalThis.__sellerCartTest; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  for (const name of (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  sqlite.exec("INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('buyer', 'Buyer', 'buyer@example.test', 0, 0)");
  for (const [seller, shipping, cost] of [["one", "flat", 800], ["two", "free", 0]]) {
    sqlite.prepare(`INSERT INTO sellers (id, slug, store_name, contact_name, contact_email, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, seller_terms_version, seller_terms_accepted_at, shipping_mode, default_shipping_cents) VALUES (?, ?, ?, 'Owner', 'owner@example.test', 'active', ?, 1, 1, ?, CURRENT_TIMESTAMP, ?, ?)`).run(seller, seller, seller, `acct_${seller}`, POLICY_VERSION, shipping, cost);
    sqlite.prepare(`INSERT INTO products (id, seller_id, slug, seller_sku, title, scale, model_manufacturer, vehicle_make, vehicle_model, price_cents, inventory_quantity, status) VALUES (?, ?, ?, ?, ?, '1:18', 'Maker', 'Make', 'Model', 10000, 5, 'active')`).run(seller, seller, seller, seller, seller);
  }
  const output = await build({
    stdin: { contents: 'export { saveAccountCart, getAccountCart, mergeGuestData } from "./lib/collector-store.ts"; export { loadAuthoritativeCart } from "./lib/inventory.ts";', resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "cart-database", setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "cart-db" }));
      builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path: join(root, `${path.slice(2)}.ts`) }));
      builder.onLoad({ filter: /.*/, namespace: "cart-db" }, () => ({ contents: "export const getDb=()=>globalThis.__sellerCartTest.db; export const getD1=()=>globalThis.__sellerCartTest.binding;" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { saveAccountCart, getAccountCart, mergeGuestData, loadAuthoritativeCart } = await import(pathToFileURL(bundle).href);
  await saveAccountCart("buyer", [{ productId: "one", quantity: 2 }]);
  const merged = await mergeGuestData("buyer", { wishlist: [], cart: [{ productId: "two", quantity: 1 }] });
  assert.deepEqual(merged.cart.map((item) => item.productId).sort(), ["one", "two"]);
  assert.deepEqual((await getAccountCart("buyer")).map((item) => item.shippingMode).sort(), ["flat", "free"]);
  await assert.rejects(() => loadAuthoritativeCart([{ productId: "one", quantity: 1 }, { productId: "two", quantity: 1 }]), /one seller for this shipping request/);
  const first = await loadAuthoritativeCart([{ productId: "one", quantity: 2 }]);
  assert.equal(first.totals.shippingCents, 800, "Flat shipping charged once per seller");
  assert.equal(first.totals.subtotalCents, 20000);
  assert.equal((await loadAuthoritativeCart([{ productId: "two", quantity: 1 }])).totals.shippingCents, 0);
  await assert.rejects(() => saveAccountCart("buyer", [{ productId: "missing", quantity: 1 }]), /no longer exist/);
  assert.equal((await getAccountCart("buyer")).length, 2, "A failed save must preserve every existing seller");
  await assert.rejects(() => mergeGuestData("buyer", { wishlist: [], cart: [{ productId: "missing", quantity: 1 }] }), /no longer exist/);
  assert.equal((await getAccountCart("buyer")).length, 2, "A failed merge must not replace saved items");
  sqlite.exec("UPDATE sellers SET seller_terms_version = 'expired' WHERE id = 'two'");
  await assert.rejects(() => loadAuthoritativeCart([{ productId: "two", quantity: 1 }]), /current Seller Terms/);
  await assert.rejects(() => saveAccountCart("buyer", [{ productId: "one", quantity: 1 }, { productId: "two", quantity: 1 }]), /current Seller Terms/);
  sqlite.prepare("UPDATE sellers SET seller_terms_version = ? WHERE id = 'two'").run(POLICY_VERSION);
  await saveAccountCart("buyer", [{ productId: "two", quantity: 1 }]);
  assert.deepEqual((await getAccountCart("buyer")).map((item) => item.productId), ["two"]);
});

test("adding another seller and revisiting a paid checkout never clears unrelated items", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".cart-provider-test-"));
  const bundle = join(scratch, "provider.mjs");
  const original = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage };
  const storage = new Map(), states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const fixture = {
    state(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    ref(initial) { return refs[refIndex++] ??= { current: initial }; },
    effect(callback, dependencies) {
      const index = effectIndex++;
      if (effects[index] && dependencies.every((value, i) => Object.is(value, effects[index].dependencies[i]))) return;
      effects[index]?.cleanup?.();
      effects[index] = { dependencies, cleanup: callback() };
    },
  };
  globalThis.__cartProviderTest = fixture;
  globalThis.window = { location: { pathname: "/marketplace" } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } });
  globalThis.fetch = async (url) => { assert.equal(url, "/api/account"); return Response.json({ authenticated: false }); };
  t.after(async () => {
    effects.forEach((effect) => effect.cleanup?.());
    delete globalThis.__cartProviderTest;
    globalThis.fetch = original.fetch; globalThis.window = original.window;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original.localStorage });
    await unlink(bundle).catch(() => {}); await rmdir(scratch);
  });
  const mocks = {
    react: "const f=globalThis.__cartProviderTest; export const useState=f.state, useRef=f.ref, useEffect=f.effect, useMemo=(fn)=>fn(), useCallback=(fn)=>fn, createContext=()=>({Provider:'provider'}), useContext=()=>null;",
    "next/navigation": "export const useRouter=()=>({push(){}});",
    "@/lib/auth-client": "export const authClient={signOut:async()=>{}};",
  };
  const output = await build({
    entryPoints: [join(root, "components/marketplace-provider.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "provider-test", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "provider-mock" };
        if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) };
      });
      builder.onLoad({ filter: /.*/, namespace: "provider-mock" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { MarketplaceProvider } = await import(pathToFileURL(bundle).href);
  function render() { stateIndex = refIndex = effectIndex = 0; return MarketplaceProvider({ children: null }).props.value; }
  const product = (id, sellerId) => ({ id, sellerId, sellerName: sellerId, availableQuantity: 5, shippingMode: "flat", defaultShippingCents: 800 });
  let context = render();
  assert.equal(context.addToCart(product("a", "one")), false, "Wait for existing cart hydration before adding");
  await new Promise((resolve) => setImmediate(resolve));
  context = render();
  assert.equal(context.addToCart(product("a", "one")), true);
  context = render();
  assert.equal(context.addToCart(product("b", "two")), true);
  context = render();
  assert.deepEqual(context.cart.map((item) => item.productId), ["a", "b"]);
  assert.equal(JSON.parse(storage.get("mcc-cart-v1")).length, 2, "Both seller groups survive navigation");
  context.completeCheckout("cs_paid", [{ productId: "a", quantity: 1 }]);
  context = render();
  assert.deepEqual(context.cart.map((item) => item.productId), ["b"]);
  context.addToCart(product("a", "one"));
  context = render();
  context.completeCheckout("cs_paid", [{ productId: "a", quantity: 1 }]);
  context = render();
  assert.deepEqual(context.cart.map((item) => item.productId), ["b", "a"], "An old confirmation must not remove newly added items");
  context.clearSellerCart("two");
  context = render();
  assert.deepEqual(context.cart.map((item) => item.productId), ["a"], "Removing one group preserves other groups");
});
