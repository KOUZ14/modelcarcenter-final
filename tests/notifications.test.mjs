import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { mkdtemp, readdir, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("notifications count unread updates beyond the display limit while respecting account and block boundaries", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/notifications-test-")), bundle = join(scratch, "notifications.mjs");
  const db = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort()) db.exec(await readFile(join(root, "drizzle", file), "utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  const binding = { prepare(query) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async all() { return { results: db.prepare(query).all(...values) }; },
      async first() { return db.prepare(query).get(...values) ?? null; },
      async run() { return db.prepare(query).run(...values); },
    };
  } };
  const fixture = { binding, viewer: "viewer", collector: async returnTo => { assert.equal(returnTo, "/notifications"); return { user: { id: fixture.viewer } }; } };
  globalThis.__notificationsTest = fixture;
  t.after(async () => { db.close(); delete globalThis.__notificationsTest; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const mocks = {
    "@/db": "export const getD1=()=>globalThis.__notificationsTest.binding;export const getDb=()=>{throw Error('Unexpected ORM call')};",
    "@/lib/collector-auth": "export const requireCollector=(...args)=>globalThis.__notificationsTest.collector(...args);",
    "@/components/site-header": "export const SiteHeader='site-header';",
    "@/components/notifications-inbox": "export const NotificationsInbox='notifications-inbox';",
  };
  const output = await build({
    stdin: { contents: "export {default as NotificationsPage} from './app/notifications/page.tsx';export {communityAction} from './lib/community.ts';", resolveDir: root },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "notifications-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { NotificationsPage, communityAction } = await import(pathToFileURL(bundle).href);
  for (const id of ["viewer", "other", "blocked", "blocking"]) db.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)").run(id, id, `${id}@example.test`);
  const read = async () => (await NotificationsPage()).props.children[1].props;
  assert.deepEqual(await read(), { notifications: [], unreadCount: 0 });

  const insert = db.prepare("INSERT INTO community_notifications (id,owner_id,actor_id,category,label,href,read_at,created_at) VALUES (?,?,?,'social','A collector update','/community',?,?)");
  for (let index = 0; index < 100; index++) insert.run(`read-${index}`, "viewer", "other", 1, index + 100);
  insert.run("older-unread", "viewer", null, null, 1);
  insert.run("other-account", "other", null, null, 1000);
  insert.run("hidden-blocked", "viewer", "blocked", null, 1000);
  insert.run("hidden-blocking", "viewer", "blocking", null, 1000);
  db.prepare("INSERT INTO collector_relationships (id,owner_id,target_id,kind,created_at) VALUES ('block-out','viewer','blocked','block',0),('block-in','blocking','viewer','block',0)").run();
  const inbox = await read();
  assert.equal(inbox.notifications.length, 100);
  assert.equal(inbox.unreadCount, 1, "Older unread updates count even when the newest displayed updates are read");
  assert.ok(inbox.notifications.every(notification => notification.id.startsWith("read-")), "Other accounts and blocked actors never enter the displayed list");

  await communityAction("viewer", { action: "read_notifications" });
  assert.equal((await read()).unreadCount, 0);
  assert.equal(db.prepare("SELECT read_at FROM community_notifications WHERE id='other-account'").get().read_at, null, "Marking read is scoped to the current account");
  assert.equal(db.prepare("SELECT read_at FROM community_notifications WHERE id='read-0'").get().read_at, 1, "Already-read timestamps are retained");
  fixture.viewer = "other";
  assert.deepEqual((await read()).notifications.map(notification => notification.id), ["other-account"]);
  assert.equal((await read()).unreadCount, 1);
});
