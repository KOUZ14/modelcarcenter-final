import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { pieceAvailabilityLabel } from "../lib/community-presentation.ts";

function nodes(tree, match) {
  if (!tree || typeof tree !== "object") return [];
  return [...(match(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => nodes(child, match))];
}
const first = (tree, match) => nodes(tree, match)[0];
const flush = () => new Promise(resolve => setImmediate(resolve));

test("collection detail status, contextual links, profile handoff and wishlist behavior", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/piece-test-")), bundle = join(scratch, "piece.mjs");
  let collector = null, published = 0, wishlistSaved = false, states = [], index = 0, requestError = false, finishRequest;
  const navigation = [], writes = [], authReturns = [], effects = [];
  const piece = { id: "piece-1", ownerId: "alex", catalogId: "model-1", title: "Nissan Fairlady", scale: "1:18", maker: "AUTOart", displayName: "Alex Morgan", handle: "alex", availability: "not_for_sale", visibility: "public", story: "My favorite model.", condition: "Displayed", photos: '["photo-one","photo-two"]', commentsEnabled: 1, listingSlug: "nissan-offer" };
  globalThis.__pieceTest = {
    current: () => collector,
    async require(path) { authReturns.push(path); return collector; },
    async piece() { return piece; },
    async shelves() { return [{ id: "favorites", name: "Favorites on display", itemId: "piece-1" }, { id: "other", name: "Private unrelated shelf", itemId: "piece-2" }]; },
    async settings() { return { published }; },
    async one(sql, viewer, model) { assert.match(sql, /model_wishlist/); assert.equal(viewer, collector.user.id); assert.equal(model, "model-1"); return wishlistSaved ? { id: "saved-1" } : null; },
    async request(payload) { writes.push(payload); if (finishRequest) await new Promise(resolve => { finishRequest = resolve; }); if (requestError) throw Error("Please retry."); },
    state(initial) { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial; return [states[slot], value => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }]; },
    ref(value) { const slot = index++; if (!(slot in states)) states[slot] = { current: value }; return states[slot]; },
    effect(callback, deps) { const slot = index++, previous = states[slot]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) { const next = { deps }; states[slot] = next; effects.push(() => { previous?.cleanup?.(); next.cleanup = callback(); }); } },
    router: { push: href => navigation.push(href), refresh() {} },
  };
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__pieceTest.state(...a),useRef=(...a)=>globalThis.__pieceTest.ref(...a),useEffect=(...a)=>globalThis.__pieceTest.effect(...a),useCallback=f=>f;",
    "next/image": "export default 'img';",
    "next/link": "export default 'a';",
    "next/navigation": "export const useRouter=()=>globalThis.__pieceTest.router; export const redirect=href=>{throw Object.assign(Error('Redirect'),{href})};export const notFound=()=>{throw Error('Not found')};",
    "@/components/site-header": "export const SiteHeader='site-header';",
    "@/components/community-ui": "export const CommentSection='discussion';",
    "./community-ui": "export const communityRequest=(...a)=>globalThis.__pieceTest.request(...a);",
    "@/components/collection-offers": "export const MakeOffer='make-offer',CommerceSettings='commerce-settings';",
    "@/components/product-gallery": "export const ProductGallery='gallery';",
    "@/components/collector-profile": "export const ProfileEditor='profile-editor';",
    "@/lib/collector-auth": "export const getCurrentCollector=()=>globalThis.__pieceTest.current(),requireCollector=p=>globalThis.__pieceTest.require(p);",
    "@/lib/community": "export const getPiece=()=>globalThis.__pieceTest.piece(),getShelves=()=>globalThis.__pieceTest.shelves(),getCollection=async()=>[],settings=()=>globalThis.__pieceTest.settings(),one=(...a)=>globalThis.__pieceTest.one(...a);",
    "@/lib/collection-offers": "export const expireCollectionOffers=async()=>{};",
  };
  const output = await build({
    stdin: { contents: "export {default as PiecePage} from './app/collection/[id]/page.tsx'; export {default as ProfilePage} from './app/profile/page.tsx'; export {CollectionWishlistButton} from './components/collection-wishlist-button.tsx'; export {ProductGallery} from './components/product-gallery.tsx';", resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "piece-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "empty-css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { PiecePage, ProfilePage, CollectionWishlistButton, ProductGallery } = await import(pathToFileURL(bundle).href);
  t.after(async () => { delete globalThis.__pieceTest; await unlink(bundle); await rmdir(scratch); });
  const page = () => PiecePage({ params: Promise.resolve({ id: "piece-1" }) });

  await t.test("availability renders on the server without a client-side label export", async () => {
    for (const [value, label] of Object.entries({ not_for_sale: "Not for sale", open_to_offers: "Open to offers", for_sale: "For sale", reserved: "Reserved · pending payment", previously_owned: "Previously owned", unknown: "Availability not specified" })) {
      piece.availability = value;
      const tree = await page();
      assert.equal(first(tree, node => node.props?.className === "availability").props.children, label);
      assert.equal(Boolean(first(tree, node => node.type === "make-offer")), value === "open_to_offers");
      assert.equal(Boolean(first(tree, node => node.props?.href === "/products/nissan-offer")), value === "for_sale");
    }
    for (const empty of ["", null, undefined, "constructor"]) assert.equal(pieceAvailabilityLabel(empty), "Availability not specified");
    piece.availability = "not_for_sale";
  });
  await t.test("one model action, contextual shelf links and collection photos retain identity", async () => {
    const tree = await page();
    const links = nodes(tree, node => node.type === "a");
    assert.equal(links.filter(node => node.props.href === "/models/model-1").length, 1);
    const shelf = links.find(node => node.props.children === "Favorites on display");
    assert.equal(shelf.props.href, "/collectors/alex?tab=collection&shelf=favorites#collection-pieces");
    assert.equal(links.some(node => node.props.children === "Private unrelated shelf"), false);
    assert.equal(links.find(node => node.props.className === "piece-message").props.href, "/messages?collector=alex&item=piece-1");
    const gallery = first(tree, node => node.type === "gallery");
    assert.equal(gallery.props.context, "collection");
    assert.deepEqual(gallery.props.images.map(image => image.url), ["/community/media/photo-one", "/community/media/photo-two"]);
    collector = { user: { id: "alex" }, profile: { handle: "alex" } };
    const owned = await page();
    assert.equal(first(owned, node => node.props?.className === "piece-message"), undefined);
    assert.equal(first(owned, node => node.props?.children === "Favorites on display").props.href, "/collection?shelf=favorites#collection-pieces");
    piece.catalogId = null; piece.photos = "[]";
    const unmatched = await page();
    assert.equal(first(unmatched, node => node.type === CollectionWishlistButton), undefined);
    assert.deepEqual(first(unmatched, node => node.type === "gallery").props.images, []);
    piece.catalogId = "model-1"; piece.photos = '["photo-one","photo-two"]'; collector = null;
  });
  await t.test("wishlist does not write for guests or optimistically change after an error", async () => {
    let props = { catalogId: "model-1", initialSaved: false, signedIn: false, returnTo: "/collection/piece-1" };
    const render = () => { index = 0; return CollectionWishlistButton(props); };
    const button = tree => first(tree, node => node.type === "button");
    button(render()).props.onClick(); await flush();
    assert.equal(writes.length, 0);
    assert.equal(new URL(navigation.at(-1), "https://mcc.test").searchParams.get("returnTo"), "/collection/piece-1");
    props = { ...props, signedIn: true }; requestError = true;
    button(render()).props.onClick(); await flush();
    assert.equal(button(render()).props["aria-pressed"], false);
    assert.equal(first(render(), node => node.props?.role === "alert").props.children, "Please retry.");
    requestError = false; finishRequest = true;
    const before = writes.length, action = button(render()); action.props.onClick(); action.props.onClick();
    assert.equal(writes.length, before + 1);
    assert.equal(button(render()).props.disabled, true);
    finishRequest(); finishRequest = undefined; await flush();
    assert.equal(button(render()).props["aria-pressed"], true);
    assert.deepEqual(writes.at(-1), { action: "wishlist", catalogId: "model-1", enabled: true });
    button(render()).props.onClick(); await flush();
    assert.equal(button(render()).props["aria-pressed"], false);
    assert.equal(writes.at(-1).enabled, false);
    states = []; props.initialSaved = true;
    assert.equal(button(render()).props["aria-pressed"], true);
    collector = { user: { id: "buyer" }, profile: { handle: "buyer" } }; wishlistSaved = true;
    assert.equal(first(await page(), node => node.type === CollectionWishlistButton).props.initialSaved, true);
  });
  await t.test("profile setup returns prepared accounts to the draft and guides new profiles without publishing them", async () => {
    const query = { edit: "1", intent: "comment", returnTo: "/collection/piece-1#comment-composer" };
    published = 0;
    const tree = await ProfilePage({ searchParams: Promise.resolve(query) });
    const editor = first(tree, node => node.type === "profile-editor");
    assert.equal(editor.props.commentSetup, true);
    assert.equal(editor.props.returnTo, query.returnTo);
    assert.equal(editor.props.settings.published, 0);
    assert.equal(new URL(authReturns.at(-1), "https://mcc.test").searchParams.get("returnTo"), query.returnTo);
    published = 1;
    await assert.rejects(() => ProfilePage({ searchParams: Promise.resolve(query) }), error => error.href === query.returnTo);
    const unsafe = await ProfilePage({ searchParams: Promise.resolve({ ...query, returnTo: "//other.test" }) });
    assert.equal(first(unsafe, node => node.type === "profile-editor").props.returnTo, undefined);
    assert.equal(first(unsafe, node => node.type === "profile-editor").props.commentSetup, false);
  });
  await t.test("collection inspection keeps zoom focus, resets between photos and restores the page on Escape", () => {
    const originals = ["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    const listeners = new Map(); let closeFocus = 0, openerFocus = 0;
    globalThis.document = { body: { style: { overflow: "auto" } } };
    globalThis.window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name), requestAnimationFrame: callback => callback() };
    states = []; effects.length = 0;
    const props = { context: "collection", productName: "Nissan", images: [{ id: "one", url: "/one", alt: "Nissan front" }, { id: "two", url: "/two", alt: "Nissan side" }] };
    const render = () => {
      index = 0; const tree = ProductGallery(props);
      const opener = first(tree, node => node.props?.className === "gallery-open");
      if (opener) opener.props.ref.current = { focus() { openerFocus++; } };
      const close = first(tree, node => node.props?.className === "inspection-close");
      if (close) close.props.ref.current = { focus() { closeFocus++; } };
      const stage = first(tree, node => node.props?.className?.startsWith("inspection-stage"));
      if (stage) stage.props.ref.current = { clientWidth: 350, clientHeight: 500 };
      effects.splice(0).forEach(effect => effect()); return tree;
    };
    try {
      let tree = render(); first(tree, node => node.props?.className === "gallery-open").props.onClick(); tree = render();
      assert.equal(document.body.style.overflow, "hidden"); assert.equal(closeFocus, 1);
      const dialog = () => first(tree, node => node.props?.role === "dialog");
      assert.ok(dialog());
      assert.equal(nodes(dialog(), node => typeof node.props?.children === "string" && node.props.children.includes("seller")).length, 0);
      first(dialog(), node => node.props?.["aria-label"] === "Zoom in").props.onClick(); tree = render();
      assert.match(first(dialog(), node => node.props?.className === "inspection-image").props.style.transform, /scale\(1\.5\)/);
      assert.equal(closeFocus, 1, "Zoom must not steal focus from its button");
      first(dialog(), node => node.props?.["aria-label"] === "Next photo").props.onClick(); tree = render();
      assert.equal(first(dialog(), node => node.props?.className === "inspection-image").props.src, "/two");
      assert.match(first(dialog(), node => node.props?.className === "inspection-image").props.style.transform, /scale\(1\)/);
      listeners.get("keydown")({ key: "Escape", preventDefault() {} }); tree = render();
      assert.equal(dialog(), undefined); assert.equal(openerFocus, 1); assert.equal(document.body.style.overflow, "auto"); assert.equal(listeners.size, 0);
      props.images = []; tree = render();
      assert.equal(first(tree, node => node.type === "p").props.children, "No personal photos added yet");
    } finally {
      for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    }
  });
});
