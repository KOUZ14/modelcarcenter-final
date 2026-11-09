import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { config } from "../lib/config.ts";
import { createConnectedAccount, configureSellerWeeklyPayouts } from "../lib/stripe.ts";
import { isWeeklySellerPayoutSchedule, sellerPayoutNotice } from "../lib/payout-schedule.ts";
import { processSellerPayoutSchedules } from "../lib/seller-payout-schedules.ts";

test("weekly scheduling changes only the connected account bank schedule and verifies it", async (t) => {
  const originalFetch = globalThis.fetch, originalKey = config.stripeSecretKey;
  config.stripeSecretKey = "sk_test_payout_fixture";
  t.after(() => { globalThis.fetch = originalFetch; config.stripeSecretKey = originalKey; });
  const requests = [];
  let schedule = { interval: "daily", delay_days: 2 };
  let sellerId = "seller1", dashboard = "express", ignoreUpdate = false;
  globalThis.fetch = async (url, init) => {
    const body = init.body ? Object.fromEntries(init.body) : null;
    requests.push({ url, method: init.method, body });
    if (init.method === "POST" && !ignoreUpdate) schedule = { interval: "weekly", weekly_anchor: "monday", delay_days: 2 };
    return Response.json({ id: "acct_fixture", metadata: { seller_id: sellerId }, controller: { losses: { payments: "application" }, stripe_dashboard: { type: dashboard } }, settings: { payouts: { schedule } } });
  };
  await createConnectedAccount({ sellerId: "new", email: "fixture@example.com", storeName: "Fixture" });
  assert.equal(requests[0].body["settings[payouts][schedule][interval]"], "weekly");
  assert.equal(requests[0].body["settings[payouts][schedule][weekly_anchor]"], "monday");
  requests.length = 0; schedule = { interval: "daily", delay_days: 2 };
  await configureSellerWeeklyPayouts("acct_fixture", "seller1");
  assert.deepEqual(requests.map(r => r.method), ["GET", "POST", "GET"]);
  assert.deepEqual(requests[1].body, { "settings[payouts][schedule][interval]": "weekly", "settings[payouts][schedule][weekly_anchor]": "monday" });
  assert.ok(requests.every(r => r.url === "https://api.stripe.com/v1/accounts/acct_fixture"));
  assert.equal(schedule.delay_days, 2);
  requests.length = 0;
  await configureSellerWeeklyPayouts("acct_fixture", "seller1");
  assert.deepEqual(requests.map(r => r.method), ["GET"]);
  sellerId = "another-seller"; requests.length = 0;
  await assert.rejects(() => configureSellerWeeklyPayouts("acct_fixture", "seller1"), /operations review/);
  assert.deepEqual(requests.map(r => r.method), ["GET"]);
  sellerId = "seller1"; dashboard = "full";
  await assert.rejects(() => configureSellerWeeklyPayouts("acct_fixture", "seller1"), /operations review/);
  dashboard = "express"; schedule = { interval: "daily" }; ignoreUpdate = true;
  await assert.rejects(() => configureSellerWeeklyPayouts("acct_fixture", "seller1"), /not confirmed/);
});

test("one weekly payout day is required and notices distinguish release from bank arrival", () => {
  assert.equal(isWeeklySellerPayoutSchedule({ interval: "weekly", weekly_anchor: "monday" }), true);
  assert.equal(isWeeklySellerPayoutSchedule({ interval: "weekly", weekly_payout_days: ["monday"] }), true);
  assert.equal(isWeeklySellerPayoutSchedule({ interval: "weekly", weekly_anchor: "monday", weekly_payout_days: ["monday", "friday"] }), false);
  assert.equal(isWeeklySellerPayoutSchedule({ interval: "daily", weekly_anchor: "monday" }), false);
  assert.equal(isWeeklySellerPayoutSchedule(), false);
  const notice = sellerPayoutNotice("https://example.com", "professional");
  assert.match(notice.body, /14 calendar days after confirmed delivery/);
  assert.match(notice.body, /additional business days/);
  assert.match(notice.body, /existing orders keep their recorded release deadlines/i);
  assert.match(notice.body, /https:\/\/example.com\/store\?view=payments/);
  assert.match(sellerPayoutNotice("https://example.com", "collector").body, /\/account\?view=payments/);
});

test("existing sellers are migrated independently; notices follow verification and retry without duplication", async () => {
  const miniflare = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "payout-test", modules: true, script: "export default { fetch() { return new Response('ok') } }", compatibilityDate: "2026-08-21", d1Databases: { DB: `payout-${crypto.randomUUID()}` } }] }));
  try {
    const database = await miniflare.getD1Database("DB", "payout-test");
    const migration = await readFile(new URL("../drizzle/0043_weekly_seller_payouts.sql", import.meta.url), "utf8");
    await database.batch([
      database.prepare("CREATE TABLE sellers (id TEXT PRIMARY KEY, stripe_account_id TEXT, contact_email TEXT, seller_type TEXT, status TEXT)"),
      database.prepare("CREATE TABLE legal_notifications (id TEXT PRIMARY KEY, recipient TEXT, subject TEXT, body TEXT, sent_at TEXT)"),
      database.prepare(migration),
      database.prepare("INSERT INTO sellers VALUES ('a','acct_a','a@example.com','professional','active'), ('b','acct_b','b@example.com','collector','onboarding'), ('c','acct_c','c@example.com','collector','suspended'), ('d',NULL,'d@example.com','professional','applicant')"),
    ]);
    let failA = true;
    const calls = [];
    const configure = async (accountId, sellerId) => {
      calls.push([accountId, sellerId]);
      if (sellerId === "a" && failA) throw new Error("temporary provider failure");
      return { id: accountId };
    };
    const run = iso => processSellerPayoutSchedules({ database, configure, now: new Date(iso), limit: 1 });
    assert.deepEqual(await run("2026-11-09T00:00:00Z"), { verified: 0, failed: 1 });
    // A failing account cannot starve the next seller in a bounded batch.
    assert.deepEqual(await run("2026-11-09T00:01:00Z"), { verified: 1, failed: 0 });
    assert.equal((await database.prepare("SELECT COUNT(*) AS n FROM legal_notifications").first()).n, 1);
    assert.equal((await database.prepare("SELECT recipient FROM legal_notifications").first()).recipient, "b@example.com");
    assert.deepEqual(await run("2026-11-09T00:05:00Z"), { verified: 0, failed: 0 });
    failA = false;
    assert.deepEqual(await run("2026-11-09T00:16:00Z"), { verified: 1, failed: 0 });
    await processSellerPayoutSchedules({ database, configure, now: new Date("2026-11-10T01:00:00Z") });
    assert.equal((await database.prepare("SELECT COUNT(*) AS n FROM legal_notifications").first()).n, 2);
    assert.ok(calls.every(([, id]) => id === "a" || id === "b"));
    assert.equal((await database.prepare("SELECT last_error FROM seller_payout_schedules WHERE seller_id = 'a'").first()).last_error, null);
    const notice = await database.prepare("SELECT body FROM legal_notifications WHERE recipient='a@example.com'").first();
    assert.match(notice.body, /weekly bank payouts on Mondays/);
  } finally { await miniflare.dispose(); }
});
