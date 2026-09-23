import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { addressComment, commentTime, readCommentDraft, taggedModel, profileDiscussionReturn, COMMENT_DRAFT_MAX_AGE } from "../lib/community-presentation.ts";

test("comment drafts expire, remain scoped to their author and retain guest drafts through sign-in", () => {
  const now = 1000000000;
  const saved = (viewerId, extra = {}) => JSON.stringify({ body: "My draft", viewerId, updatedAt: now, ...extra });
  assert.equal(readCommentDraft(saved(null), "new-account", now), "My draft");
  assert.equal(readCommentDraft(saved("alice"), "alice", now), "My draft");
  assert.equal(readCommentDraft(saved("alice"), "bob", now), "");
  assert.equal(readCommentDraft(saved("alice"), null, now), "");
  assert.equal(readCommentDraft(saved(null, { updatedAt: now - COMMENT_DRAFT_MAX_AGE - 1 }), null, now), "");
  assert.equal(readCommentDraft(saved(null, { body: "x".repeat(2001) }), null, now), "");
  assert.equal(readCommentDraft("bad JSON", null, now), "");
});

test("model titles separate only the exact color suffix and reply actions preserve existing writing", () => {
  assert.equal(taggedModel({ modelTitle: "Nissan Fairlady Z S30 · Red", modelColor: "Red" }), "Nissan Fairlady Z S30");
  assert.equal(taggedModel({ modelTitle: "Red Bull RB19", modelColor: "Blue" }), "Red Bull RB19");
  assert.equal(addressComment("I like this display", "maya"), "@maya I like this display");
  assert.equal(addressComment("@maya I like this display", "maya"), "@maya I like this display");
  assert.equal(commentTime(1000, 1000), "Just now");
  assert.equal(commentTime(1000, 121000), "2m ago");
  assert.equal(commentTime(1000, 7201000), "2h ago");
  assert.equal(commentTime(1000, 172801000), "2d ago");
  assert.equal(profileDiscussionReturn("/community/posts/post-1#comment-composer"), "/community/posts/post-1#comment-composer");
  assert.equal(profileDiscussionReturn("/collection/piece-1#comment-composer"), "/collection/piece-1#comment-composer");
  assert.equal(profileDiscussionReturn("//other.test/community/posts/post-1#comment-composer"), undefined);
  assert.equal(profileDiscussionReturn("/community/posts/../account#comment-composer"), undefined);
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const field = tree => find(tree, node => node.type === "textarea" && node.props.id === "comment-composer");
const button = (tree, name) => find(tree, node => node.type === "button" && node.props.children === name);
const flush = () => new Promise(resolve => setImmediate(resolve));

test("community post controls preserve drafts and handle authenticated writes and sharing", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/post-ui-test-")), bundle = join(scratch, "post.mjs");
  const originals = Object.fromEntries(["fetch", "localStorage", "location", "document", "navigator", "FormData"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const stored = new Map(), writes = [], pushes = [];
  let status = 200, failRead = false, failStorage = false, focusCount = 0, refreshCount = 0;
  const comment = { id: "reply-1", body: "Nice shelf", displayName: "Maya", handle: "maya", avatarUrl: null, createdAt: Date.now(), ownerId: "maya" };
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem(key, value) { if (failStorage) throw Error("Storage blocked"); stored.set(key, value); },
    removeItem: key => stored.delete(key),
  };
  globalThis.location = { origin: "https://mcc.test", hash: "", pathname: "/community/posts/post-1", search: "" };
  globalThis.document = { getElementById(id) { assert.equal(id, "comment-composer"); return { focus() { focusCount++; }, scrollIntoView() {} }; } };
  const navigator = {};
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
  globalThis.fetch = async (url, options = {}) => {
    if (options.method) { writes.push(JSON.parse(options.body)); return Response.json(status === 200 ? { ok: true } : { error: "Try again." }, { status }); }
    assert.match(url, /^\/api\/collectors\?view=comments&(post|item)=/);
    return failRead ? Response.json({ error: "Unavailable" }, { status: 503 }) : Response.json({ comments: [comment] });
  };
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__postUI.state(...a),useRef=(...a)=>globalThis.__postUI.ref(...a),useEffect=f=>globalThis.__postUI.effects.push(f),useCallback=f=>f;",
    "next/link": "export default 'link';",
    "next/navigation": "export const useRouter=()=>globalThis.__postUI.router;",
    "./community-ui": "export const Action='action',PhotoCarousel='photos',ReportButton='report',availabilityLabel={not_for_sale:'Not for sale'};",
    "./adult-consent": "export const AdultConsent='consent';",
  };
  const output = await build({
    stdin: { contents: "export * from './components/community-discussion.tsx';export * from './components/community-post.tsx';export * from './components/sign-in-form.tsx';", resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "post-ui-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "empty-css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { CommentSection, PostCard, SignInForm } = await import(pathToFileURL(bundle).href);
  t.after(async () => {
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    delete globalThis.__postUI;
    await unlink(bundle); await rmdir(scratch);
  });
  function renderer(Component, props) {
    const states = []; let index = 0;
    const fixture = {
      effects: [], router: { push: href => pushes.push(href), refresh: () => refreshCount++ },
      state(initial) { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial; return [states[slot], value => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }]; },
      ref(initial) { const slot = index++; if (!(slot in states)) states[slot] = { current: initial }; return states[slot]; },
    };
    const render = () => { index = 0; fixture.effects = []; globalThis.__postUI = fixture; return Component(props); };
    return { render, async mount() { render(); fixture.effects.forEach(effect => effect()); await flush(); return render(); } };
  }
  await t.test("guests can write and address replies without posting, then recover their draft after sign-in", async () => {
    const guest = renderer(CommentSection, { postId: "post-1" }); let tree = await guest.mount();
    assert.equal(button(tree, "Post comment"), null);
    field(tree).props.onChange({ target: { value: "I like this display" } }); tree = guest.render();
    find(tree, node => node.props?.["aria-label"] === "Reply to Maya").props.onClick(); tree = guest.render();
    assert.equal(field(tree).props.value, "@maya I like this display"); assert.equal(focusCount, 1);
    button(tree, "Sign in to comment").props.onClick();
    assert.equal(writes.length, 0);
    const setup = new URL(new URL(pushes.at(-1), "https://mcc.test").searchParams.get("returnTo"), "https://mcc.test");
    assert.equal(setup.pathname, "/profile");
    assert.equal(setup.searchParams.get("intent"), "comment");
    assert.equal(setup.searchParams.get("returnTo"), "/community/posts/post-1#comment-composer");
    const account = renderer(CommentSection, { postId: "post-1", viewerId: "alice", profilePublished: true });
    assert.equal(field(await account.mount()).props.value, "@maya I like this display");
    assert.equal(writes.length, 0, "Restoring a draft never publishes it");
  });
  await t.test("unpublished profiles get setup before submission; disabled discussions have no composer", async () => {
    const user = renderer(CommentSection, { postId: "post-1", viewerId: "alice" }); const tree = await user.mount();
    assert.equal(button(tree, "Post comment"), null);
    const setup = find(tree, node => node.type === "link" && node.props.children === "Set up public profile");
    assert.equal(new URL(setup.props.href, "https://mcc.test").searchParams.get("returnTo"), "/community/posts/post-1#comment-composer");
    const closed = renderer(CommentSection, { postId: "closed", enabled: false });
    assert.equal(field(await closed.mount()), null);
  });
  await t.test("failed posts and expired sessions retain drafts; success clears them and refreshes counts", async () => {
    const user = renderer(CommentSection, { postId: "post-1", viewerId: "alice", profilePublished: true });
    let tree = await user.mount(); status = 503;
    await find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} }); tree = user.render();
    assert.equal(field(tree).props.value, "@maya I like this display"); assert.ok(stored.size);
    status = 401; await find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.match(pushes.at(-1), /^\/sign-in\?/); assert.ok(stored.size);
    status = 200; tree = user.render();
    await find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} }); tree = user.render();
    assert.equal(field(tree).props.value, ""); assert.equal(stored.size, 0); assert.equal(refreshCount, 1);
    assert.equal(button(tree, "Post comment").props.disabled, true);
  });
  await t.test("storage failures keep the draft on screen instead of losing it during navigation", async () => {
    const guest = renderer(CommentSection, { postId: "post-1" }); let tree = await guest.mount(); failStorage = true;
    field(tree).props.onChange({ target: { value: "Keep this text" } }); tree = guest.render(); const before = pushes.length;
    button(tree, "Sign in to comment").props.onClick(); tree = guest.render();
    assert.equal(pushes.length, before); assert.equal(field(tree).props.value, "Keep this text");
    assert.match(find(tree, node => node.props?.role === "alert").props.children, /could not save/);
    failStorage = false;
  });
  await t.test("a failed comment read has a working retry and never masquerades as an empty discussion", async () => {
    failRead = true; const guest = renderer(CommentSection, { postId: "post-1" }); let tree = await guest.mount();
    assert.ok(button(tree, "Retry")); assert.equal(find(tree, node => node.props?.children === "No comments yet. Start the conversation."), null);
    failRead = false; button(tree, "Retry").props.onClick(); await flush(); tree = guest.render();
    assert.ok(find(tree, node => node.props?.["aria-label"] === "Reply to Maya"));
  });
  await t.test("detail comments focus locally; Share supports clipboard, cancellation and a selectable fallback", async () => {
    const post = { id: "post-1", displayName: "Alex", handle: "alex", createdAt: 0, body: "My shelf", photos: "[]", likes: 3, comments: 2 };
    const card = renderer(PostCard, { post, detail: true }); let tree = card.render();
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      assert.equal(find(card.render(), node => node.type === "time").props.children, "1/1/1970");
      process.env.TZ = "UTC";
      assert.equal(find(card.render(), node => node.type === "time").props.children, "1/1/1970");
    } finally { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; }
    const commentAction = find(tree, node => node.props?.["aria-label"] === "Comment · 2");
    assert.equal(commentAction.type, "button"); commentAction.props.onClick(); assert.equal(focusCount, 2);
    const share = tree => find(tree, node => node.type === "button" && find(node, child => child.type === "span" && child.props.children === "Share"));
    let copied = ""; navigator.clipboard = { async writeText(value) { copied = value; } };
    share(tree).props.onClick(); await flush(); tree = card.render(); assert.equal(copied, "https://mcc.test/community/posts/post-1");
    assert.equal(find(tree, node => node.props?.role === "status").props.children, "Link copied");
    navigator.share = async () => { throw Object.assign(Error("Cancelled"), { name: "AbortError" }); }; copied = "";
    share(tree).props.onClick(); await flush(); tree = card.render(); assert.equal(copied, ""); assert.equal(find(tree, node => node.props?.role === "status"), null);
    delete navigator.share; navigator.clipboard.writeText = async () => { throw Error("Denied"); };
    share(tree).props.onClick(); await flush(); tree = card.render();
    assert.equal(find(tree, node => node.type === "input" && node.props.readOnly).props.value, "https://mcc.test/community/posts/post-1");
    const feed = renderer(PostCard, { post });
    assert.equal(find(feed.render(), node => node.props?.["aria-label"] === "Comment · 2").props.href, "/community/posts/post-1#comment-composer");
  });
  await t.test("new-account magic links preserve the composer anchor after the new-user query", async () => {
    globalThis.FormData = class { get() { return "on"; } };
    const signIn = renderer(SignInForm, { returnTo: "/community/posts/post-1#comment-composer" });
    const tree = signIn.render(); await find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.equal(writes.at(-1).callbackURL, "/community/posts/post-1#comment-composer");
    assert.equal(writes.at(-1).newUserCallbackURL, "/community/posts/post-1?new=1#comment-composer");
  });
  await t.test("collection comments retain their draft through sign-in and profile setup", async () => {
    const guest = renderer(CommentSection, { itemId: "piece-1" }); let tree = await guest.mount();
    field(tree).props.onChange({ target: { value: "How do you display this model?" } }); tree = guest.render();
    button(tree, "Sign in to comment").props.onClick();
    const setupHref = new URL(pushes.at(-1), "https://mcc.test").searchParams.get("returnTo");
    assert.equal(new URL(setupHref, "https://mcc.test").searchParams.get("returnTo"), "/collection/piece-1#comment-composer");
    const signIn = renderer(SignInForm, { returnTo: setupHref });
    await find(signIn.render(), node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
    const callback = new URL(writes.at(-1).newUserCallbackURL, "https://mcc.test");
    assert.equal(callback.searchParams.get("new"), "1");
    assert.equal(callback.searchParams.get("returnTo"), "/collection/piece-1#comment-composer");
    const unpublished = renderer(CommentSection, { itemId: "piece-1", viewerId: "alice" });
    tree = await unpublished.mount();
    assert.equal(field(tree).props.value, "How do you display this model?");
    assert.equal(button(tree, "Post comment"), null);
    assert.ok(find(tree, node => node.type === "link" && node.props.children === "Set up public profile"));
    const ready = renderer(CommentSection, { itemId: "piece-1", viewerId: "alice", profilePublished: true });
    assert.equal(field(await ready.mount()).props.value, "How do you display this model?");
    button(ready.render(), "Clear draft").props.onClick();
    assert.equal(stored.has("mcc-comment-draft:item:piece-1"), false);
  });
});
