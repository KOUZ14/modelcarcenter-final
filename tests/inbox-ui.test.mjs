import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

test("one inbox preserves collector, marketplace, request and shipping navigation", async t => {
  const root = process.cwd(), scratch = await mkdtemp(join(root, ".sites-runtime/inbox-test-")), bundle = join(scratch, "page.mjs");
  const mocks = {
    "next/link": "export default 'a';",
    "next/image": "import {createElement} from 'react'; export default function Image({unoptimized,...props}) {return createElement('img',props);}",
    "next/navigation": "export const useRouter=()=>({refresh(){},push(){}});",
    "@/components/site-header": "export const SiteHeader=()=>null;",
    "@/components/site-footer": "export const SiteFooter=()=>null;",
    "@/lib/collector-auth": "export const requireCollector=async()=>({user:{id:'viewer'}});",
    "@/lib/messaging": "export const getMessagingCenterData=async()=>globalThis.__inbox.data;",
    "@/lib/collector-messaging": "export const collectorInbox=async()=>globalThis.__inbox.threads;export const threadMessages=async(user,id)=>{globalThis.__inbox.read.push(id);return [{id:'message',ownerId:user,body:'Collector message',createdAt:1000}];};",
    "@/lib/collection-offers": "export const getCollectionOffers=async()=>[];",
  };
  const output = await build({
    stdin: { contents: "export {default} from './app/messages/page.tsx';", resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "inbox-fixtures", setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
      b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { default: Page } = await import(pathToFileURL(bundle).href);
  t.after(async () => { delete globalThis.__inbox; await unlink(bundle); await rmdir(scratch); });
  const collector = { id: "collector-thread", senderId: "viewer", recipientId: "other", otherName: "Collector Alex", reference: "McLaren F1", status: "accepted", updatedAt: 2000, unread: 2 };
  const pending = { ...collector, id: "request", senderId: "other", recipientId: "viewer", otherName: "Pending Sam", status: "request", updatedAt: 3000 };
  const legacy = { id: "legacy", viewerRole: "buyer", otherPartyName: "Marketplace Jamie", productId: "p1", productSlug: "porsche", productTitle: "Porsche 911", sellerSlug: "jamie", lastMessageAt: new Date(4000).toISOString(), lastMessagePreview: "Original conversation", unreadCount: 1 };
  const data = { conversations: [legacy], activeConversation: { ...legacy, messages: [{ id: "old", body: "Marketplace message", createdAt: new Date(4000).toISOString(), senderLabel: "Jamie", isOwn: false }] }, newConversation: null, totalUnread: 1 };
  async function render(query = {}, overrides = {}) {
    globalThis.__inbox = { threads: [pending, collector], data, read: [], ...overrides };
    return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) }));
  }
  const onePanel = html => {
    assert.equal((html.match(/class="collector-conversation-sidebar"/g) || []).length, 1);
    assert.doesNotMatch(html, /class="conversation-panel"|marketplace-conversations|Combined shipping requests/);
    assert.equal((html.match(/<textarea/g) || []).length, 1);
  };

  await t.test("Messages merges both sources newest first and opens the latest", async () => {
    const html = await render();
    onePanel(html);
    assert.ok(html.indexOf('href="/messages?conversation=legacy') < html.indexOf('href="/messages?thread=collector-thread'));
    assert.match(html, /Marketplace message/);
    assert.doesNotMatch(html, />Pending Sam</);
    assert.deepEqual(globalThis.__inbox.read, []);
    for (const label of ["Messages", "Requests", "Offers", "Shipping"]) assert.match(html, new RegExp(`>${label}[ <]`));
  });
  await t.test("old request URLs for accepted collector threads open Messages", async () => {
    const html = await render({ thread: collector.id, tab: "requests" });
    onePanel(html);
    assert.match(html, /href="\/messages" aria-current="page">Messages/);
    assert.match(html, /Collector message/);
    assert.doesNotMatch(html, /2 unread messages/);
    assert.deepEqual(globalThis.__inbox.read, [collector.id]);
  });
  await t.test("legacy conversation links retain their messages", async () => {
    const html = await render({ conversation: legacy.id });
    onePanel(html);
    assert.match(html, /Marketplace message/);
    assert.match(html, /aria-current="page" href="\/messages\?conversation=legacy/);
  });
  await t.test("requests stay separate from accepted conversations", async () => {
    const html = await render({ tab: "requests" });
    assert.match(html, /Accept request/);
    assert.doesNotMatch(html, />Marketplace Jamie<|>Collector Alex<|<textarea/);
    assert.deepEqual(globalThis.__inbox.read, [pending.id]);
  });
  await t.test("Offers and Shipping never read a hidden conversation", async () => {
    for (const tab of ["offers", "shipping"]) {
      const html = await render({ tab, thread: collector.id });
      assert.deepEqual(globalThis.__inbox.read, []);
      assert.doesNotMatch(html, /collector-conversation-sidebar|message-workspace|<textarea/);
      assert.match(html, tab === "shipping" ? /Combined shipping requests/ : /No offers yet/);
    }
  });
  await t.test("seller and collector compose links each show one composer", async () => {
    const newConversation = { productId: "p1", productSlug: "porsche", productTitle: "Porsche 911", sellerName: "Jamie", sellerSlug: "jamie", canMessage: true };
    const market = await render({ product: "p1" }, { data: { ...data, activeConversation: null, newConversation } });
    onePanel(market);
    assert.match(market, /Start conversation/);
    const collectorCompose = await render({ collector: "other" });
    onePanel(collectorCompose);
    assert.match(collectorCompose, /Send message request/);
    assert.deepEqual(globalThis.__inbox.read, []);
  });
  await t.test("empty inbox has one empty state", async () => {
    const html = await render({}, { threads: [], data: { conversations: [], activeConversation: null, newConversation: null, totalUnread: 0 } });
    assert.match(html, /Your conversations, in one place/);
    assert.doesNotMatch(html, /marketplace-conversations|Select a conversation\.|<textarea/);
  });
});
