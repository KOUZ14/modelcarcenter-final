import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { securityDatabase } from "./fixtures/security-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
async function bundle(t, entry, mocks) {
  const scratch = await mkdtemp(join(root, ".sites-runtime/collector-handling-")), file = join(scratch, "test.mjs");
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "collector-handling-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
      builder.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  return import(pathToFileURL(file).href);
}

test("collector handling settings require the owner, validate days, and preserve existing order deadlines", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const account = { user: { id: "owner" } };
  globalThis.__collectorHandling = { db: drizzle(binding), binding, account };
  t.after(() => { delete globalThis.__collectorHandling; });
  const { POST, getGarageData, config } = await bundle(t, "export {POST} from './app/api/account/shipping/route.ts'; export {getGarageData} from './lib/collector-store.ts'; export {config} from './lib/config.ts';", {
    "@/db": "export const getDb=()=>globalThis.__collectorHandling.db; export const getD1=()=>globalThis.__collectorHandling.binding;",
    "@/lib/collector-auth": "export const requireCollectorApi=async()=>globalThis.__collectorHandling.account;",
    "cloudflare:workers": "export const env={DB:globalThis.__collectorHandling.binding};",
  });
  config.siteUrl = "https://marketplace.test";
  for (const id of ["owner", "other", "professional", "buyer"]) sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  for (const id of ["owner", "other", "professional"]) sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type) VALUES (?,?,?,?,?,?,'approved',?)").run(id, id, id, id, id, `${id}@example.test`, id === "professional" ? "professional" : "collector");
  sqlite.exec("INSERT INTO orders (id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,payment_status,ship_by_at) VALUES ('paid','MCC-PAID','owner','cs_fixture','buyer@example.test','usd',1000,0,70,1000,'paid','2026-11-12T23:59:59Z')");
  const request = (handlingTimeBusinessDays, extra = {}, origin = config.siteUrl) => new Request(`${config.siteUrl}/api/account/shipping`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ handlingTimeBusinessDays, ...extra }) });
  const days = id => sqlite.prepare("SELECT handling_time_business_days FROM sellers WHERE id=?").get(id).handling_time_business_days;

  globalThis.__collectorHandling.account = new Response("Unauthorized", { status: 401 });
  assert.equal((await POST(request(5))).status, 401);
  globalThis.__collectorHandling.account = account;
  assert.equal((await POST(request(5, {}, "https://foreign.test"))).status, 403);
  assert.equal(days("owner"), 3);
  for (const value of [0, 11, -1, 2.5, "", "3.5", "tomorrow", null, true, [3], {}]) {
    const invalid = await POST(request(value));
    assert.equal(invalid.status, 400, JSON.stringify(value));
    assert.match((await invalid.json()).error, /whole number between 1 and 10/);
    assert.equal(days("owner"), 3);
  }
  for (const id of ["buyer", "professional"]) {
    globalThis.__collectorHandling.account = { user: { id } };
    assert.equal((await POST(request(5, { sellerId: "owner" }))).status, 403);
  }
  globalThis.__collectorHandling.account = account;
  for (const value of ["1", 10, 7]) {
    const response = await POST(request(value, { sellerId: "other", userId: "other", shipByAt: "2099-01-01" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).handlingTimeBusinessDays, Number(value));
    assert.equal(days("owner"), Number(value));
    assert.equal(days("other"), 3);
    assert.equal(days("professional"), 3);
    const garage = await getGarageData("owner");
    assert.equal(garage.seller.handlingTimeBusinessDays, Number(value), "Saved settings survive a dashboard reload");
    assert.equal(garage.sales[0].shipByAt, "2026-11-12T23:59:59Z", "Changing handling time never extends a paid order");
  }
});

test("collector shipping form saves once, preserves failed edits, and refreshes after success", async t => {
  const originalFetch = globalThis.fetch;
  const states = [], refs = [], pending = []; let stateIndex = 0, refIndex = 0, refreshes = 0;
  globalThis.__collectorHandlingUi = {
    state(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
    ref(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    router: { refresh() { refreshes++; } },
  };
  globalThis.fetch = async (url, options) => new Promise(resolve => { pending.push({ url, body: JSON.parse(options.body), resolve }); });
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.__collectorHandlingUi; });
  const { CollectorShippingSettings } = await bundle(t, "export {CollectorShippingSettings} from './components/collector-shipping-settings.tsx';", {
    react: "export const useState=globalThis.__collectorHandlingUi.state,useRef=globalThis.__collectorHandlingUi.ref;",
    "next/navigation": "export const useRouter=()=>globalThis.__collectorHandlingUi.router;",
    "next/link": "export default 'a';",
  });
  function find(tree, predicate) {
    if (!tree || typeof tree !== "object") return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  const render = () => { stateIndex = refIndex = 0; return CollectorShippingSettings({ handlingTimeBusinessDays: 3 }); };
  const field = tree => find(tree, node => node.type === "select");
  const submit = tree => find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} });
  let tree = render();
  assert.equal(find(tree, node => node.type === "button").props.disabled, true);
  field(tree).props.onChange({ target: { value: "6" } }); tree = render();
  const first = submit(tree); await submit(tree);
  assert.equal(pending.length, 1, "Double submissions send only one request");
  assert.equal(pending[0].url, "/api/account/shipping");
  assert.deepEqual(pending[0].body, { handlingTimeBusinessDays: 6 });
  assert.equal(field(render()).props.disabled, true);
  pending[0].resolve(Response.json({ error: "Please try again." }, { status: 500 })); await first;
  tree = render(); assert.equal(field(tree).props.value, "6");
  assert.equal(find(tree, node => node.props?.role === "alert").props.children, "Please try again.");
  assert.equal(refreshes, 0);
  const retry = submit(tree);
  pending[1].resolve(Response.json({ ok: true, handlingTimeBusinessDays: 6 })); await retry;
  tree = render();
  assert.equal(refreshes, 1);
  assert.match(find(tree, node => node.props?.role === "status").props.children, /Saved.*6 business days/);
  assert.equal(find(tree, node => node.type === "button").props.disabled, true);
});
