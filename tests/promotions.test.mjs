import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { config } from "../lib/config.ts";
import { POLICY_VERSION } from "../lib/legal.ts";
import { PROMOTION_DURATION_MS, PROMOTION_TOKEN_MS, PROMOTION_TERMS_VERSION, rotatePromotions, signPromotionToken, verifyPromotionToken } from "../lib/promotion-rules.ts";
import { buildPromotionCheckoutBody } from "../lib/stripe.ts";

test("promotion rotation preserves seller diversity, organic exclusions and changes over time", () => {
  const rows = Array.from({ length: 24 }, (_, n) => ({ id: `c${n}`, productId: `p${n}`, sellerId: `s${n % 4}` }));
  const selected = rotatePromotions(rows, ["p0", "p1"], 60_000);
  assert.equal(selected.length, 2); assert.equal(new Set(selected.map(r => r.sellerId)).size, 2);
  assert.ok(selected.every(r => !["p0", "p1"].includes(r.productId)));
  assert.deepEqual(selected, rotatePromotions([...rows].reverse(), ["p0", "p1"], 60_000));
  assert.ok(new Set(Array.from({ length: 120 }, (_, n) => rotatePromotions(rows, [], n * 60_000).map(r => r.sellerId).join(","))).size > 1);
});

test("placement tokens reject forgery, expiry, invalid timing and wrong secrets", async () => {
  const secret = "promotion-test-secret-at-least-32-characters", now = Date.now();
  const value = { campaignId: "campaign-1", productId: "product-1", nonce: "page-1", issuedAt: now, expiresAt: now + PROMOTION_TOKEN_MS };
  const token = await signPromotionToken(value, secret);
  assert.deepEqual(await verifyPromotionToken(token, secret, now), value);
  assert.equal(await verifyPromotionToken(token, secret, now + PROMOTION_TOKEN_MS), null);
  assert.equal(await verifyPromotionToken(token, secret + "different", now), null);
  assert.equal(await verifyPromotionToken(`${token.slice(0, -2)}00`, secret, now), null);
  assert.equal(await verifyPromotionToken(token, secret, now - 1), null);
});

test("promotion checkout is a platform service with no merchandise transfer or shipping", () => {
  const body = buildPromotionCheckoutBody({ campaignId: "c", paymentId: "p", sellerId: "s", title: "Porsche", priceCents: 299, currency: "usd", taxMode: "automatic", taxCode: "txcd_10000000", termsVersion: PROMOTION_TERMS_VERSION, expiresAt: Date.now() + 3600000 });
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "299");
  assert.equal(body.get("metadata[purpose]"), "listing_promotion");
  assert.equal(body.get("payment_intent_data[metadata][promotion_payment_id]"), "p");
  assert.equal(body.get("automatic_tax[enabled]"), "true");
  assert.ok(![...body.keys()].some(k => /transfer|shipping|reservation/.test(k)));
});

test("promotion lifecycle, ledger and placements use real migrated SQLite with mocked Stripe", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime", "promotion-test-")), bundle = join(scratch, "api.mjs");
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir(join(root, "drizzle"))).filter(n => n.endsWith(".sql")).sort()) sqlite.exec(await readFile(join(root, "drizzle", file), "utf8"));
  sqlite.exec("PRAGMA foreign_keys=ON");
  const binding = { prepare(query) { let values = []; return {
    bind(...args) { values = args; return this; },
    async raw() { const s = sqlite.prepare(query); s.setReturnArrays(true); return s.all(...values); },
    async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
    async first(column) { const row = sqlite.prepare(query).get(...values); return column ? row?.[column] ?? null : row ?? null; },
    async run() { const r = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: r.changes } }; },
  }; }, async batch(statements) {
    sqlite.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  } };
  const sessions = new Map(), refunds = [], disputes = new Map(); let lostResponse = false;
  const fixtureConfig = { ...config, betterAuthSecret: "promotion-fixture-secret-at-least-32-characters", stripeSecretKey: "sk_test_promotions", siteUrl: "https://mcc.test", marketplaceMode: "test" };
  globalThis.__promotionFixture = { db: drizzle(binding), binding, config: fixtureConfig };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input); assert.equal(url.origin, "https://api.stripe.com");
    const body = new URLSearchParams(init.body);
    if (url.pathname === "/v1/checkout/sessions" && init.method === "POST") {
      const key = init.headers["Idempotency-Key"];
      let session = [...sessions.values()].find(s => s.key === key);
      if (!session) {
        const id = `cs_${sessions.size + 1}`, price = Number(body.get("line_items[0][price_data][unit_amount]"));
        session = { id, key, url: `https://checkout.stripe.com/${id}`, status: "open", payment_status: "unpaid", amount_subtotal: price, amount_total: price, currency: "usd", total_details: { amount_tax: 0 },
          metadata: Object.fromEntries([...body].filter(([k]) => /^metadata\[/.test(k)).map(([k,v]) => [k.slice(9,-1),v])),
          payment_intent: { id: `pi_${id}`, latest_charge: { id: `ch_${id}`, balance_transaction: { fee: 39 } } } };
        sessions.set(id, session);
      }
      if (lostResponse) { lostResponse = false; throw new Error("Lost Stripe response"); }
      return Response.json(session);
    }
    if (url.pathname === "/v1/checkout/sessions") return Response.json({ data: [...sessions.values()], has_more: false });
    if (url.pathname.startsWith("/v1/checkout/sessions/")) return Response.json(sessions.get(url.pathname.split("/")[4]));
    if (url.pathname === "/v1/refunds" && init.method === "POST") {
      const key = init.headers["Idempotency-Key"];
      let refund = refunds.find(r => r.key === key);
      if (!refund) {
        const session = [...sessions.values()].find(s => s.payment_intent.id === body.get("payment_intent"));
        refund = { id: `re_${refunds.length + 1}`, amount: Number(body.get("amount")), status: "pending", key, charge: session.payment_intent.latest_charge.id, metadata: { promotion_refund_id: body.get("metadata[promotion_refund_id]") } };
        refunds.push(refund);
      }
      return Response.json(refund);
    }
    if (url.pathname === "/v1/refunds") return Response.json({ data: refunds.filter(r => r.charge === url.searchParams.get("charge")), has_more: false });
    if (url.pathname.startsWith("/v1/payment_intents/")) { const s = [...sessions.values()].find(s => s.payment_intent.id === url.pathname.split("/").at(-1)); return Response.json({ id: s.payment_intent.id, metadata: s.metadata }); }
    if (url.pathname.startsWith("/v1/disputes/")) return Response.json(disputes.get(url.pathname.split("/").at(-1)));
    throw new Error(`Unexpected Stripe request ${url.pathname}`);
  };
  t.after(async () => { globalThis.fetch = originalFetch; delete globalThis.__promotionFixture; sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export * from './lib/promotions.ts';export * from './lib/promotion-payments.ts';export * from './lib/promotion-placements.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "promotion-fixture", setup(b) {
      b.onResolve({ filter: /.*/ }, ({ path }) => { if (path === "@/db") return { path: "db", namespace: "fixture" }; if (/\/(config)(\.ts)?$/.test(path)) return { path: "config", namespace: "fixture" }; if (path.startsWith("@/")) return { path: join(root, `${path.slice(2)}.ts`) }; });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "db" ? "export const getDb=()=>globalThis.__promotionFixture.db;export const getD1=()=>globalThis.__promotionFixture.binding;" : "export const config=globalThis.__promotionFixture.config;export const requireConfig=k=>config[k];" }));
    } }] });
  await writeFile(bundle, output.outputFiles[0].contents); const api = await import(pathToFileURL(bundle).href);
  const row = (sql, ...args) => sqlite.prepare(sql).get(...args), run = (sql, ...args) => sqlite.prepare(sql).run(...args);
  for (const id of ["owner-a", "owner-b"]) run("INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)", id,id,`${id}@test.invalid`);
  for (const id of ["a", "b"]) run("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type,seller_terms_version,seller_terms_accepted_at) VALUES (?,?,?,?,'Owner',?,'active','professional',?,CURRENT_TIMESTAMP)", id, `owner-${id}`, id, `Store ${id}`, `${id}@test.invalid`, POLICY_VERSION);
  run("UPDATE sellers SET stripe_account_id='acct_'||id,stripe_charges_enabled=1,stripe_payouts_enabled=1");
  run("INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','AUTOart','autoart','1:18','Porsche','911','Porsche 911')");
  for (let n = 0; n < 32; n++) run(`INSERT INTO products (id,seller_id,seller_sku,slug,title,description,scale,model_manufacturer,vehicle_make,vehicle_model,condition,price_cents,currency,inventory_quantity,status,availability_type,primary_image_url,created_at,catalog_product_id)
    VALUES (?,?,?,?,?,'Description','1:18','AUTOart','Porsche','911','new',10000,'usd',2,'active','in_stock','https://example.test/car.jpg',?,'model')`, `p-${n}`, n % 2 ? "b" : "a", `sku-${n}`, `listing-${n}`, `Porsche 911 ${n}`, new Date(Date.now() - n * 86_400_000).toISOString());
  const settings = { purchasesEnabled: true, servingEnabled: true, priceCents: 299, taxMode: "none", taxCode: "", sellerIds: "", reason: "Launch test" };
  assert.equal((await api.getPromotionSettings()).purchasesEnabled, true);
  assert.equal((await api.getPromotionSettings()).taxCode, 'txcd_10701000');
  await api.savePromotionSettings(settings, "admin");
  const start = async (n, extra = {}) => api.startPromotionPurchase(n % 2 ? "b" : "a", `p-${n}`, extra.key ?? crypto.randomUUID(), PROMOTION_TERMS_VERSION);
  const pay = async result => { const s = [...sessions.values()].find(s => s.metadata.campaign_id === result.campaignId); s.payment_status = "paid"; s.status = "complete"; await api.synchronizePromotionSession(result.campaignId, s); return s; };

  await t.test("ownership, availability and policy enforced on purchase", async () => {
    await assert.rejects(api.startPromotionPurchase("b", "p-0", crypto.randomUUID(), PROMOTION_TERMS_VERSION), /your store/);
    run("UPDATE products SET availability_type='preorder' WHERE id='p-0'"); await assert.rejects(start(0), /in-stock/);
    run("UPDATE products SET availability_type='in_stock',reserved_quantity=2 WHERE id='p-0'"); await assert.rejects(start(0), /available units/);
    run("UPDATE products SET reserved_quantity=0 WHERE id='p-0'");
    await assert.rejects(api.startPromotionPurchase("a", "p-0", crypto.randomUUID(), "old"), /terms/);
  });
  let active, activeSession;
  await t.test("lost responses reuse one checkout; repeated paid events preserve dates", async () => {
    const key = crypto.randomUUID(); lostResponse = true;
    await assert.rejects(start(24, { key }), /Lost Stripe/);
    active = await start(24, { key }); activeSession = await pay(active);
    const c = await api.getPromotionCampaign(active.campaignId);
    assert.equal(c.status, "active"); assert.equal(c.ends_at - c.starts_at, PROMOTION_DURATION_MS);
    await api.synchronizePromotionSession(c.id, activeSession);
    assert.equal((await api.getPromotionCampaign(c.id)).starts_at, c.starts_at);
    assert.equal(sessions.size, 1);
    await assert.rejects(start(24), /already/);
    await assert.rejects(api.getPromotionCampaign(c.id, "b"), /not found/);
    assert.equal(row("SELECT count(*) n FROM orders").n, 0);
    assert.equal(row("SELECT count(*) n FROM checkout_reservations").n, 0);
  });
  await t.test("pause/resume keep expiry; placements obey filters and can promote first-page listings", async () => {
    const second = await start(25); await pay(second);
    const firstPage = await start(2); await pay(firstPage);
    const placements = await api.getPromotionPlacements({}, null);
    assert.equal(placements.length,2);assert.equal(new Set(placements.map(p=>p.product.sellerId)).size,2);
    const rotations=await Promise.all(Array.from({length:20},(_,n)=>api.getPromotionPlacements({},null,Date.now()+n*60000)));
    assert.ok(rotations.some(rows=>rows.some(p=>p.product.id==='p-2')),'A listing on the first organic page still receives paid placement');
    assert.equal((await api.getPromotionPlacements({ scale: "1:64" }, null)).length, 0);
    assert.equal((await api.getPromotionPlacements({ page: 2 }, null)).length, 0);
    assert.equal((await api.getPromotionPlacements({ seller: "a" }, null)).length, 0);
    assert.equal((await api.getPromotionPlacements({ availability: "preorder" }, null)).length, 0);
    assert.ok((await api.getPromotionPlacements({}, "owner-a")).every(p => p.product.sellerId !== "a"));
    const original = await api.getPromotionCampaign(active.campaignId);
    await api.changePromotionCampaign(original.id, "a", "pause", "owner-a");
    assert.ok((await api.getPromotionPlacements({}, null)).every(p => p.product.id !== "p-24"));
    await api.changePromotionCampaign(original.id, "a", "resume", "owner-a");
    assert.equal((await api.getPromotionCampaign(original.id)).ends_at, original.ends_at);
  });
  await t.test("metrics accept each event once and exclude owner, expired and forged tokens", async () => {
    const placement = (await api.getPromotionPlacements({}, null))[0], now = Date.now() + 1100;
    assert.equal(await api.recordPromotionEvent(placement.token, "impression", null, now), true);
    assert.equal(await api.recordPromotionEvent(placement.token, "impression", null, now), false);
    assert.equal(await api.recordPromotionEvent(placement.token, "click", null, now), true);
    assert.equal(await api.recordPromotionEvent(placement.token, "click", null, now), false);
    const metrics = row("SELECT * FROM promotion_daily_metrics WHERE campaign_id=?", placement.campaignId);
    assert.equal(metrics.impressions, 1); assert.equal(metrics.clicks, 1);
    assert.equal(await api.recordPromotionEvent(placement.token, "impression", null, now + PROMOTION_TOKEN_MS), false);
    const other = (await api.getPromotionPlacements({}, null))[0];
    assert.equal(await api.recordPromotionEvent(other.token, "impression", `owner-${other.product.sellerId}`, now), false);
    assert.equal(await api.recordPromotionEvent(`${other.token}bad`, "click", null, now), false);
  });
  await t.test("cancel during payment refunds once and never activates", async () => {
    const result = await start(26);
    await api.changePromotionCampaign(result.campaignId, "a", "end", "owner-a");
    const session = await pay(result);
    assert.equal((await api.getPromotionCampaign(result.campaignId)).status, "ended");
    await api.synchronizePromotionSession(result.campaignId, session);
    assert.equal(row("SELECT count(*) n FROM promotion_refunds WHERE campaign_id=?", result.campaignId).n, 1);
    await api.processPromotions(); await api.processPromotions();
    assert.equal(refunds.length, 1);
    refunds[0].status = "succeeded"; await api.synchronizePromotionRefunds(result.campaignId);
    assert.equal((await api.getPromotionCampaign(result.campaignId)).refunded_cents, 299);
  });
  await t.test("amount mismatch and stock loss at activation cause refunds", async () => {
    const result = await start(28); run("UPDATE products SET reserved_quantity=2 WHERE id='p-28'"); await pay(result);
    assert.equal((await api.getPromotionCampaign(result.campaignId)).starts_at, null);
    const wrong = await start(30), session = [...sessions.values()].find(s => s.metadata.campaign_id === wrong.campaignId);
    session.amount_subtotal = 999; session.amount_total = 999; await pay(wrong);
    assert.equal((await api.getPromotionCampaign(wrong.campaignId)).starts_at, null);
    assert.equal(row("SELECT amount_cents FROM promotion_refunds WHERE campaign_id=?", wrong.campaignId).amount_cents, 999);
  });
  await t.test("disputes stop placement and require administrator reinstatement after winning", async () => {
    disputes.set("dp-1", { id: "dp-1", status: "needs_response" });
    const event = { id: "evt-dispute", type: "charge.dispute.created", data: { object: { id: "dp-1", charge: activeSession.payment_intent.latest_charge.id, payment_intent: activeSession.payment_intent.id } } };
    await api.processPromotionStripeEvent(event);
    assert.equal((await api.getPromotionCampaign(active.campaignId)).status, "paused");
    await assert.rejects(api.changePromotionCampaign(active.campaignId, "a", "resume", "owner-a"), /administrator/);
    disputes.set("dp-1", { id: "dp-1", status: "won" });
    await api.processPromotionStripeEvent({ ...event, id: "evt-dispute-won", type: "charge.dispute.closed" });
    await api.changePromotionCampaign(active.campaignId, null, "reinstate", "admin", "Dispute won");
    assert.equal((await api.getPromotionCampaign(active.campaignId)).status, "active");
    await api.processPromotionStripeEvent(event);
    assert.equal((await api.getPromotionCampaign(active.campaignId)).status, "active", "An old dispute event cannot undo reinstatement after the dispute is won");
  });
  await t.test("settings separate purchases from serving; expiry enforced without cron", async () => {
    await api.savePromotionSettings({ ...settings, purchasesEnabled: false }, "admin");
    await assert.rejects(start(27), /unavailable/);
    assert.ok((await api.getPromotionPlacements({}, null)).length > 0);
    run("UPDATE promotion_campaigns SET ends_at=? WHERE id=?", Date.now() - 1, active.campaignId);
    assert.ok((await api.getPromotionPlacements({}, null)).every(p => p.campaignId !== active.campaignId));
    assert.equal((await api.getSellerPromotions("a")).listings.find(p => p.id === "p-24").unavailable, null, "Renewal is available without waiting for cron to mark expiry");
    await api.savePromotionSettings({ ...settings, purchasesEnabled: false, servingEnabled: false }, "admin");
    assert.equal((await api.getPromotionPlacements({}, null)).length, 0);
    const own = await api.getSellerPromotions("a"); assert.ok(own.campaigns.every(c => !["p-25", "p-27"].includes(c.product_id)));
    assert.equal((await api.getAdminPromotions()).totals.gross_cents > 0, true);
  });
  await t.test("expired and failed sessions cannot activate; late payment refunds", async () => {
    await api.savePromotionSettings(settings, "admin");
    const abandoned = await start(27), session = [...sessions.values()].find(s => s.metadata.campaign_id === abandoned.campaignId);
    session.status = "expired";
    await api.processPromotionStripeEvent({ id: "evt-expired", type: "checkout.session.expired", data: { object: session } });
    assert.equal((await api.getPromotionCampaign(abandoned.campaignId)).payment_status, "expired");
    await pay(abandoned);
    assert.equal((await api.getPromotionCampaign(abandoned.campaignId)).starts_at, null);
    const delayed = await start(29), pending = [...sessions.values()].find(s => s.metadata.campaign_id === delayed.campaignId);
    pending.status = "complete";
    await api.processPromotionStripeEvent({ id: "evt-failed", type: "checkout.session.async_payment_failed", data: { object: pending } });
    assert.equal((await api.getPromotionCampaign(delayed.campaignId)).payment_status, "failed");
    await pay(delayed);
    assert.equal((await api.getPromotionCampaign(delayed.campaignId)).status, "ended");
  });
  await t.test("partial refunds reserve their balance, reconcile dashboard changes and stop placements", async () => {
    const c = row("SELECT id FROM promotion_campaigns WHERE product_id='p-25'");
    const refundId = await api.queuePromotionRefund(c.id, 100, "partial-1", "Service adjustment", "admin");
    assert.equal(await api.queuePromotionRefund(c.id, 100, "partial-1", "Retry", "admin"), refundId);
    await assert.rejects(api.queuePromotionRefund(c.id, 250, "partial-2", "Too large", "admin"), /balance/);
    assert.ok((await api.getPromotionPlacements({}, null)).every(p => p.campaignId !== c.id));
    await api.processPromotions();
    const refund = refunds.find(r => r.metadata.promotion_refund_id === refundId); assert.ok(refund);
    refund.status = "succeeded"; await api.synchronizePromotionRefunds(c.id);
    assert.equal((await api.getPromotionCampaign(c.id)).refunded_cents, 100);
    const s = [...sessions.values()].find(s => s.metadata.campaign_id === c.id);
    refunds.push({ id: "re-dashboard", amount: 199, status: "succeeded", charge: s.payment_intent.latest_charge.id, metadata: {} });
    await api.synchronizePromotionSession(c.id, s);
    assert.equal((await api.getPromotionCampaign(c.id)).refunded_cents, 299);
    assert.equal((await api.getPromotionCampaign(c.id)).status, "ended");
  });
});
