import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("community browsing and composing retain context without premature writes", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".community-feed-test-")), bundle = join(scratch, "feed.mjs");
  let states = [], index = 0;
  const writes = [], navigation = [], originalFetch = globalThis.fetch;
  globalThis.__communityFeedTest = {
    state(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
      return [states[slot], value => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
    },
    router: { push: path => navigation.push(path), replace() {}, refresh() {} },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/collectors");
    assert.equal(options.method, "POST");
    writes.push(JSON.parse(options.body));
    return Response.json({ id: "new-post" });
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete globalThis.__communityFeedTest;
    await unlink(bundle).catch(() => {}); await rmdir(scratch);
  });
  const mocks = {
    react: "export const useState=globalThis.__communityFeedTest.state,useEffect=()=>{},useRef=v=>({current:v}),useCallback=v=>v,Fragment=Symbol.for('react.fragment');",
    "next/link": "export default 'link';",
    "next/navigation": "export const useRouter=()=>globalThis.__communityFeedTest.router;",
  };
  const output = await build({
    stdin: { contents: 'export { CommunityFeed, PostComposer } from "./components/community-feed.tsx"; export { PostCard, CommentSection, CommunityFrame, SubmitForm, PhotoUpload } from "./components/community-ui.tsx";', resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false, loader: { ".css": "empty" },
    plugins: [{ name: "community-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const ui = await import(pathToFileURL(bundle).href);
  const reset = (initial = []) => { states = initial; index = 0; };
  const render = (component, props) => { index = 0; return component(props); };
  function all(node, predicate) {
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
  }
  const find = (node, predicate) => all(node, predicate)[0];
  const text = node => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : [node.props?.children].flat(Infinity).map(text).join(" ");
  const posts = Array.from({ length: 5 }, (_, i) => ({ id: `post-${i}`, createdAt: 1000, displayName: "Collector", body: "A model photo", photos: "[]" }));
  const props = { initialPosts: posts, collectors: [{ userId: "collector" }], tab: "for_you", topic: "", limit: 20, view: "", before: 2000 };

  await t.test("discovery follows three posts and topic filters preserve the chosen feed", () => {
    reset();
    let tree = render(ui.CommunityFeed, props);
    const stream = find(tree, n => n.props?.className === "community-post-stream");
    assert.deepEqual(all(stream, n => n.type === ui.PostCard).map(n => n.props.post.id), posts.map(p => p.id));
    const groups = stream.props.children;
    assert.equal(groups.length, 5);
    assert.equal(groups[2].props.children[1].props.className, "collector-suggestions-inline");
    assert.equal(groups.filter(n => n.props.children[1]).length, 1, "Discovery appears once without replacing a post");
    assert.equal(find(tree, n => n.props?.id === "community-topic-filters").props.hidden, true);
    find(tree, n => n.props?.className === "community-filter-toggle").props.onClick();
    tree = render(ui.CommunityFeed, props);
    assert.equal(find(tree, n => n.props?.id === "community-topic-filters").props.hidden, false);
    const jdm = find(tree, n => n.type === "link" && n.props.children === "JDM");
    assert.equal(new URL(jdm.props.href, "https://mcc.test").searchParams.get("topic"), "JDM");
    jdm.props.onClick();
    assert.equal(find(render(ui.CommunityFeed, props), n => n.props?.id === "community-topic-filters").props.hidden, true);
    for (const tab of ["for_you", "following", "saved"]) {
      reset();
      tree = render(ui.CommunityFeed, { ...props, initialPosts: [], topic: "JDM", tab });
      const empty = find(tree, n => n.props?.className === "community-empty");
      assert.match(text(empty), /No posts matching JDM/);
      const clear = find(empty, n => n.type === "link" && n.props.children === "Clear filter");
      const params = new URL(clear.props.href, "https://mcc.test").searchParams;
      assert.equal(params.get("topic"), "");
      assert.equal(params.get("tab"), tab);
      assert.equal(params.get("before"), "2000");
    }
    reset();
    tree = render(ui.CommunityFeed, { ...props, initialPosts: posts.slice(0, 1) });
    assert.equal(all(find(tree, n => n.props?.className === "community-post-stream"), n => n.props?.className === "collector-suggestions-inline").length, 1, "Short feeds still expose discovery");
  });

  await t.test("navigation marks Saved correctly and comment links target Discussion", () => {
    reset();
    const frame = ui.CommunityFrame({ children: null, tab: "saved", view: "" });
    const current = all(frame, n => n.type === "link" && n.props["aria-current"] === "page");
    assert.deepEqual(current.map(n => n.props.children), ["Saved"]);
    const post = render(ui.PostCard, { post: posts[0] });
    assert.equal(find(post, n => n.type === "link" && n.props.href?.includes("#comment-composer")).props.href, "/community/posts/post-0#comment-composer");
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Auckland";
      const serverDate = text(find(render(ui.PostCard, { post: posts[0] }), n => n.type === "time"));
      process.env.TZ = "America/Los_Angeles";
      const browserDate = text(find(render(ui.PostCard, { post: posts[0] }), n => n.type === "time"));
      assert.equal(serverDate, browserDate, "Post dates must hydrate consistently across time zones");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
    reset([[{ id: "comment", body: "Lovely model", displayName: "Reader", handle: "reader", createdAt: 1000 }]]);
    const discussion = render(ui.CommentSection, { postId: "post-0" });
    assert.equal(discussion.props.id, "discussion");
    const comment = find(discussion, n => n.type === "article");
    const menu = find(comment, n => n.type === "details");
    assert.equal(menu.props.open, undefined);
    assert.ok(find(menu, n => n.props?.type === "comment" && n.props?.id === "comment"), "Reporting stays available inside the closed options menu");
  });

  await t.test("caption-first composing preserves optional tags and commercial disclosure", async () => {
    reset();
    const completed = [], composerProps = { onDone: id => completed.push(id) };
    let tree = render(ui.PostComposer, composerProps);
    let form = find(tree, n => n.type === ui.SubmitForm);
    assert.equal(form.props.children[0].props.children[1].type, "textarea");
    assert.equal(find(tree, n => n.type === "details").props.children[1], false, "Tagging loads only when requested");
    assert.ok(find(tree, n => n.type === "input" && n.props.name === "commercial"));
    const photoControl = find(tree, n => n.type === ui.PhotoUpload);
    photoControl.props.onBusyChange(true);
    tree = render(ui.PostComposer, composerProps);
    assert.equal(find(tree, n => n.type === ui.SubmitForm).props.disabled, true);
    photoControl.props.onChange(["uploaded-photo"]);
    photoControl.props.onBusyChange(false);
    find(tree, n => n.type === "details").props.onToggle({ currentTarget: { open: true } });
    tree = render(ui.PostComposer, composerProps);
    const details = find(tree, n => n.type === "details");
    details.props.children[1].props.onCatalogChange("exact-release");
    details.props.onToggle({ currentTarget: { open: false } });
    tree = render(ui.PostComposer, composerProps);
    assert.ok(find(tree, n => n.type === "details").props.children[1], "Closing details preserves their fields and values");
    form = find(tree, n => n.type === ui.SubmitForm);
    assert.equal(form.props.disabled, false);
    const data = new FormData();
    for (const [key, value] of Object.entries({ body: "My latest model", topic: "JDM", prompt: "Latest addition", itemId: "public-piece", commercial: "on" })) data.set(key, value);
    await form.props.onSubmit(data);
    assert.deepEqual(writes.at(-1), { action: "post", body: "My latest model", topic: "JDM", prompt: "Latest addition", catalogId: "exact-release", itemId: "public-piece", photos: ["uploaded-photo"], commercial: true });
    assert.deepEqual(completed, ["new-post"]);
    reset();
    const minimal = new FormData(); minimal.set("body", "A question without tags or photos");
    await find(render(ui.PostComposer, composerProps), n => n.type === ui.SubmitForm).props.onSubmit(minimal);
    assert.deepEqual(writes.at(-1), { action: "post", body: "A question without tags or photos", topic: "", prompt: "", catalogId: "", itemId: "", photos: [], commercial: false });
  });

  await t.test("upload failures release the publish gate and disabled forms cannot submit", async () => {
    reset();
    const busy = [], photo = render(ui.PhotoUpload, { value: [], onChange() {}, onBusyChange: value => busy.push(value), compact: true });
    const input = { files: [{ size: 11 * 1024 * 1024 }], value: "fixture.jpg" };
    const before = writes.length;
    await find(photo, n => n.type === "input").props.onChange({ currentTarget: input });
    assert.deepEqual(busy, [true, false]);
    assert.equal(input.value, "");
    assert.equal(writes.length, before);
    reset();
    let submits = 0;
    const form = render(ui.SubmitForm, { children: null, disabled: true, onSubmit: async () => { submits++; } });
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(submits, 0);
    assert.equal(find(form, n => n.type === "button").props.disabled, true);
  });
});
