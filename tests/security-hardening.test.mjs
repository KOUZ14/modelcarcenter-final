import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { memoryAdapter } from "better-auth/adapters/memory";
import { assertRequestOrigin, boundRequestBody, protectRequest, requestBodyLimit, requestRateRules, requestSecurityFailure } from "../lib/request-security.ts";
import { clientRateLimitIdentity, consumeRateLimit, pruneSecurityRateLimits } from "../lib/security-rate-limit.ts";

const origin = "https://shop.example.test";
const secret = "test-only-security-secret-with-at-least-32-characters";
const root = fileURLToPath(new URL("../", import.meta.url));

async function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(await readFile(new URL("../drizzle/0022_security_rate_limits.sql", import.meta.url), "utf8"));
  t.after(() => sqlite.close());
  const binding = {
    prepare(sql) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { return { success: true, meta: sqlite.prepare(sql).run(...values) }; },
      };
    },
  };
  return { sqlite, binding };
}

function post(path = "/api/account", headers = {}, body = "{}") {
  return new Request(origin + path, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body });
}

test("mutation origin checks cover JSON, forms, uploads, missing and forged origins", () => {
  for (const path of ["/api/account", "/api/admin", "/api/resolution", "/api/listings/images", "/api/auth/sign-in/magic-link", "/some-action"]) {
    for (const source of ["https://evil.test", "https://sub.shop.example.test", "null", origin + ".evil.test"]) {
      for (const contentType of ["application/json", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=a"]) {
        assert.throws(() => assertRequestOrigin(post(path, { origin: source, "content-type": contentType }), origin, true), { status: 403 });
      }
    }
    assert.doesNotThrow(() => assertRequestOrigin(post(path), origin, true));
    const missing = post(path); missing.headers.delete("origin");
    assert.throws(() => assertRequestOrigin(missing, origin, true), { status: 403 });
    missing.headers.set("referer", origin + "/account");
    assert.doesNotThrow(() => assertRequestOrigin(missing, origin, true));
    missing.headers.set("origin", "null");
    assert.throws(() => assertRequestOrigin(missing, origin, true), { status: 403 });
  }
  assert.throws(() => assertRequestOrigin(post("/api/account", { "sec-fetch-site": "cross-site" }), origin, true), { status: 403 });
  assert.throws(() => assertRequestOrigin(new Request("https://evil.test/api/account", { method: "POST", headers: { origin: "https://evil.test", "x-forwarded-host": "shop.example.test" } }), origin, true), { status: 403 });
});

test("only exact authenticated webhook routes bypass the browser origin guard", () => {
  for (const path of ["/api/stripe/webhook", "/api/stripe/webhook-connect/", "/api/shippo/webhook?token=private"]) {
    const request = post(path); request.headers.delete("origin");
    assert.doesNotThrow(() => assertRequestOrigin(request, origin, true));
    assert.deepEqual(requestRateRules(request), []);
  }
  for (const path of ["/api/stripe/webhook/other", "/api/stripe/webhook-connect-other", "/api/account?webhook=1"]) {
    assert.throws(() => assertRequestOrigin(post(path, { origin: "null" }), origin, true), { status: 403 });
  }
});

test("byte limits reject dishonest and absent lengths before parsing and preserve webhook bytes", async () => {
  await assert.rejects(boundRequestBody(post("/api/account", { "content-length": "1000" }), 8), { status: 413 });
  await assert.rejects(boundRequestBody(post("/api/account", { "content-length": "1" }, "0123456789"), 8), { status: 413 });
  await assert.rejects(boundRequestBody(post("/api/account", { "content-encoding": "gzip" }), 8), { status: 415 });
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; },
  });
  const chunked = new Request(origin + "/api/account", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(boundRequestBody(chunked, 8), { status: 413 });
  assert.equal(cancelled, true);
  await assert.rejects(boundRequestBody(post("/api/account", {}, "ééé"), 5), { status: 413 });
  const raw = '{ "amount": 1500, "text": "é" }\n';
  assert.equal(await (await boundRequestBody(post("/api/stripe/webhook", {}, raw))).text(), raw);
  assert.equal(requestBodyLimit(post("/api/auth/sign-in/magic-link")), 16 * 1024);
  assert.equal(requestBodyLimit(post("/api/listings/images", { "content-type": "multipart/form-data; boundary=a" })), 11 * 1024 * 1024);
});

test("multipart photos within the body budget remain readable", async () => {
  const form = new FormData();
  form.set("productId", "product-1");
  form.set("files", new File([new Uint8Array(10 * 1024 * 1024)], "photo.png", { type: "image/png" }));
  const request = new Request(origin + "/api/listings/images", { method: "POST", headers: { origin }, body: form });
  const parsed = await (await boundRequestBody(request)).formData();
  assert.equal(parsed.get("productId"), "product-1");
  assert.equal(parsed.get("files").size, 10 * 1024 * 1024);
});

test("D1 limits are atomic across concurrent consumers, private, expiring, and prunable", async (t) => {
  const { sqlite, binding } = await database(t);
  const rule = { scope: "login", max: 3, windowSeconds: 60 };
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(binding, rule, "collector@example.test", secret, 1000)));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal(sqlite.prepare("SELECT count FROM security_rate_limits").get().count, 3);
  assert.match(sqlite.prepare("SELECT id FROM security_rate_limits").get().id, /^[a-f0-9]{64}$/);
  assert.equal((await consumeRateLimit(binding, rule, "collector@example.test", secret, 60_999)).allowed, false);
  assert.equal((await consumeRateLimit(binding, rule, "collector@example.test", secret, 61_000)).allowed, true);
  assert.equal((await consumeRateLimit(binding, rule, "other@example.test", secret, 61_000)).allowed, true);
  await pruneSecurityRateLimits(binding, 121_000);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM security_rate_limits").get().count, 0);
});

test("identity ignores spoofed forwarding headers and groups IPv6 interface addresses", () => {
  assert.equal(clientRateLimitIdentity(new Headers({ "x-forwarded-for": "1.2.3.4" })), "unknown-ingress");
  assert.equal(clientRateLimitIdentity(new Headers({ "cf-connecting-ip": "192.0.2.1", "x-real-ip": "1.2.3.4" })), "192.0.2.1");
  assert.equal(clientRateLimitIdentity(new Headers({ "cf-connecting-ip": "2001:db8::1" })), clientRateLimitIdentity(new Headers({ "cf-connecting-ip": "2001:0db8:0:0:ffff::abcd" })));
  assert.equal(clientRateLimitIdentity(new Headers({ "cf-connecting-ip": "invalid" })), "unknown-ingress");
});

test("the request guard returns retryable 429 and fails closed on storage errors", async (t) => {
  const { binding } = await database(t);
  const options = { database: binding, siteUrl: origin, secret, production: true };
  for (let i = 0; i < 5; i++) assert.ok(await protectRequest(post("/api/auth/sign-in/magic-link"), options) instanceof Request);
  const rejected = await protectRequest(post("/api/auth/sign-in/magic-link"), options);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("retry-after"), "600");
  assert.equal(rejected.headers.get("cache-control"), "no-store");
  const broken = { prepare() { throw new Error("secret storage details"); } };
  await assert.rejects(protectRequest(post(), { ...options, database: broken }));
  const unavailable = requestSecurityFailure(new Error("secret storage details"));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /secret storage/);
});

test("Worker ingress enforces guards before dispatch and preserves security headers and cookies", async (t) => {
  const { binding } = await database(t);
  const scratch = await mkdtemp(join(root, ".security-worker-test-"));
  const bundlePath = join(scratch, "worker.mjs");
  globalThis.__securityWorkerTest = { calls: [] };
  t.after(async () => {
    delete globalThis.__securityWorkerTest;
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch).catch(() => {});
  });
  const mocks = {
    "vinext/server/app-router-entry": `export default { async fetch(request) {
      globalThis.__securityWorkerTest.calls.push(await request.text());
      return new Response("ok", { headers: { "Set-Cookie": "session=value; HttpOnly; Secure; SameSite=Lax", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" } });
    } };`,
    "vinext/server/image-optimization": "export const DEFAULT_DEVICE_SIZES = []; export const DEFAULT_IMAGE_SIZES = []; export function handleImageOptimization() { throw new Error('Unexpected image optimization'); }",
    "../lib/resolution-notifications": "export const processResolutionNotifications = async () => ({});",
    "../lib/seller-transfers": "export const processEligibleSellerTransfers = async () => ({});",
    "../lib/preorder-maintenance": "export const processPreorders = async () => ({});",
    "../lib/promotion-payments": "export const processPromotions = async () => ({});",
    "../lib/config": `export const config = { siteUrl: ${JSON.stringify(origin)}, betterAuthSecret: ${JSON.stringify(secret)} };`,
  };
  const result = await build({
    entryPoints: [join(root, "worker/index.ts")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "worker-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "security-test" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "security-test" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const { default: worker } = await import(pathToFileURL(bundlePath).href);
  const execute = (request, db = binding) => worker.fetch(request, { DB: db }, {});
  const denied = await execute(post("/api/account", { origin: "https://evil.test" }));
  assert.equal(denied.status, 403);
  assert.match(denied.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(denied.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await execute(post("/api/account", {}, "x".repeat(65537)))).status, 413);
  assert.equal((await execute(post(), { prepare() { throw new Error("Storage unavailable"); } })).status, 503);
  assert.equal(globalThis.__securityWorkerTest.calls.length, 0);
  const raw = '{ "test": "raw webhook bytes" }\n';
  const webhook = post("/api/stripe/webhook", {}, raw); webhook.headers.delete("origin");
  assert.equal((await execute(webhook)).status, 200);
  assert.equal(globalThis.__securityWorkerTest.calls[0], raw);
  const auth = await execute(post("/%61pi/auth/sign-out"));
  assert.equal(auth.status, 200);
  assert.equal(auth.headers.get("cache-control"), "private, no-store");
  assert.equal(auth.headers.get("referrer-policy"), "no-referrer");
  assert.equal(auth.headers.get("access-control-allow-origin"), null);
  assert.equal(auth.headers.get("access-control-allow-credentials"), null);
  assert.match(auth.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
});

test("real Better Auth magic links are hashed, single-use, expiring, and uniformly throttled", async (t) => {
  const { binding } = await database(t);
  const scratch = await mkdtemp(join(root, ".security-auth-test-"));
  const bundlePath = join(scratch, "auth.mjs");
  const rows = { user: [], session: [], account: [], verification: [] };
  const deliveries = [];
  globalThis.__securityAuthTest = { binding, adapter: memoryAdapter(rows), deliveries };
  t.after(async () => {
    delete globalThis.__securityAuthTest;
    await unlink(bundlePath).catch(() => {});
    await rmdir(scratch).catch(() => {});
  });
  const mocks = {
    "@/db": "export const getDb = () => ({}); export const getD1 = () => globalThis.__securityAuthTest.binding;",
    "@/db/schema": "export const user = {}; export const session = {}; export const account = {}; export const verification = {};",
    "@better-auth/drizzle-adapter": "export const drizzleAdapter = () => globalThis.__securityAuthTest.adapter;",
    "./config": `export const config = { siteUrl: ${JSON.stringify(origin)}, betterAuthSecret: ${JSON.stringify(secret)} };`,
    "./email": "export async function sendAuthMagicLinkEmail(input) { globalThis.__securityAuthTest.deliveries.push(input); return { sent: true }; }",
  };
  const result = await build({
    entryPoints: [join(root, "lib/auth.ts")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "auth-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "security-test" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "security-test" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const { getCollectorAuth } = await import(pathToFileURL(bundlePath).href);
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let auth;
  try { auth = getCollectorAuth(); } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
  const requestLink = (email, ip = "192.0.2.20") => auth.handler(post("/api/auth/sign-in/magic-link", { "cf-connecting-ip": ip }, JSON.stringify({ email, callbackURL: "/account" })));
  const first = await requestLink("collector@example.test");
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { status: true });
  const token = new URL(deliveries[0].url).searchParams.get("token");
  assert.ok(token);
  assert.equal(JSON.stringify(rows.verification).includes(token), false);
  assert.ok(new Date(rows.verification[0].expiresAt).getTime() <= Date.now() + 600_000);
  const verified = await auth.handler(new Request(deliveries[0].url, { headers: { "cf-connecting-ip": "192.0.2.21" } }));
  assert.equal(verified.status, 302);
  assert.match(verified.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(verified.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.match(verified.headers.get("set-cookie"), /Secure/i);
  assert.equal(rows.session.length, 1);
  const replay = await auth.handler(new Request(deliveries[0].url, { headers: { "cf-connecting-ip": "192.0.2.21" } }));
  assert.match(replay.headers.get("location"), /INVALID_TOKEN/);
  assert.equal(rows.session.length, 1);
  for (let i = 0; i < 3; i++) {
    const response = await requestLink("collector@example.test");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: true });
  }
  assert.equal(deliveries.length, 3, "Fourth email is suppressed with the same success response");
  const newAccount = await requestLink("new@example.test", "192.0.2.22");
  assert.deepEqual(await newAccount.json(), { status: true });
  const lastDelivery = deliveries.at(-1);
  rows.verification.at(-1).expiresAt = new Date(Date.now() - 1000);
  const expired = await auth.handler(new Request(lastDelivery.url, { headers: { "cf-connecting-ip": "192.0.2.23" } }));
  assert.match(expired.headers.get("location"), /INVALID_TOKEN/);
  assert.equal(rows.session.length, 1);
  const passwordLogin = await auth.handler(post("/api/auth/sign-in/email", { "cf-connecting-ip": "192.0.2.24" }, JSON.stringify({ email: "collector@example.test", password: "a-password" })));
  assert.ok(passwordLogin.status >= 400);
  const cookie = verified.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const revoked = await auth.handler(post("/api/auth/revoke-sessions", { cookie, "cf-connecting-ip": "192.0.2.25" }));
  assert.equal(revoked.status, 200);
  assert.equal(rows.session.length, 0);
  const stale = await auth.handler(new Request(origin + "/api/auth/get-session", { headers: { cookie } }));
  assert.equal(await stale.json(), null, "Revoked sessions cannot survive in a cookie cache");
});
