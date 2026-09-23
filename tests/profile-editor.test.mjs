import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { profileValues, profilePayload, publicPreviewPieces } from "../lib/profile-editor.ts";

const profile = { handle: "alex", displayName: "Alex", bio: "My models", avatarUrl: "/community/media/avatar-old" };
const preferences = { published: 0, visibility: "private", interests: "Porsche, 1:64", region: "", contact: "requests", social_notifications: 1, discovery_notifications: 0, cover_id: "cover-old" };
function find(tree, match) {
  if (!tree || typeof tree !== "object") return undefined;
  if (match(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const found = find(child, match); if (found) return found; }
}
const field = (tree, name) => find(tree, node => node.props?.name === name);
const button = (tree, label) => find(tree, node => node.type === "button" && node.props.children === label);

test("preview projections exclude private pieces and records; image payloads preserve untouched external avatars", () => {
  const base = { id: "public", title: "Nissan", photos: "[]", scale: "1:18", maker: "AUTOart", availability: "not_for_sale", visibility: "public", privateNotes: "SECRET", purchaseCost: "999", story: "Story", ownerId: "owner" };
  const projected = publicPreviewPieces([base, { ...base, id: "private", visibility: "private" }]);
  assert.equal(projected.length, 1); assert.equal(projected[0].id, "public");
  assert.equal("privateNotes" in projected[0], false); assert.equal("purchaseCost" in projected[0], false); assert.equal("ownerId" in projected[0], false);
  const external = profileValues({ ...profile, avatarUrl: "https://images.example/avatar.jpg" }, preferences);
  assert.equal(JSON.parse(JSON.stringify(profilePayload(external, false))).avatarId, undefined);
  assert.equal(profilePayload({ ...external, avatar: null, cover: null }, false).avatarId, "");
  assert.equal(profilePayload({ ...external, handle: " Mixed_Case " }, false).handle, "mixed_case");
});

test("profile editor previews drafts, preserves failures, and saves only after uploads and consent", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/profile-test-")), bundle = join(scratch, "profile.mjs");
  const originals = Object.fromEntries(["fetch", "window", "document", "createImageBitmap"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const writes = [], busyChanges = [], draws = [];
  let status = 200, refreshes = 0, consentFocus = 0, bitmapClosed = 0;
  globalThis.window = { requestAnimationFrame: callback => callback(), addEventListener() {}, removeEventListener() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...args) => draws.push(args) }), toBlob: callback => callback(new Blob(["clean jpeg"], { type: "image/jpeg" })) }), body: { style: { overflow: "auto" } }, activeElement: { focus() {} } };
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 2000, close() { bitmapClosed++; } });
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, "POST");
    if (url === "/api/collectors/photos") {
      const image = options.body.get("photo"); assert.equal(image.type, "image/jpeg"); writes.push({ image: image.name });
      return Response.json(status === 200 ? { id: "new-image" } : { error: "Upload failed." }, { status });
    }
    assert.equal(url, "/api/collectors"); writes.push(JSON.parse(options.body));
    return Response.json(status === 200 ? { handle: "alex" } : { error: "Handle unavailable." }, { status });
  };
  globalThis.__profileTest = { hooks: null, router: { refresh() { refreshes++; }, push() { throw Error("Saving must show confirmation before navigation"); } } };
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__profileTest.hooks.state(...a),useRef=(...a)=>globalThis.__profileTest.hooks.ref(...a),useEffect=(...a)=>globalThis.__profileTest.hooks.effect(...a);",
    "next/link": "export default 'a';",
    "next/navigation": "export const useRouter=()=>globalThis.__profileTest.router;",
  };
  const output = await build({ stdin: { contents: "export * from './components/profile-editor.tsx'; export * from './components/profile-image-selector.tsx';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "profile-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "empty-css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { ProfileEditor, ProfilePreview, ProfileImageSelector } = await import(pathToFileURL(bundle).href);
  t.after(async () => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } delete globalThis.__profileTest; await unlink(bundle); await rmdir(scratch); });
  function renderer(Component, props) {
    const state = [], effects = []; let index = 0;
    const hooks = {
      state(initial) { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial; return [state[slot], value => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }]; },
      ref(initial) { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
      effect(callback) { effects.push(callback); },
    };
    return { effects, render() { index = 0; effects.length = 0; globalThis.__profileTest.hooks = hooks; return Component(props); } };
  }
  const submit = tree => find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { reportValidity: () => true } });

  await t.test("preview includes current edits without a write, and Discard restores the saved profile", () => {
    const editor = renderer(ProfileEditor, { profile, settings: preferences }); let tree = editor.render();
    assert.equal(button(tree, "Save profile").props.disabled, true);
    field(tree, "bio").props.onChange({ target: { value: "A new story" } }); tree = editor.render();
    assert.equal(find(tree, node => node.props?.id === "profile-bio-count").props.children[0], 11);
    button(tree, "Preview public profile").props.onClick(); tree = editor.render();
    const preview = find(tree, node => node.type === ProfilePreview);
    assert.equal(preview.props.values.bio, "A new story"); assert.equal(preview.props.values.published, false); assert.equal(writes.length, 0);
    preview.props.onClose(); tree = editor.render(); button(tree, "Discard changes").props.onClick(); tree = editor.render();
    assert.equal(field(tree, "bio").props.value, profile.bio); assert.equal(find(tree, node => node.props?.className === "profile-save-bar"), undefined);
  });
  await t.test("publication needs consent; uploads block saving; failures keep all edits for retry", async () => {
    const editor = renderer(ProfileEditor, { profile, settings: preferences, returnTo: "/collection/piece#comment-composer", commentSetup: true }); let tree = editor.render();
    find(tree, node => node.type === "form").props.ref.current = { querySelector: () => ({ focus() { consentFocus++; } }) };
    field(tree, "published").props.onChange({ target: { checked: true } }); tree = editor.render();
    await submit(tree); assert.equal(writes.length, 0); assert.equal(consentFocus, 1);
    field(tree, "publishConfirmed").props.onChange({ target: { checked: true } }); tree = editor.render();
    const avatar = find(tree, node => node.type === ProfileImageSelector && node.props.kind === "avatar");
    avatar.props.onBusyChange(true); await submit(tree); assert.equal(writes.length, 0);
    avatar.props.onChange({ id: "new-avatar", url: "/community/media/new-avatar" }); avatar.props.onBusyChange(false); tree = editor.render();
    status = 409; await submit(tree); tree = editor.render();
    assert.equal(field(tree, "published").props.checked, true); assert.equal(find(tree, node => node.type === ProfileImageSelector && node.props.kind === "avatar").props.value.id, "new-avatar");
    assert.equal(find(tree, node => node.props?.role === "alert").props.children, "Handle unavailable.");
    status = 200; const before = writes.length; await Promise.all([submit(tree), submit(tree)]); tree = editor.render();
    assert.equal(writes.length, before + 1); assert.equal(writes.at(-1).avatarId, "new-avatar"); assert.equal(writes.at(-1).publishConfirmed, true);
    assert.equal(refreshes, 0); assert.equal(find(tree, node => node.props?.role === "status").props.children, "Profile saved. Your profile is public.");
    assert.equal(button(tree, "Save profile").props.disabled, true);
    assert.ok(find(tree, node => node.type === "a" && node.props.href === "/collection/piece#comment-composer"));
  });
  await t.test("single-image selection re-encodes before upload and replacement failure preserves the previous image", async () => {
    const props = { kind: "avatar", value: { id: "old", url: "/community/media/old" }, disabled: false, onChange(value) { props.value = value; }, onBusyChange: value => busyChanges.push(value) };
    const selector = renderer(ProfileImageSelector, props); let tree = selector.render();
    const input = () => find(tree, node => node.type === "input" && node.props.type === "file");
    assert.equal(input().props.multiple, undefined);
    const node = { files: [new File(["photo"], "avatar.png", { type: "image/png" })], value: "avatar.png" };
    await input().props.onChange({ currentTarget: node }); tree = selector.render();
    assert.equal(props.value.id, "new-image"); assert.equal(node.value, ""); assert.deepEqual(busyChanges.slice(-2), [true, false]);
    assert.equal(bitmapClosed, 1); assert.deepEqual(draws[0].slice(1), [0, 0, 1600, 800]);
    assert.equal(writes.at(-1).image, "avatar.jpg");
    status = 503; await input().props.onChange({ currentTarget: node }); tree = selector.render();
    assert.equal(props.value.id, "new-image"); assert.ok(find(tree, node => node.props?.role === "alert"));
    const before = writes.length; node.files = [new File(["bad"], "bad.txt", { type: "text/plain" })];
    await input().props.onChange({ currentTarget: node }); tree = selector.render(); assert.equal(writes.length, before);
    find(tree, node => node.props?.className === "profile-image-remove").props.onClick();
    assert.equal(props.value, null); assert.equal(writes.length, before);
  });
  await t.test("preview is a private modal with focus and scrolling restored on close", () => {
    let shown = 0, focused = 0, restored = 0, closed = 0;
    document.activeElement = { focus() { restored++; } };
    const preview = renderer(ProfilePreview, { values: profileValues(profile, preferences), pieces: [], onClose() { closed++; } });
    const tree = preview.render(); tree.props.ref.current = { showModal() { shown++; } };
    button(tree, "Close preview").props.ref.current = { focus() { focused++; } };
    const cleanup = preview.effects[0](); assert.equal(shown, 1); assert.equal(focused, 1); assert.equal(document.body.style.overflow, "hidden");
    tree.props.onCancel(); assert.equal(closed, 1); cleanup(); assert.equal(document.body.style.overflow, "auto"); assert.equal(restored, 1);
    assert.equal(find(tree, node => node.props?.name === "publishConfirmed"), undefined);
  });
});
