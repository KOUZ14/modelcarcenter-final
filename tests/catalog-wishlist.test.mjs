import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("wanted-model search requires an account and updates only after a successful response", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".wanted-model-test-"));
  const bundle = join(scratch, "wishlist.mjs");
  const originalFetch = globalThis.fetch, states = [], writes = [];
  const model = { id: "release", title: "Nissan Fairlady Z", scale: "1:18", modelManufacturer: "AUTOart" };
  let index = 0, effect, cleanup, rejectWrite = false;
  const fixture = {
    marketplace: { collector: null },
    state(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (value) => { states[slot] = value; }];
    },
    effect(callback) { effect = callback; },
  };
  globalThis.__wantedModelTest = fixture;
  globalThis.fetch = async (url, options = {}) => {
    if (!options.method) {
      assert.equal(url, "/api/catalog-products?q=Nissan");
      return Response.json({ products: [model] });
    }
    assert.equal(url, "/api/collectors");
    assert.equal(options.method, "POST");
    writes.push(JSON.parse(options.body));
    return rejectWrite ? Response.json({ error: "Please try again." }, { status: 503 }) : Response.json({});
  };
  t.after(async () => {
    cleanup?.();
    globalThis.fetch = originalFetch;
    delete globalThis.__wantedModelTest;
    await unlink(bundle).catch(() => {});
    await rmdir(scratch);
  });
  const mocks = {
    react: "const f=globalThis.__wantedModelTest; export const useState=f.state, useEffect=f.effect, useId=()=> 'wanted-model-test';",
    "next/link": "export default 'link';",
    "next/navigation": "export const useSearchParams=()=>new URLSearchParams('addWanted=1&wantedSearch=Nissan');",
    "./marketplace-provider": "export const useMarketplace=()=>globalThis.__wantedModelTest.marketplace;",
  };
  const output = await build({
    entryPoints: [join(root, "components/catalog-wishlist.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "wanted-model-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "fixture" };
        if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { CatalogWishlist } = await import(pathToFileURL(bundle).href);
  const props = { models: [], loading: false, error: "", compact: true, onChange(models) { props.models = models; }, onRetry() {} };
  const render = () => { index = 0; return CatalogWishlist(props); };
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return null;
  }
  const add = (tree) => find(tree, node => node.type === "button" && node.props.children === "Add to wanted models");
  const flush = () => new Promise(resolve => setImmediate(resolve));
  render(); cleanup = effect(); await flush();
  let tree = render();
  assert.equal(add(tree), null, "Guests cannot write to account-only wanted models");
  const signIn = find(tree, node => node.type === "link" && node.props.children === "Sign in to add");
  assert.equal(new URL(signIn.props.href, "https://mcc.test").searchParams.get("returnTo"), "/wishlist?addWanted=1&wantedSearch=Nissan");

  fixture.marketplace.collector = { id: "collector" };
  props.loading = true;
  tree = render();
  assert.equal(add(tree).props.disabled, true);
  add(tree).props.onClick(); await flush();
  assert.equal(writes.length, 0, "Wait for the account's existing wanted models before modifying them");

  props.loading = false; rejectWrite = true;
  add(render()).props.onClick(); await flush();
  assert.deepEqual(props.models, [], "A failed addition does not change the list or its count");
  assert.equal(find(render(), node => node.props?.role === "alert").props.children, "Please try again.");

  rejectWrite = false;
  add(render()).props.onClick(); await flush();
  assert.deepEqual(props.models, [model]);
  assert.deepEqual(writes.at(-1), { action: "wishlist", catalogId: model.id, enabled: true });
  tree = render();
  assert.equal(find(tree, node => node.type === "button" && node.props.children === "Added to wanted models").props.disabled, true);
  find(tree, node => node.props?.className === "wanted-model-remove").props.onClick(); await flush();
  assert.deepEqual(props.models, []);
  assert.deepEqual(writes.at(-1), { action: "wishlist", catalogId: model.id, enabled: false });
});
