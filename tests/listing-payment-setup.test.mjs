import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { build } from "esbuild";
import { POLICY_VERSION } from "../lib/legal.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
function find(tree, match) {
  if (!tree || typeof tree !== "object") return undefined;
  if (match(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, match);
    if (found) return found;
  }
}
async function bundle(t, contents, mocks) {
  const scratch = await mkdtemp(join(root, ".sites-runtime/listing-payment-test-"));
  const file = join(scratch, "test.mjs");
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents, resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "listing-payment-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
    } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  return import(pathToFileURL(file).href);
}

test("connecting payments saves the collector's current listing and photos before leaving", async t => {
  const originals = Object.fromEntries(["fetch", "FormData", "window", "location", "history"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class extends NativeFormData {
    constructor(form) { super(); for (const [key, value] of Object.entries(form?.values ?? {})) this.set(key, value); }
  };
  const calls = [], navigations = [];
  const savedPhoto = name => ({ id: name, url: `/media/${name}`, alt: name });
  const savedAddress = { id: "address", label: "Home", street1: "10 Model Lane", street2: null, city: "Burbank", region: "CA", postalCode: "91501", country: "US", phone: "5555550100", isDefault: true };
  let failSave = false, failPhoto = "", failConnection = false, waitForPhoto, reviewErrors;
  globalThis.location = { search: "" };
  globalThis.history = { replaceState(_state, _title, path) { location.search = new URL(path, "https://marketplace.test").search; } };
  globalThis.window = { location: { assign: url => navigations.push(url) } };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/listings/images") {
      const name = options.body.get("images").name;
      calls.push({ action: "photo", name, productId: options.body.get("productId"), makePrimary: options.body.get("makePrimary") });
      if (waitForPhoto) { const wait = waitForPhoto; waitForPhoto = undefined; await wait; }
      return name === failPhoto ? Response.json({ error: "Photo upload failed." }, { status: 503 }) : Response.json({ images: [savedPhoto(name)] });
    }
    assert.equal(url, "/api/listings");
    const payload = JSON.parse(options.body); calls.push(payload);
    if (payload.action === "save") return failSave
      ? Response.json({ error: "Check your address.", fields: { shippingOriginCity: "Enter a city." } }, { status: 400 })
      : Response.json({ productId: payload.productId || "saved-listing", shipFromAddress: savedAddress });
    if (payload.action === "stripe_onboarding") return failConnection
      ? Response.json({ error: "Payment provider unavailable." }, { status: 503 })
      : Response.json({ onboardingUrl: "https://connect.stripe.test/setup" });
    assert.equal(payload.action, "submit");
    return reviewErrors ? Response.json({ error: "Complete your seller profile.", fields: reviewErrors }, { status: 400 }) : Response.json({ ok: true });
  };
  globalThis.__listingPaymentUi = { hooks: null };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.__listingPaymentUi;
  });
  const { CollectorListingForm } = await bundle(t, "export {CollectorListingForm} from './components/collector-listing-form.tsx';", {
    react: "export const useState=(...args)=>globalThis.__listingPaymentUi.hooks.state(...args),useRef=(...args)=>globalThis.__listingPaymentUi.hooks.ref(...args),useEffect=(...args)=>globalThis.__listingPaymentUi.hooks.effect(...args);",
    "next/link": "export default 'a';",
    "./catalog-model-picker": "export const CatalogModelPicker='catalog-picker';",
    "./seller-fee-disclosure": "export const SellerFeeDisclosure='fee-disclosure';",
    "@/components/collectible-listing-fields": "export const CollectibleListingFields='condition-fields',RequiredPhotoChecklist='photo-checklist';",
    "@/components/product-image-fields": "export const ProductImageFields='photo-fields';",
    "./listing-buyer-preview": "export const ListingBuyerPreview='buyer-preview';",
    "./address-fields": "export const AddressFields='address-fields';",
  });
  function editor(overrides = {}) {
    calls.length = navigations.length = 0;
    failSave = failConnection = false; failPhoto = "";
    reviewErrors = undefined;
    location.search = "?collectionItem=piece&selling=open_to_offers&minimum=125";
    const states = [], effects = []; let index = 0;
    const hooks = {
      state(initial) { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial; return [states[slot], next => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }]; },
      ref(initial) { const slot = index++; if (!(slot in states)) states[slot] = { current: initial }; return states[slot]; },
      effect(callback) { effects.push(callback); },
    };
    const props = { initial: null, seller: null, shipFromAddresses: [], displayName: "Alex", prefill: {}, marketplaceFeeBps: 1000, collectionCatalog: { catalogProductId: "catalog" }, ...overrides };
    const form = { controls: [], querySelectorAll() { return this.controls; }, values: { title: "My McLaren", description: "Original box", price: "175.00", quantity: "1", catalogProductId: "catalog", photoFrontChecked: "on" } };
    let tree;
    const render = () => {
      index = 0; globalThis.__listingPaymentUi.hooks = hooks; tree = CollectorListingForm(props);
      find(tree, node => node.type === "form").props.ref.current = form;
      for (const effect of effects.splice(0)) effect();
      return tree;
    };
    render();
    return {
      render, form,
      node: match => find(tree, match),
      accept() { find(tree, node => node.type === "input" && node.props.checked !== undefined).props.onChange({ target: { checked: true } }); render(); },
      photos(names) { find(tree, node => node.type === "photo-fields").props.onFilesChange(names.map(name => new File([name], name, { type: "image/jpeg" }))); render(); },
      save(value = "connect") {
        if (value === "connect") return find(tree, node => node.type === "button" && /Connect payout account|Saving draft/.test(node.props.children)).props.onClick();
        return find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: form, nativeEvent: { submitter: { value } } });
      },
    };
  }

  await t.test("save and every photo complete before redirect; repeated clicks create one draft", async () => {
    const ui = editor(); ui.accept(); ui.photos(["front.jpg", "back.jpg"]);
    let releasePhoto; waitForPhoto = new Promise(resolve => { releasePhoto = resolve; });
    const pending = ui.save(); await ui.save();
    await new Promise(resolve => setImmediate(resolve));
    ui.render();
    assert.deepEqual(calls.map(call => call.action), ["save", "photo"]);
    assert.equal(ui.node(node => node.type === "fieldset").props.disabled, true);
    assert.deepEqual(navigations, []);
    assert.equal(new URLSearchParams(location.search).get("id"), "saved-listing");
    releasePhoto(); await pending;
    assert.deepEqual(calls.map(call => call.action), ["save", "photo", "photo", "stripe_onboarding"]);
    assert.equal(calls[0].description, "Original box"); assert.equal(calls[0].price, "175.00"); assert.equal(calls[0].photoFrontChecked, "on");
    assert.ok(calls.slice(1).every(call => call.productId === "saved-listing"));
    assert.equal(calls.at(-1).sellerTermsVersion, POLICY_VERSION);
    assert.equal(calls.at(-1).collectionItem, "piece"); assert.equal(calls.at(-1).selling, "open_to_offers"); assert.equal(calls.at(-1).minimum, "125");
    assert.deepEqual(navigations, ["https://connect.stripe.test/setup"]);
  });

  await t.test("validation and consent failures keep entries and photos on the form", async () => {
    const ui = editor(); ui.photos(["front.jpg"]);
    assert.equal(ui.node(node => node.props?.children === "Connect payout account").props.type, "button");
    await ui.save(); assert.equal(calls.length, 0);
    ui.accept(); failSave = true;
    let addressErrors;
    ui.node(node => node.type === "address-fields").props.ref.current = { setErrors: errors => { addressErrors = errors; } };
    await ui.save(); ui.render();
    assert.deepEqual(calls.map(call => call.action), ["save"]);
    assert.deepEqual(addressErrors, { shippingOriginCity: "Enter a city." });
    assert.equal(ui.node(node => node.props?.className === "listing-error-summary" || node.props?.className === "form-error listing-error-summary").props.role, "alert");
    assert.equal(ui.node(node => node.type === "photo-fields").props.files[0].name, "front.jpg");
    assert.equal(ui.form.values.description, "Original box"); assert.deepEqual(navigations, []);
  });

  await t.test("missing disclosures stop the request, open their section and focus the first field", async () => {
    const ui = editor(); ui.accept();
    const section = { tagName: "DETAILS", open: false };
    let focused, scrolled;
    ui.form.controls = ["missingParts", "defects"].map(name => ({
      name, value: "  ", required: true, willValidate: true, validity: { valid: true }, parentElement: section,
      getAttribute(key) { return key === "name" ? name : null; }, matches() { return false; },
      focus() { focused = name; }, scrollIntoView() { scrolled = name; },
    }));
    await ui.save("submit"); ui.render();
    assert.deepEqual(calls, []);
    assert.equal(section.open, true); assert.equal(focused, "missingParts"); assert.equal(scrolled, "missingParts");
    const errors = ui.node(node => node.type === "condition-fields").props.errors;
    assert.match(errors.missingParts, /None known/); assert.match(errors.defects, /None known/);
    ui.form.controls.forEach(field => { field.value = "None known"; });
    await ui.save("save"); ui.render();
    assert.deepEqual(calls.map(call => call.action), ["save"]);
    assert.deepEqual(ui.node(node => node.type === "condition-fields").props.errors, {});
  });

  await t.test("review errors highlight and open nested seller fields after the draft is saved", async () => {
    const ui = editor({ seller: { status: "active", stripeChargesEnabled: true, stripePayoutsEnabled: true } }); ui.accept();
    const outer = { tagName: "DETAILS", open: false };
    const inner = { tagName: "DETAILS", open: false, parentElement: outer };
    let focused = false;
    ui.form.controls = [{ name: "sellerDescription", value: "Short", required: false, willValidate: true, validity: { valid: true }, parentElement: inner,
      getAttribute(key) { return key === "name" ? "sellerDescription" : null; }, matches() { return false; },
      focus() { focused = true; }, scrollIntoView() {},
    }];
    reviewErrors = { sellerDescription: "Introduce yourself to buyers in at least 30 characters." };
    await ui.save("submit"); ui.render();
    assert.deepEqual(calls.map(call => call.action), ["save", "submit"]);
    assert.equal(outer.open, true); assert.equal(inner.open, true); assert.equal(focused, true);
    assert.equal(ui.node(node => node.props?.name === "sellerDescription").props["aria-invalid"], true);
    assert.equal(ui.node(node => node.props?.name === "sellerDescription").props["aria-describedby"], "listing-error-sellerDescription");
  });

  await t.test("partial uploads keep the saved draft and retry only the remaining photos", async () => {
    const ui = editor(); ui.accept(); ui.photos(["front.jpg", "back.jpg"]); failPhoto = "back.jpg";
    await ui.save(); ui.render();
    assert.deepEqual(navigations, []); assert.ok(!calls.some(call => call.action === "stripe_onboarding"));
    const photos = ui.node(node => node.type === "photo-fields").props;
    assert.equal(photos.productId, "saved-listing"); assert.deepEqual(photos.images, [savedPhoto("front.jpg")]);
    assert.deepEqual(photos.files.map(file => file.name), ["back.jpg"]);
    assert.equal(new URLSearchParams(location.search).get("id"), "saved-listing");
    failPhoto = ""; await ui.save();
    assert.equal(calls.filter(call => call.action === "save")[1].productId, "saved-listing");
    assert.equal(calls.filter(call => call.action === "photo" && call.name === "front.jpg").length, 1);
    assert.deepEqual(navigations, ["https://connect.stripe.test/setup"]);
  });

  await t.test("provider failures preserve existing listing edits and photos for retry", async () => {
    const ui = editor({ initial: { product: { id: "existing", catalogProductId: "catalog" }, images: [savedPhoto("old.jpg")] } });
    ui.accept(); ui.photos(["new.jpg"]); failConnection = true;
    await ui.save(); ui.render();
    assert.equal(calls[0].productId, "existing"); assert.equal(calls.at(-1).productId, "existing");
    assert.equal(ui.node(node => node.type === "photo-fields").props.images.length, 2);
    assert.deepEqual(navigations, []);
    assert.match(ui.node(node => node.props?.role === "alert").props.children, /unavailable/);
    failConnection = false; await ui.save();
    assert.equal(calls.filter(call => call.action === "photo").length, 1);
    assert.equal(calls.filter(call => call.action === "save")[1].productId, "existing");
  });

  await t.test("a new cover is uploaded first and keeps cover priority after a partial failure", async () => {
    const ui = editor({ initial: { product: { id: "existing", catalogProductId: "catalog" }, images: [savedPhoto("old.jpg")] } });
    ui.photos(["detail.jpg", "cover.jpg"]);
    let gallery = ui.node(node => node.type === "photo-fields").props;
    gallery.onCoverFileChange(gallery.files[1]); ui.render();
    failPhoto = "detail.jpg";
    await ui.save("save"); ui.render();
    const upload = calls.find(call => call.action === "photo");
    assert.equal(upload.name, "cover.jpg"); assert.equal(upload.makePrimary, "true");
    gallery = ui.node(node => node.type === "photo-fields").props;
    assert.equal(gallery.images[0].id, "cover.jpg"); assert.equal(gallery.primaryImageUrl, "/media/cover.jpg");
    assert.equal(gallery.pendingCover, null); assert.deepEqual(gallery.files.map(file => file.name), ["detail.jpg"]);
    failPhoto = ""; await ui.save("save"); ui.render();
    assert.equal(calls.filter(call => call.action === "photo" && call.name === "cover.jpg").length, 1);
    assert.equal(ui.node(node => node.type === "photo-fields").props.images[0].id, "cover.jpg");
  });

  await t.test("ordinary saving and submission retain their separate behavior", async () => {
    let ui = editor(); await ui.save("save"); assert.deepEqual(calls.map(call => call.action), ["save"]);
    ui = editor({ seller: { status: "active", stripeChargesEnabled: true, stripePayoutsEnabled: true }, paymentSetup: "returned" });
    assert.equal(ui.node(node => node.props?.id === "listing-review").props.open, true);
    assert.match(ui.node(node => node.props?.className === "admin-message").props.children, /saved.*connected/);
    ui.accept(); await ui.save("submit"); assert.deepEqual(calls.map(call => call.action), ["save", "submit"]);
    assert.deepEqual(navigations, []);
  });
});

test("payment links and Stripe returns resume the owned draft with fresh payment status", async t => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", file), "utf8"));
  const binding = { prepare(query) { let values = []; return {
    bind(...params) { values = params; return this; },
    async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
    async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
    async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
  }; } };
  sqlite.exec("INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('catalog','AUTOart','autoart','1:18','McLaren','F1','McLaren F1')");
  for (const id of ["owner", "other"]) {
    sqlite.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
    sqlite.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type,stripe_account_id) VALUES (?,?,?,?,?,?,'onboarding','collector',?)").run(id, id, id, id, id, `${id}@example.test`, `acct_${id}`);
    sqlite.prepare("INSERT INTO products (id,seller_id,slug,seller_sku,catalog_product_id,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,status,description) VALUES (?,?,?,?,'catalog','My McLaren','1:18','AUTOart','McLaren','F1',17500,'draft','Original box')").run(id, id, id, id);
    sqlite.prepare("INSERT INTO product_images (id,product_id,url) VALUES (?,?,?)").run(id, id, `/media/${id}.jpg`);
  }
  const links = [], refreshes = [];
  let ready = true, failRefresh = false;
  globalThis.__listingPaymentServer = {
    db: drizzle(binding), binding,
    collector: { user: { id: "owner", email: "owner@example.test", emailVerified: true }, profile: { displayName: "Alex", bio: "" } },
    async link(...args) { links.push(args); return { url: "https://connect.stripe.test/setup" }; },
    async account(id) { refreshes.push(id); if (failRefresh) throw Error("Provider unavailable"); return { charges_enabled: ready, payouts_enabled: ready }; },
  };
  t.after(() => { sqlite.close(); delete globalThis.__listingPaymentServer; });
  const { POST, SellModelPage } = await bundle(t, "export {POST} from './app/api/listings/route.ts'; export {default as SellModelPage} from './app/sell/model/page.tsx';", {
    "@/db": "export const getDb=()=>globalThis.__listingPaymentServer.db,getD1=()=>globalThis.__listingPaymentServer.binding;",
    "@/lib/collector-auth": "export const requireCollectorApi=async()=>globalThis.__listingPaymentServer.collector,requireCollector=requireCollectorApi;",
    "./stripe": "export const createAccountOnboardingLink=(...args)=>globalThis.__listingPaymentServer.link(...args),retrieveStripeAccount=(...args)=>globalThis.__listingPaymentServer.account(...args),createConnectedAccount=async()=>{throw Error('Should reuse the connected account')};",
    "@/components/collector-listing-form": "export const CollectorListingForm='listing-form';",
    "@/components/site-header": "export const SiteHeader='header';",
    "@/components/site-footer": "export const SiteFooter='footer';",
    "@/lib/community": "export const getPiece=async()=>({id:'piece',ownerId:'owner'});",
    "next/navigation": "export const notFound=()=>{throw Error('Not found')};",
  });
  const request = payload => POST(new Request("https://marketplace.test/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stripe_onboarding", sellerTermsVersion: POLICY_VERSION, ...payload }) }));
  const page = query => SellModelPage({ searchParams: Promise.resolve(query) });

  await t.test("return and expired-link destinations identify the saved listing and collection context", async () => {
    assert.equal((await request({ productId: "owner", collectionItem: "piece", selling: "open_to_offers", minimum: "125" })).status, 200);
    assert.equal(links[0][0], "acct_owner");
    for (const [index, state] of [[1, "returned"], [2, "refresh"]]) {
      const url = new URL(links[0][index], "https://marketplace.test");
      assert.equal(url.pathname, "/sell/model"); assert.equal(url.hash, "#listing-review");
      assert.deepEqual(Object.fromEntries(url.searchParams), { id: "owner", collectionItem: "piece", selling: "open_to_offers", minimum: "125", stripe: state });
    }
    assert.equal(sqlite.prepare("SELECT status FROM products WHERE id='owner'").get().status, "draft");
  });

  await t.test("foreign or missing drafts and missing terms cannot start payment setup", async () => {
    const count = links.length;
    for (const productId of ["other", "missing"]) assert.equal((await request({ productId })).status, 400);
    assert.equal((await request({ productId: "owner", sellerTermsVersion: "" })).status, 400);
    assert.equal(links.length, count);
    await assert.rejects(page({ id: "other", stripe: "returned" }), /Not found/);
    assert.equal(refreshes.length, 0);
  });

  await t.test("return checks Stripe before reading the seller and preserves the draft and photos", async () => {
    const tree = await page({ id: "owner", stripe: "returned", collectionItem: "piece", selling: "open_to_offers", minimum: "125" });
    const form = find(tree, node => node.type === "listing-form").props;
    assert.deepEqual(refreshes, ["acct_owner"]);
    assert.equal(form.initial.product.id, "owner"); assert.equal(form.initial.product.description, "Original box");
    assert.equal(form.initial.images[0].url, "/media/owner.jpg");
    assert.equal(form.seller.status, "active"); assert.equal(form.seller.stripePayoutsEnabled, true);
    assert.equal(form.paymentSetup, "returned"); assert.match(form.collectionReturnTo, /edit=piece&selling=open_to_offers&minimum=125/);
    assert.equal(form.initial.product.status, "draft");
  });

  await t.test("incomplete and failed returns still render the saved listing", async () => {
    ready = false;
    let form = find(await page({ id: "owner", stripe: "refresh" }), node => node.type === "listing-form").props;
    assert.equal(form.seller.status, "onboarding"); assert.equal(form.paymentSetup, "refresh");
    failRefresh = true;
    form = find(await page({ id: "owner", stripe: "returned" }), node => node.type === "listing-form").props;
    assert.equal(form.initial.product.id, "owner"); assert.equal(form.initial.images.length, 1); assert.equal(form.paymentSetup, "unavailable");
  });

  await t.test("standalone account setup retains its account return destination", async () => {
    assert.equal((await request({})).status, 200);
    assert.deepEqual(links.at(-1).slice(1), ["/account?view=listings&stripe=returned", "/account?view=listings&stripe=refresh"]);
  });
});
