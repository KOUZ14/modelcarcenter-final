import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { PhotonImage } from "@cf-wasm/photon";
import { verifiedAdminSession, ADMIN_SESSION_MAX_AGE_MS } from "../lib/admin-session.ts";
import { receiptCookie, hasReceiptAccess, maskedReceiptEmail } from "../lib/receipt-access.ts";
import { requestWithScriptNonce } from "../lib/content-security-policy.ts";
import { verifyShippoSignature } from "../lib/shippo-webhook-auth.ts";
import { securityDatabase, jpegWithMetadata } from "./fixtures/security-database.mjs";

const secret = "test-only-security-secret-at-least-32-characters";
const origin = "https://shop.example.test";
const now = Date.now();

test("admin privileges require a fresh verified session matching both identity and allowlist", () => {
  const user = { email: "admin@example.test", emailVerified: true };
  const session = { createdAt: new Date(now - 1000), expiresAt: new Date(now + 3600000) };
  const allowlist = new Set([user.email]);
  assert.equal(verifiedAdminSession(user.email, { user, session }, allowlist, now), true);
  for (const invalid of [null, { user, session: { ...session, createdAt: new Date(now - ADMIN_SESSION_MAX_AGE_MS) } }, { user, session: { ...session, createdAt: new Date(now + 1) } }, { user, session: { ...session, expiresAt: new Date(now) } }, { user: { ...user, emailVerified: false }, session }, { user: { ...user, email: "attacker@example.test" }, session }]) {
    assert.equal(verifiedAdminSession(user.email, invalid, allowlist, now), false);
  }
  assert.equal(verifiedAdminSession("attacker@example.test", { user, session }, allowlist, now), false);
  assert.equal(verifiedAdminSession(user.email, { user, session }, new Set(), now), false);
});

test("receipt capabilities expire, bind to one checkout and reject tampering", async () => {
  const cookie = await receiptCookie("cs_test_one", secret, true, now);
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/);
  assert.match(cookie, /^__Secure-.*; Path=\/api\/orders;/);
  const headers = new Headers({ cookie: cookie.split(";")[0] });
  assert.equal(await hasReceiptAccess(headers, "cs_test_one", secret, true, now), true);
  assert.equal(await hasReceiptAccess(headers, "cs_test_two", secret, true, now), false);
  assert.equal(await hasReceiptAccess(headers, "cs_test_one", secret, true, now + 86400000), false);
  assert.equal(await hasReceiptAccess(headers, "cs_test_one", "other-secret-with-at-least-32-characters", true, now), false);
  headers.set("cookie", headers.get("cookie").replace(/.$/, c => c === "a" ? "b" : "a"));
  assert.equal(await hasReceiptAccess(headers, "cs_test_one", secret, true, now), false);
  assert.equal(await hasReceiptAccess(new Headers(), "cs_test_one", secret, true, now), false);
  await assert.rejects(receiptCookie("cs_test_one", "short", true, now));
  await assert.rejects(receiptCookie("cs_test_one; injected=1", secret, true, now));
  assert.equal(maskedReceiptEmail("buyer@example.test"), "b***@example.test");
});

test("production CSP uses unpredictable server nonces and ignores attacker headers", () => {
  const input = new Request(origin, { headers: { "x-nonce": "evil", "content-security-policy": "script-src 'unsafe-inline'", "content-security-policy-report-only": "evil" } });
  const one = requestWithScriptNonce(input, true), two = requestWithScriptNonce(input, true);
  assert.notEqual(one.request.headers.get("x-nonce"), two.request.headers.get("x-nonce"));
  assert.match(one.policy, new RegExp(`script-src 'nonce-${one.request.headers.get("x-nonce").replace(/[+]/g, "\\+")}' 'strict-dynamic'`));
  assert.doesNotMatch(one.policy.split(";").find(part => part.trim().startsWith("script-src ")), /unsafe-inline|unsafe-eval|evil/);
  assert.equal(one.request.headers.get("content-security-policy-report-only"), null);
});

test("Shippo HMAC authenticates exact bytes and rejects replay windows and unsigned downgrades", async () => {
  const body = '{ "event": "track_updated" }\n', timestamp = Math.floor(now / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`))).toString("hex");
  const signature = `t=${timestamp},v1=${mac}`;
  assert.equal(await verifyShippoSignature(body, signature, secret, now), true);
  for (const value of [null, "", signature + ",t=" + timestamp, signature.replace("v1=", "v2=")]) assert.equal(await verifyShippoSignature(body, value, secret, now), false);
  assert.equal(await verifyShippoSignature(body.trim(), signature, secret, now), false);
  assert.equal(await verifyShippoSignature(body, signature, secret, now + 301000), false);
  assert.equal(await verifyShippoSignature(body, signature, secret, now - 301000), false);
});

test("image decoding, upload quotas, cleanup and receipt ownership use the migrated database", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/security-upgrades-"));
  const path = join(scratch, "test.mjs");
  globalThis.__securityUpgrades = { binding, db: drizzle(binding) };
  const result = await build({ stdin: { resolveDir: root, contents: `export * from './lib/image-sanitization.ts'; export * from './lib/managed-uploads.ts'; export { getAuthorizedOrderReceipt } from './lib/orders.ts'; export { processShippoTrackingWebhook } from './lib/shipping.ts'; export { config } from './lib/config.ts';` }, bundle: true, packages: "external", platform: "node", format: "esm", write: false,
    plugins: [{ name: "database", setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const getD1=()=>globalThis.__securityUpgrades.binding; export const getDb=()=>globalThis.__securityUpgrades.db;" }));
    } }],
  });
  await writeFile(path, result.outputFiles[0].contents);
  t.after(async () => { delete globalThis.__securityUpgrades; await rm(scratch, { recursive: true }); });
  const api = await import(pathToFileURL(path).href);
  await t.test("actual decoding rejects fake signatures, MIME spoofing, and excessive pixel dimensions", () => {
    const source = jpegWithMetadata();
    const sanitized = api.sanitizeUploadedImage(new Uint8Array([...source, ...new TextEncoder().encode("<script>evil</script>")]), "image/jpeg");
    assert.equal(Buffer.from(sanitized.bytes).includes(Buffer.from("GPS")), false);
    assert.equal(Buffer.from(sanitized.bytes).includes(Buffer.from("<script>")), false);
    const decoded = PhotonImage.new_from_byteslice(sanitized.bytes);
    assert.equal(decoded.get_width(), 1); decoded.free();
    assert.throws(() => api.sanitizeUploadedImage(source, "image/png"), /valid JPEG/);
    assert.throws(() => api.sanitizeUploadedImage(new Uint8Array([255,216,255,225,0,5,71,80,83,255,217]), "image/jpeg"), /valid JPEG/);
    const largeHeader = Buffer.from("89504e470d0a1a0a0000000d49484452ffffffffffffffff0802000000", "hex");
    assert.throws(() => api.sanitizeUploadedImage(largeHeader, "image/png"), /6 megapixels/);
  });
  const objects = new Map();
  const storage = { async put(key, value) { objects.set(key, value); }, async delete(key) { objects.delete(key); } };
  const put = (key, bytes = new Uint8Array([1,2,3])) => api.putManagedUpload({ database: binding, storage, ownerId: "owner", key, bytes, mime: "image/jpeg" });
  await t.test("simultaneous writes cannot exceed a quota and rejected transactions leave no partial charge", async () => {
    await put("first");
    sqlite.prepare("UPDATE security_upload_budgets SET files=4999 WHERE id='site-daily'").run();
    const outcomes = await Promise.allSettled([put("second"), put("third"), put("fourth")]);
    assert.equal(outcomes.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(objects.size, 2);
    assert.equal(sqlite.prepare("SELECT files FROM security_upload_budgets WHERE id='owner-daily:owner'").get().files, 2);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM security_uploads").get().count, 2);
    const before = sqlite.prepare("SELECT bytes FROM security_upload_budgets WHERE id='site-stored'").get().bytes;
    await api.deleteManagedUpload(binding, storage, "first"); await api.deleteManagedUpload(binding, storage, "first");
    assert.equal(sqlite.prepare("SELECT bytes FROM security_upload_budgets WHERE id='site-stored'").get().bytes, before - 3);
    assert.equal(sqlite.prepare("SELECT files FROM security_upload_budgets WHERE id='site-daily'").get().files, 5000, "Deletion cannot reset the daily upload budget");
  });
  await t.test("failed object writes refund storage budgets and cleanup keeps attached photos", async () => {
    sqlite.prepare("UPDATE security_upload_budgets SET expires_at=1 WHERE id='site-daily'").run();
    await assert.rejects(api.putManagedUpload({ database: binding, storage: { ...storage, async put() { throw new Error("storage failure"); } }, ownerId: "owner", key: "failed", bytes: new Uint8Array([1]), mime: "image/jpeg" }), /storage failure/);
    assert.equal(sqlite.prepare("SELECT size_bytes FROM security_uploads WHERE storage_key='failed'").get().size_bytes, 0);
    await put("store-logos/seller/attached.jpg"); await put("store-logos/seller/unused.jpg");
    sqlite.prepare("INSERT INTO sellers(id,slug,store_name,contact_name,contact_email,logo_url) VALUES('seller','seller','Store','Owner','owner@example.test','/media/store-logos/seller/attached.jpg')").run();
    sqlite.prepare("UPDATE security_uploads SET created_at=0").run();
    await api.pruneManagedUploads(binding, storage);
    assert.equal(objects.has("store-logos/seller/attached.jpg"), true);
    assert.equal(objects.has("store-logos/seller/unused.jpg"), false);
    assert.throws(() => sqlite.prepare("UPDATE sellers SET logo_url='/media/store-logos/seller/unused.jpg' WHERE id='seller'").run(), /expired/);
  });
  await t.test("copied receipt IDs cannot cross account boundaries and responses mask email", async () => {
    sqlite.prepare("INSERT INTO orders(id,order_number,seller_id,stripe_checkout_session_id,buyer_email,payment_status,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents) VALUES('receipt','ORDER-1','seller','cs_test_receipt','buyer@example.test','paid','usd',1000,0,0,1000)").run();
    assert.equal(await api.getAuthorizedOrderReceipt("cs_test_receipt", { guestAuthorized: false, userId: "other", verifiedEmail: "other@example.test" }), null);
    const access = await api.getAuthorizedOrderReceipt("cs_test_receipt", { guestAuthorized: false, userId: "buyer", verifiedEmail: "buyer@example.test" });
    assert.equal(access.buyerEmail, "b***@example.test");
    assert.equal(access.orders[0].buyerEmail, "b***@example.test");
    assert.equal((await api.getAuthorizedOrderReceipt("cs_test_receipt", { guestAuthorized: true })).orderNumber, "ORDER-1");
    assert.equal(await api.getAuthorizedOrderReceipt("cs_test_receipt", { guestAuthorized: false, userId: "buyer" }), null);
  });
  await t.test("forged delivery events cannot change payout eligibility without authoritative provider confirmation", async () => {
    api.config.shippoApiKey = "shippo_test_fixture";
    sqlite.prepare("UPDATE orders SET carrier='usps',tracking_number='test123' WHERE id='receipt'").run();
    const originalFetch = globalThis.fetch;
    let calls = 0, trackingStatus = "TRANSIT", wrongIdentity = false;
    globalThis.fetch = async url => {
      assert.equal(String(url), "https://api.goshippo.com/tracks/usps/test123"); calls++;
      return Response.json({ carrier: "usps", tracking_number: wrongIdentity ? "other" : "test123", tracking_status: { status: trackingStatus, status_date: new Date().toISOString() } });
    };
    try {
      const event = { event: "track_updated", test: true, data: { carrier: "usps", tracking_number: "test123", tracking_status: { status: "DELIVERED" } } };
      await api.processShippoTrackingWebhook(event);
      let row = sqlite.prepare("SELECT * FROM orders WHERE id='receipt'").get();
      assert.equal(calls, 1); assert.equal(row.fulfillment_status, "shipped"); assert.equal(row.delivered_at, null); assert.equal(row.payout_eligible_at, null);
      wrongIdentity = true;
      await assert.rejects(api.processShippoTrackingWebhook(event), /verification/);
      wrongIdentity = false; trackingStatus = "DELIVERED";
      await api.processShippoTrackingWebhook(event);
      row = sqlite.prepare("SELECT * FROM orders WHERE id='receipt'").get();
      assert.equal(row.fulfillment_status, "delivered"); assert.ok(row.delivered_at); assert.ok(row.payout_eligible_at);
      await api.processShippoTrackingWebhook(event);
      assert.equal(sqlite.prepare("SELECT payout_eligible_at FROM orders WHERE id='receipt'").get().payout_eligible_at, row.payout_eligible_at);
      const before = calls;
      await assert.rejects(api.processShippoTrackingWebhook({ ...event, test: false }), /mode/);
      assert.equal(calls, before);
    } finally { globalThis.fetch = originalFetch; }
  });
});
