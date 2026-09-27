import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { defaultPhotoCrop, movePhotoCrop, parsePhotoCrop, photoCropRect } from "../lib/profile-photo.ts";

test("photo crops match both frames, move with the pointer, and never reveal blank edges", () => {
  assert.deepEqual(photoCropRect(1600, 900, "avatar", defaultPhotoCrop), { x: 350, y: 0, width: 900, height: 900 });
  const cover = photoCropRect(1500, 1000, "cover", defaultPhotoCrop);
  assert.deepEqual(cover, { x: 0, y: 300, width: 1500, height: 400 });
  assert.deepEqual(photoCropRect(500, 1200, "avatar", { x: 1, y: 1, zoom: 2 }), { x: 250, y: 950, width: 250, height: 250 });
  const moved = movePhotoCrop(1500, 1000, "cover", defaultPhotoCrop, 100, -50, 375);
  assert.equal(moved.x, 0.5); assert.ok(moved.y > 0.5, "Dragging up reveals the bottom of the photo");
  for (const kind of ["avatar", "cover"]) for (const [width, height] of [[1600, 900], [400, 1600], [700, 700]]) {
    for (const zoom of [1, 1.37, 3]) {
      for (const direction of [-1, 1]) {
        const crop = movePhotoCrop(width, height, kind, { ...defaultPhotoCrop, zoom }, 99999 * direction, 99999 * direction, 240);
        const rect = photoCropRect(width, height, kind, crop);
        assert.ok(rect.x >= 0 && rect.y >= 0);
        assert.ok(rect.x + rect.width <= width + 0.001 && rect.y + rect.height <= height + 0.001);
        assert.ok(Math.abs(rect.width / rect.height - (kind === "avatar" ? 1 : 3.75)) < 0.001);
      }
    }
  }
  assert.equal(parsePhotoCrop({ kind: "cover", x: 1, y: 0, zoom: 3 }).zoom, 3);
  for (const value of [null, {}, { kind: "other", ...defaultPhotoCrop }, { kind: "cover", x: NaN, y: 0, zoom: 1 }, { kind: "cover", x: 0, y: 2, zoom: 1 }, { kind: "cover", x: 0, y: 0, zoom: 4 }]) assert.equal(parsePhotoCrop(value), null);
});

test("profile photo uploads preserve owner-only originals and immutable public crops", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/photo-api-test-")), bundle = join(scratch, "api.mjs");
  const db = new DatabaseSync(":memory:");
  for (const name of (await readdir(join(root, "drizzle"))).filter(name => name.endsWith(".sql")).sort()) db.exec(await readFile(join(root, "drizzle", name), "utf8"));
  const objects = new Map();
  const fixture = { viewer: "owner", db, env: { IMAGES: {
    async put(key, bytes, options) { objects.set(key, { body: bytes, customMetadata: options.customMetadata }); },
    async get(key) { return objects.get(key) || null; },
  } } };
  globalThis.__profilePhotoFixture = fixture;
  const mocks = {
    "cloudflare:workers": "export const env=globalThis.__profilePhotoFixture.env;",
    "@/lib/collector-auth": "export const getCurrentCollector=async()=>globalThis.__profilePhotoFixture.viewer?{user:{id:globalThis.__profilePhotoFixture.viewer}}:null; export const requireCollectorApi=async()=>await getCurrentCollector()||Response.json({error:'Sign in'},{status:401});",
    "@/lib/community": "export const one=async(sql,...args)=>globalThis.__profilePhotoFixture.db.prepare(sql).get(...args)||null; export const run=async(sql,...args)=>globalThis.__profilePhotoFixture.db.prepare(sql).run(...args); export const blockSQL=()=> '(? IS ?)' ;",
  };
  t.after(async () => { delete globalThis.__profilePhotoFixture; db.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {POST} from './app/api/collectors/photos/route.ts'; export {GET} from './app/community/media/[id]/route.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "photo-api-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  db.prepare("INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@example.test',0,0)").run();
  db.prepare("INSERT INTO collector_profiles (id,user_id,display_name,handle) VALUES ('owner','owner','Owner','owner')").run();
  db.prepare("INSERT INTO community_settings (user_id,published) VALUES ('owner',0)").run();
  const jpeg = new Uint8Array([255,216,255,225,0,8,71,80,83,49,50,51,255,219,0,4,0,1,255,218,0,2,1,2,255,217]);
  const crop = { kind: "cover", x: 0.75, y: 0.9, zoom: 1.4 };
  function upload(extra = true, cropText = JSON.stringify(crop), original = new Blob([jpeg], { type: "image/jpeg" })) {
    const form = new FormData(); form.set("photo", new Blob([jpeg], { type: "image/jpeg" }), "photo.jpg");
    if (extra) { form.set("original", original, "original.jpg"); form.set("crop", cropText); }
    return api.POST(new Request("https://mcc.test/api/collectors/photos", { method: "POST", body: form }));
  }
  const get = (id, original = false) => api.GET(new Request(`https://mcc.test/community/media/${id}${original ? "?original=1" : ""}`), { params: Promise.resolve({ id }) });
  const response = await upload(); assert.equal(response.status, 200);
  const { id } = await response.json();
  assert.equal(objects.size, 2);
  assert.equal(db.prepare("SELECT owner_id FROM community_media WHERE id=?").get(id).owner_id, "owner");
  for (const object of objects.values()) assert.ok(!new TextDecoder().decode(object.body).includes("GPS"), "Both versions strip location metadata");
  const original = await get(id, true); assert.equal(original.status, 200);
  assert.deepEqual(JSON.parse(original.headers.get("X-Profile-Crop")), crop);
  assert.equal(original.headers.get("Cache-Control"), "private, no-store"); assert.equal(original.headers.get("Vary"), "Cookie");
  fixture.viewer = null;
  assert.equal((await get(id, true)).status, 404); assert.equal((await get(id)).status, 404);
  db.prepare("UPDATE community_settings SET cover_id=?,published=1 WHERE user_id='owner'").run(id);
  assert.equal((await get(id)).status, 200, "Saving a public profile exposes the cropped version");
  assert.equal((await get(id, true)).status, 404, "A public profile never exposes its original");
  assert.equal((await get(`${id}.original`)).status, 404, "The source cannot be read through the ordinary image path");
  fixture.viewer = "other"; assert.equal((await get(id, true)).status, 404);
  fixture.viewer = "owner";
  const legacy = await upload(false); assert.equal(legacy.status, 200);
  const legacyId = (await legacy.json()).id;
  const legacySource = await get(legacyId, true); assert.equal(legacySource.status, 200); assert.equal(legacySource.headers.get("X-Profile-Crop"), null);
  const before = objects.size;
  for (const invalid of ["{", "null", JSON.stringify({ ...crop, zoom: 0 }), JSON.stringify({ ...crop, x: 5 }), JSON.stringify({ ...crop, kind: "post" })]) assert.equal((await upload(true, invalid)).status, 400);
  assert.equal((await upload(true, JSON.stringify(crop), new Blob(["not a jpeg"]))).status, 400);
  assert.equal(objects.size, before, "Invalid crops do not leave uploaded objects");
  const nextId = (await (await upload()).json()).id;
  assert.notEqual(id, nextId); assert.ok(objects.has(`community/${id}.jpg`), "Repositioning never overwrites the currently saved image");
  fixture.viewer = null; assert.equal((await upload()).status, 401);
});
