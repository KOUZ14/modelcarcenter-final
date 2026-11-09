import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { securityDatabase } from "./fixtures/security-database.mjs";
import { getAdminAnalytics, summarizeAdminAnalytics } from "../lib/admin-analytics.ts";
import { trafficPage, trafficSource } from "../lib/traffic-rules.ts";

test("analytics uses UTC ranges, fills empty days and deduplicates browsers across days", async t => {
  const { sqlite, binding } = await securityDatabase(t);
  const now = new Date("2026-11-06T18:00:00Z");
  const empty = await getAdminAnalytics(binding, false, now);
  assert.deepEqual({ ...empty.accounts }, { total: 0, verified: 0, sellers: 0 });
  assert.equal(summarizeAdminAnalytics(empty, 30).daily.length, 30);
  const account = sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  for (const [id, date, verified] of [["old", "2026-01-01", 1], ["boundary", "2026-08-09", 0], ["week", "2026-10-31", 1], ["today", "2026-11-06", 0]]) {
    account.run(id, `Private ${id}`, `${id}@private.test`, verified, Date.parse(date), Date.parse(date));
  }
  sqlite.exec("INSERT INTO sellers(id,slug,store_name,contact_name,contact_email,owner_user_id) VALUES('seller','seller','Private store','Private name','private@store.test','old')");
  const traffic = sqlite.prepare("INSERT INTO traffic_measurements(id,day,visitor_id,page,source) VALUES(?,?,?,?,?)");
  for (const [id, day, visitor, page, source] of [
    ["a", "2026-11-06", "browser-one", "home", "search"],
    ["b", "2026-10-31", "browser-one", "listing", "search"],
    ["c", "2026-10-08", "browser-two", "listing", "social"],
    ["d", "2026-08-09", "browser-three", "cart", "direct"],
    ["e", "2026-08-08", "expired-browser", "home", "direct"],
    ["f", "2026-11-07", "future-browser", "home", "direct"],
  ]) traffic.run(id, day, visitor, page, source);
  sqlite.exec("INSERT INTO task_measurements(id,name,day) VALUES('task','buyer_search','2026-11-06'),('old-task','buyer_search','2026-08-08')");
  const report = await getAdminAnalytics(binding, true, now);
  assert.deepEqual({ ...report.accounts }, { total: 4, verified: 2, sellers: 1 });
  assert.deepEqual(report.traffic.visitors, { 7: 1, 30: 2, 90: 3 });
  const week = summarizeAdminAnalytics(report, 7), month = summarizeAdminAnalytics(report, 30), quarter = summarizeAdminAnalytics(report, 90);
  assert.equal(week.start, "2026-10-31"); assert.equal(week.newAccounts, 2); assert.equal(week.views, 2);
  assert.equal(week.visitors, 1); assert.equal(week.daily.reduce((n, day) => n + day.visitors, 0), 2);
  assert.equal(month.start, "2026-10-08"); assert.equal(month.views, 3);
  assert.deepEqual(month.sources, { social: 1, search: 2 });
  assert.equal(quarter.start, "2026-08-09"); assert.equal(quarter.newAccounts, 3); assert.equal(quarter.views, 4);
  assert.equal(quarter.totalEvents, 1); assert.equal(quarter.daily.length, 90);
  assert.doesNotMatch(JSON.stringify(report), /private|browser-one|visitor_id|expired-browser|future-browser/);

  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime", "analytics-view-")), output = join(scratch, "view.mjs");
  t.after(async () => { await unlink(output).catch(() => {}); await rmdir(scratch); });
  const compiled = await build({ entryPoints: [join(root, "components/admin-analytics.tsx")], bundle: true, format: "esm", platform: "node", packages: "external", jsx: "automatic", write: false });
  await writeFile(output, compiled.outputFiles[0].contents);
  const { AdminAnalytics } = await import(pathToFileURL(output).href);
  const html = renderToStaticMarkup(createElement(AdminAnalytics, { report }));
  assert.match(html, /Visitors \(browsers\)/); assert.match(html, /Traffic sources/); assert.match(html, /Verified emails/);
  assert.match(html, /Last 7 days/); assert.match(html, /Last 90 days/); assert.match(html, /2026-10-08 to 2026-11-06/);
  const emptyHtml = renderToStaticMarkup(createElement(AdminAnalytics, { report: empty }));
  assert.match(emptyHtml, /paused in test mode/); assert.match(emptyHtml, /No traffic recorded/); assert.match(emptyHtml, /No new accounts/);
});

test("traffic classification never uses private path or referrer content as a dimension", () => {
  assert.equal(trafficPage("/admin/orders"), null); assert.equal(trafficPage("/sign-in"), null);
  assert.equal(trafficPage("/products/private-product"), "listing"); assert.equal(trafficPage("/messages/private-id"), "account");
  assert.equal(trafficPage("/unknown/private"), "other");
  assert.equal(trafficSource("https://www.google.com/search?q=private", "https://store.test"), "search");
  assert.equal(trafficSource("https://google.com.evil.test/", "https://store.test"), "referral");
  assert.equal(trafficSource("https://www.instagram.com/private", "https://store.test"), "social");
  assert.equal(trafficSource("https://store.test/private", "https://store.test"), null);
  assert.equal(trafficSource("", "https://store.test"), "direct");
});

test("traffic client requires fresh consent, reuses and expires browser IDs, and clears them on withdrawal", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiled = await build({ entryPoints: [join(root, "lib/traffic-client.ts")], bundle: true, format: "iife", globalName: "traffic", platform: "browser", write: false });
  const local = new Map(), session = new Map(), requests = [];
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  const context = { localStorage: storage(local), sessionStorage: storage(session), crypto, URL, Date, navigator: {}, document: { referrer: "https://google.com/search?q=private" }, location: { origin: "https://store.test" }, fetch: async (url, options) => { requests.push({ url, ...JSON.parse(options.body) }); } };
  runInNewContext(compiled.outputFiles[0].text, context);
  assert.equal(context.traffic.trackPageView("/"), false); assert.equal(local.size, 0);
  local.set("mcc-analytics-consent-v1", "yes");
  assert.equal(context.traffic.trackPageView("/"), false); assert.equal(requests.length, 0);
  local.set("mcc-traffic-consent-v1", "yes");
  assert.equal(context.traffic.trackPageView("/admin"), false);
  assert.equal(context.traffic.trackPageView("/products/private-slug"), true);
  assert.equal(context.traffic.trackPageView("/cart"), true);
  assert.equal(requests[0].visitorId, requests[1].visitorId); assert.notEqual(requests[0].id, requests[1].id);
  assert.equal(requests[0].page, "listing"); assert.equal(requests[0].source, "search");
  assert.doesNotMatch(JSON.stringify(requests), /private|google/);
  const visitor = JSON.parse(local.get("mcc-traffic-visitor-v1"));
  local.set("mcc-traffic-visitor-v1", JSON.stringify({ ...visitor, expires: 1 }));
  context.traffic.trackPageView("/"); assert.notEqual(requests[2].visitorId, visitor.id);
  local.set("mcc-traffic-consent-v1", "no");
  assert.equal(context.traffic.trackPageView("/"), false); assert.equal(local.has("mcc-traffic-visitor-v1"), false); assert.equal(session.size, 0);
  local.set("mcc-traffic-consent-v1", "yes"); context.navigator.globalPrivacyControl = true;
  assert.equal(context.traffic.trackPageView("/"), false); assert.equal(requests.length, 3);
});
