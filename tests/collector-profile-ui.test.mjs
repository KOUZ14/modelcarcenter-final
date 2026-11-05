import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("collector identities and visitor controls render consistently across profile, cards, posts and navigation", async t => {
  const root = process.cwd(), scratch = await mkdtemp(join(root, ".sites-runtime/collector-ui-")), bundle = join(scratch, "ui.mjs");
  const profile = { userId: "collector", handle: "alex", displayName: "Alex", avatarUrl: "/community/media/avatar", coverId: null, bio: "", interests: "", region: "", published: 1, followers: 2, following: 3, isFollowing: 0 };
  globalThis.__collectorUI = { ...profile, id: profile.userId, store: null };
  const mocks = {
    "next/link": "export default 'a';",
    "next/image": "import {createElement} from 'react'; export default function Image({priority,unoptimized,...props}) {return createElement('img',props);}",
    "next/navigation": "export const useRouter=()=>({refresh(){}}),useSearchParams=()=>new URLSearchParams(),usePathname=()=>'/collectors/alex';",
    "./marketplace-provider": "export const useMarketplace=()=>({cart:[],collector:globalThis.__collectorUI,authReady:true,signOut:async()=>{}});",
  };
  t.after(async () => { delete globalThis.__collectorUI; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({
    stdin: { contents: "export {CollectorProfile} from './components/collector-profile.tsx';export {CollectorCard} from './components/community-ui.tsx';export {PostCard} from './components/community-post.tsx';export {CollectorAvatar} from './components/collector-avatar.tsx';export {SiteHeader} from './components/site-header.tsx';", resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "collector-fixtures", setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
      b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const ui = await import(pathToFileURL(bundle).href);
  const render = (name, props) => renderToStaticMarkup(createElement(ui[name], props));
  const props = { profile, items: [], shelves: [], posts: [], listings: [], owner: true, visitor: true, tab: "sale" };
  const preview = render("CollectorProfile", props);
  assert.match(preview, /src="\/community\/media\/avatar"/);
  assert.match(preview, /<button[^>]+disabled="">Follow<\/button>/);
  assert.match(preview, /<button[^>]+disabled="">Message<\/button>/);
  assert.doesNotMatch(preview, /href="\/messages/);
  assert.match(preview, /class="button outline" href="\/collectors\/alex\?tab=sale">Exit visitor preview/);
  assert.match(preview, /class="profile-stats"/);
  assert.match(preview, /class="profile-empty"/);
  assert.doesNotMatch(render("CollectorProfile", { ...props, tab: "about" }), /Block collector|>Report</);
  const visitor = render("CollectorProfile", { ...props, owner: false });
  assert.match(visitor, /href="\/messages\?collector=collector"/);
  assert.doesNotMatch(visitor, /disabled=""/);
  const owner = render("CollectorProfile", { ...props, visitor: false });
  assert.match(owner, />Edit profile</);
  assert.doesNotMatch(owner, />Follow<|>Message</);
  assert.match(render("CollectorProfile", { ...props, tab: "unknown" }), /Public collection/);
  for (const isSelf of [0, 1]) {
    const card = render("CollectorCard", { collector: { ...profile, count: 1, isSelf } });
    assert.match(card, /src="\/community\/media\/avatar"/);
    assert.match(card, isSelf ? />View profile</ : />Follow</);
    if (isSelf) assert.doesNotMatch(card, />Follow</);
  }
  const post = render("PostCard", { post: { ...profile, id: "post", ownerId: "collector", photos: "[]", body: "My collection", createdAt: 1000, comments: 0, likes: 0 } });
  assert.match(post, /src="\/community\/media\/avatar"/);
  assert.match(render("SiteHeader", {}), /src="\/community\/media\/avatar"/);
  assert.match(render("CollectorAvatar", { name: " alex ", src: null }), />A<\/span>/);
});
