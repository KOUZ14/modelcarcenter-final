import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { PhotonImage } from "@cf-wasm/photon";
import { createHmac } from "node:crypto";

// Test the production artifact in workerd with disposable storage and no provider access.
const root = resolve("dist/server");
const modulePaths = (await readdir(root, { recursive: true })).filter(path => /\.(?:js|mjs|wasm)$/.test(path));
modulePaths.sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
const authEmails = [];
const app = new Miniflare(convertV4MiniflareOptions({
  log: new Log(LogLevel.ERROR),
  cf: false,
  workers: [{
  name: "security-runtime",
  modulesRoot: root,
  modules: modulePaths.map(path => ({ path: resolve(root, path), type: path.endsWith(".wasm") ? "CompiledWasm" : "ESModule" })),
  compatibilityDate: "2026-08-20", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["IMAGES"],
  bindings: { SITE_URL: "http://localhost", MARKETPLACE_MODE: "test", BETTER_AUTH_SECRET: "isolated-runtime-security-test-secret-with-32-characters", ADMIN_EMAILS: "admin@example.test", STRIPE_SECRET_KEY: "", RESEND_API_KEY: "isolated-email-stub", SHIPPO_API_KEY: "" },
  outboundService: async request => {
    // Capture synthetic authentication email locally. No provider request leaves
    // workerd, and every other external request remains blocked.
    if (request.url === "https://api.resend.com/emails" && request.method === "POST") {
      const message = await request.json();
      if (message.subject === "Sign in to Model Car Center" &&
          [].concat(message.to).every(email => email === "runtime-login@example.test")) {
        authEmails.push(message);
        return Response.json({ id: "isolated-email" });
      }
    }
    return new Response("External services disabled in security validation", { status: 503 });
  },
  }],
}));
try {
  console.log("Starting isolated workerd validation.");
  const database = await app.getD1Database("DB");
  for (const name of (await readdir("drizzle")).filter(name => name.endsWith(".sql")).sort()) {
    for (const sql of unstable_splitSqlQuery(await readFile(resolve("drizzle", name), "utf8"))) await database.prepare(sql).run();
  }
  console.log("All database migrations applied.");
  let previous;
  for (const path of ["/", "/marketplace", "/sign-in", "/checkout/return?reservation_id=00000000-0000-0000-0000-000000000000"]) {
    const response = await app.dispatchFetch(`http://localhost${path}`);
    assert.equal(response.status, 200, `${path}: render succeeds`);
    const csp = response.headers.get("content-security-policy");
    const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, `${path}: production policy has a nonce`);
    assert.notEqual(nonce, previous); previous = nonce;
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    assert.ok(scripts.length > 0, `${path}: scripts are rendered`);
    for (const script of scripts) assert.ok(script[1].includes(`nonce="${nonce}"`), `${path}: every bootstrap/inline script carries the response nonce`);
  }
  const forged = await app.dispatchFetch("http://localhost/api/admin", { headers: { "oai-authenticated-user-email": "admin@example.test" } });
  assert.equal(forged.status, 403, "Unsigned admin header alone cannot authorize an API call");
  const accountStatus = await app.dispatchFetch("http://localhost/api/account");
  assert.deepEqual(await accountStatus.json(), { authenticated: false });
  for (const [path, method, status] of [["/api/admin", "POST", 403], ["/api/admin/images", "POST", 403], ["/api/account", "POST", 401], ["/api/messages", "GET", 401], ["/api/messages", "POST", 401], ["/api/store", "POST", 401], ["/api/resolution", "GET", 401], ["/api/resolution", "POST", 401], ["/api/collectors/photos", "POST", 401]]) {
    const response = await app.dispatchFetch(`http://localhost${path}`, { method, headers: { origin: "http://localhost", "content-type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
    assert.equal(response.status, status, `${method} ${path}: anonymous access denied`);
  }
  let loginUserId;
  for (const attempt of ["new user", "existing user"]) {
    const requested = await app.dispatchFetch("http://localhost/api/auth/sign-in/magic-link", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ email: "runtime-login@example.test", name: "Runtime Login", adultConsent: true, callbackURL: "/account" }),
    });
    assert.equal(requested.status, 200, `${attempt}: magic link requested: ${await requested.clone().text()}`);
    const message = authEmails.shift();
    assert.ok(message, `${attempt}: email captured without contacting a provider`);
    const link = message.text.match(/http:\/\/localhost\/api\/auth\/magic-link\/verify\?[^\s]+/)?.[0];
    assert.ok(link, `${attempt}: verification link present`);
    const verified = await app.dispatchFetch(link, { redirect: "manual" });
    assert.equal(verified.status, 302, `${attempt}: magic link accepted`);
    const loginCookie = verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.match(loginCookie, /__Secure-mcc\.session_token=/);
    const sessionResponse = await app.dispatchFetch("http://localhost/api/auth/get-session", { headers: { cookie: loginCookie } });
    const login = await sessionResponse.json();
    assert.equal(login.user.email, "runtime-login@example.test");
    if (loginUserId) assert.equal(login.user.id, loginUserId, "Existing sign-in retains the user identity");
    loginUserId = login.user.id;
    const replay = await app.dispatchFetch(link, { redirect: "manual" });
    assert.doesNotMatch(replay.headers.get("set-cookie") || "", /mcc\.session_token=/, "Consumed magic links cannot create another session");
  }
  // Seed a real signed Better Auth session only in the disposable database.
  const now = Date.now(), token = "runtime-fixture-session";
  await database.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('collector','Collector','collector@example.test',1,?,?)").bind(now, now).run();
  await database.prepare("INSERT INTO session(id,token,user_id,created_at,updated_at,expires_at) VALUES('session',?,'collector',?,?,?)").bind(token, now, now, now + 3600000).run();
  const signature = createHmac("sha256", "isolated-runtime-security-test-secret-with-32-characters").update(token).digest("base64");
  const cookie = `__Secure-mcc.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  const fixtureImage = new PhotonImage(new Uint8Array(2400 * 2400 * 4).fill(127), 2400, 2400);
  let photoBytes;
  try { photoBytes = fixtureImage.get_bytes_jpeg(90); } finally { fixtureImage.free(); }
  const form = new FormData(); form.set("photo", new Blob([photoBytes], { type: "image/jpeg" }), "photo.jpg");
  // Serialize using Node's Request first: Miniflare and Node have different FormData classes.
  const upload = new Request("http://localhost/api/collectors/photos", { method: "POST", headers: { origin: "http://localhost", cookie }, body: form });
  const body = await upload.arrayBuffer();
  const photo = await app.dispatchFetch(upload.url, { method: "POST", headers: Object.fromEntries(upload.headers), body });
  assert.equal(photo.status, 200, `Wasm decoding and quota-controlled upload: ${await photo.clone().text()}`);
  const { id } = await photo.json();
  assert.ok(await (await app.getR2Bucket("IMAGES")).get(`community/${id}.jpg`));
  await database.prepare("UPDATE security_upload_budgets SET files=200 WHERE id='owner-daily:collector'").run();
  const limited = await app.dispatchFetch(upload.url, { method: "POST", headers: Object.fromEntries(upload.headers), body });
  assert.equal(limited.status, 429, "Real D1 quota errors reject excess uploads");
  const privatePhoto = await app.dispatchFetch(`http://localhost/community/media/${id}?original=1`);
  assert.equal(privatePhoto.status, 404, "Anonymous access cannot read the uploaded original");
  await database.prepare("UPDATE user SET email='admin@example.test' WHERE id='collector'").run();
  const adminHeaders = { cookie, "oai-authenticated-user-email": "admin@example.test" };
  const admin = await app.dispatchFetch("http://localhost/api/admin", { headers: adminHeaders });
  assert.equal(admin.status, 200, "A matching, fresh, verified admin session remains usable");
  await database.prepare("UPDATE session SET created_at=? WHERE id='session'").bind(now - 31 * 60000).run();
  const expiredAdmin = await app.dispatchFetch("http://localhost/api/admin", { headers: adminHeaders });
  assert.equal(expiredAdmin.status, 403, "Stale admin sessions require reauthentication");
  console.log("Production workerd: migrations, new/existing magic-link login, replay rejection, page rendering, CSP nonces, access controls, signed session, 5.76 MP image upload, private original and D1 quota rejection passed.");
} finally { await app.dispose(); }
