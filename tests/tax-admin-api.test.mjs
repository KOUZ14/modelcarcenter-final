import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Run the real route, validation, schema, migrations, and SQL against an isolated
// SQLite database. Unrelated admin integrations throw if the tax path calls them.
test("admin tax API persists and reloads profiles, deadlines, ledger, seller status, and exports", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".tax-api-test-"));
  const bundlePath = join(scratch, "route.mjs");
  const viewPath = join(scratch, "view.mjs");
  const sqlite = new DatabaseSync(":memory:");
  const binding = {
    prepare(query) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
  };
  globalThis.__mccTaxApiTest = { db: drizzle(binding), binding, authenticated: true };
  t.after(async () => {
    delete globalThis.__mccTaxApiTest;
    sqlite.close();
    await unlink(bundlePath).catch(() => {});
    await unlink(viewPath).catch(() => {});
    await rmdir(scratch);
  });
  for (const name of (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(join(root, "drizzle", name), "utf8"));
  }
  const source = await readFile(join(root, "app/api/admin/route.ts"), "utf8");
  const mocks = new Map();
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(@\/[^\"]+)"/g)) {
    const path = match[2];
    if (["@/db/schema", "@/lib/tax-admin", "@/lib/validation", "@/lib/http"].includes(path)) continue;
    mocks.set(path, match[1].split(",").map((value) => value.trim()).filter(Boolean));
  }
  const result = await build({
    entryPoints: [join(root, "app/api/admin/route.ts")],
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{
      name: "tax-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@\// }, ({ path }) => {
          if (mocks.has(path)) return { path, namespace: "tax-test" };
          return { path: join(root, path.slice(2) + ".ts").replace(/[/\\]db\.ts$/, "/db/index.ts") };
        });
        builder.onLoad({ filter: /.*/, namespace: "tax-test" }, ({ path }) => ({
          contents: mocks.get(path).map((name) => {
            if (name === "getDb") return "export const getDb = () => globalThis.__mccTaxApiTest.db;";
            if (name === "getD1") return "export const getD1 = () => globalThis.__mccTaxApiTest.binding;";
            if (name === "requireAdminApi") return 'export const requireAdminApi = async () => globalThis.__mccTaxApiTest.authenticated ? {email:"admin@example.test"} : Response.json({error:"Unauthorized"}, {status:403});';
            if (name === "config") return "export const config = { automaticTax: false };";
            return `export const ${name} = () => { throw new Error("Unexpected tax dependency: ${name}"); };`;
          }).join("\n"),
        }));
      },
    }],
  });
  await writeFile(bundlePath, result.outputFiles[0].contents);
  const route = await import(pathToFileURL(bundlePath).href);
  const get = async () => {
    const response = await route.GET(new Request("http://localhost/api/admin?section=tax"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return response.json();
  };
  const post = async (payload, status = 200) => {
    const response = await route.POST(new Request("http://localhost/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }));
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  };

  await t.test("tax routes require admin identity", async () => {
    globalThis.__mccTaxApiTest.authenticated = false;
    assert.equal((await route.GET(new Request("http://localhost/api/admin?section=tax"))).status, 403);
    await post({ action: "seed_tax_calendar", year: 2026 }, 403);
    globalThis.__mccTaxApiTest.authenticated = true;
  });

  await t.test("setup migration preserves saved profiles and completed deadlines", async () => {
    const migrationDb = new DatabaseSync(":memory:");
    try {
      for (const name of (await readdir(join(root, "drizzle"))).filter((name) => name.endsWith(".sql") && name < "0018").sort()) {
        migrationDb.exec(await readFile(join(root, "drizzle", name), "utf8"));
      }
      migrationDb.exec("INSERT INTO tax_profiles (id, notes, seller_permit_status) VALUES ('primary', 'Existing owner notes', 'needs_attention')");
      const legacyNote = "Planning date from the standard sole-proprietor calendar; confirm the amount and any holiday adjustment before paying.";
      const insert = migrationDb.prepare("INSERT INTO tax_tasks (id, kind, title, calendar_key, period_start, period_end, due_at, status, notes) VALUES (?, 'federal_estimated_tax', 'Existing reminder', ?, '2026-01-01', '2026-12-31', '2026-06-15', ?, ?)");
      insert.run("q2", "2026-federal-estimate-q2", "upcoming", legacyNote);
      insert.run("q3", "2026-federal-estimate-q3", "paid", legacyNote);
      migrationDb.exec(await readFile(join(root, "drizzle/0018_tax_launch_status.sql"), "utf8"));
      assert.equal(migrationDb.prepare("SELECT notes FROM tax_profiles").get().notes, "Existing owner notes");
      assert.equal(migrationDb.prepare("SELECT seller_permit_status FROM tax_profiles").get().seller_permit_status, "needs_attention");
      assert.equal(migrationDb.prepare("SELECT period_end FROM tax_tasks WHERE id = 'q2'").get().period_end, "2026-05-31");
      assert.equal(migrationDb.prepare("SELECT period_end FROM tax_tasks WHERE id = 'q3'").get().period_end, "2026-12-31");
      assert.equal(migrationDb.prepare("SELECT status FROM tax_tasks WHERE id = 'q3'").get().status, "paid");
    } finally {
      migrationDb.close();
    }
  });

  await t.test("profile start date and confirmations survive a fresh read", async () => {
    const profile = (await get()).profile;
    assert.equal(profile.businessStartedAt, null);
    assert.equal(profile.businessApprovedAt, "2026-05-22");
    assert.equal(profile.businessLaunchStatus, "prelaunch");
    assert.equal(profile.sellerPermitStatus, "active");
    assert.equal(profile.caAccountVerifiedAt, null);
    assert.equal(profile.stripeCaliforniaRegistrationStatus, "not_checked");
    await post({ ...profile, action: "save_tax_profile", businessStartedAt: "2026-05-22", businessLaunchStatus: "launched", incomeTaxReserveBps: 2500, sellerPermitStatus: "active" });
    const saved = (await get()).profile;
    assert.equal(saved.businessStartedAt, "2026-05-22");
    assert.equal(saved.incomeTaxReserveBps, 2500);
    assert.equal(saved.sellerPermitStatus, "active");
    assert.equal(saved.businessLaunchStatus, "launched");
    assert.equal(saved.businessApprovedAt, "2026-05-22");
    await post({ ...saved, action: "save_tax_profile", businessLaunchStatus: "invalid" }, 400);
    for (const date of ["2026-02-30", "2026-05-22junk", "2026-05-22T00:00:00Z"]) {
      await post({ ...saved, action: "save_tax_profile", businessStartedAt: date }, 400);
    }
    assert.equal((await get()).profile.businessStartedAt, "2026-05-22");
  });

  await t.test("calendar creation is repeatable and refresh preserves edits", async () => {
    assert.equal((await post({ action: "seed_tax_calendar", year: 2026 })).created, 8);
    assert.equal((await post({ action: "seed_tax_calendar", year: 2026 })).created, 0);
    const tasks = (await get()).tasks;
    assert.equal(tasks.length, 8);
    const q2 = tasks.find((task) => task.calendarKey === "2026-federal-estimate-q2");
    assert.equal(q2.periodEnd, "2026-05-31");
    const payload = { action: "update_tax_task", taskId: q2.id, status: "paid", amountPaidCents: 12000, amountDueCents: 12000, dueAt: "2026-06-16", confirmationReference: "TEST-RECEIPT", notes: "Test payment" };
    await post(payload);
    await post({ action: "seed_tax_calendar", year: 2026 });
    const saved = (await get()).tasks.find((task) => task.id === q2.id);
    assert.equal(saved.amountPaidCents, 12000);
    assert.equal(saved.dueAt, "2026-06-16");
    assert.equal(saved.confirmationReference, "TEST-RECEIPT");
    assert.ok(saved.paidAt);
    assert.equal(saved.filedAt, null, "paying estimated tax must not invent a filing");
    await post({ ...payload, status: "not_required", amountPaidCents: null });
    const reset = (await get()).tasks.find((task) => task.id === q2.id);
    assert.equal(reset.paidAt, null);
    assert.equal(reset.filedAt, null);
    await post({ ...payload, dueAt: "2026-02-30" }, 400);
    await post({ ...payload, amountDueCents: -1 }, 400);
  });

  await t.test("legacy planning periods refresh without changing a completed task", async () => {
    const legacyNote = "Planning date from the standard sole-proprietor calendar; confirm the amount and any holiday adjustment before paying.";
    sqlite.prepare("UPDATE tax_tasks SET notes = ?, period_start = '2026-01-01', period_end = '2026-12-31', updated_at = created_at WHERE calendar_key = '2026-federal-estimate-q3'").run(legacyNote);
    const result = await post({ action: "seed_tax_calendar", year: 2026 });
    assert.equal(result.updated, 1);
    const task = (await get()).tasks.find((item) => item.calendarKey === "2026-federal-estimate-q3");
    assert.equal(task.periodStart, "2026-06-01");
    assert.equal(task.periodEnd, "2026-08-31");
  });

  await t.test("manual deadlines validate periods and preserve filing/payment evidence", async () => {
    const draft = { action: "create_tax_task", kind: "ca_sales_tax", title: "Test return", jurisdiction: "California", periodStart: "2026-05-22", periodEnd: "2026-06-30", dueAt: "2026-07-31", amountDueCents: 100 };
    await post({ ...draft, periodEnd: "2026-05-01" }, 400);
    const { taskId } = await post(draft);
    const update = { action: "update_tax_task", taskId, amountPaidCents: null, notes: "Filed electronically", confirmationReference: "FILING" };
    await post({ ...update, status: "filed" });
    assert.ok((await get()).tasks.find((task) => task.id === taskId).filedAt);
    await post({ ...update, status: "paid", amountPaidCents: 100 });
    const paid = (await get()).tasks.find((task) => task.id === taskId);
    assert.ok(paid.filedAt);
    assert.ok(paid.paidAt);
  });

  await t.test("bookkeeping totals include every record and voids remove amounts", async () => {
    const entry = { action: "create_ledger_entry", entryType: "expense", category: "Software", description: "Test hosting", occurredAt: "2026-05-22", amountCents: 1000 };
    const { entryId } = await post(entry);
    await post({ ...entry, entryType: "owner_draw", amountCents: 500 });
    await post({ ...entry, entryType: "other_income", amountCents: 2000 });
    assert.deepEqual((await get()).ledgerByYear, [{ year: 2026, expensesCents: 1000, ownerDrawsCents: 500, otherIncomeCents: 2000 }]);
    await post({ action: "void_ledger_entry", entryId });
    assert.equal((await get()).ledgerByYear[0].expensesCents, 0);
    const insert = sqlite.prepare("INSERT INTO business_ledger_entries (id, entry_type, category, description, occurred_at, amount_cents) VALUES (?, 'expense', 'Test', 'Test', '2026-06-01', 1)");
    for (let i = 0; i < 1001; i++) insert.run(`entry-${i}`);
    const data = await get();
    assert.equal(data.ledgerByYear[0].expensesCents, 1001);
    assert.equal(data.ledger.length, 1004);
  });

  await t.test("seller tax status and verification timestamp reload together", async () => {
    sqlite.exec("INSERT INTO sellers (id, slug, store_name, contact_name, contact_email) VALUES ('tax-seller', 'tax-seller', 'Test', 'Test', 'seller@example.test')");
    await post({ action: "seller_tax_status", sellerId: "tax-seller", status: "ready" });
    assert.ok((await get()).sellers[0].taxInfoVerifiedAt);
    await post({ action: "seller_tax_status", sellerId: "tax-seller", status: "needs_attention" });
    const seller = (await get()).sellers[0];
    assert.equal(seller.taxInfoStatus, "needs_attention");
    assert.equal(seller.taxInfoVerifiedAt, null);
    assert.ok((await get()).activity.length > 0);
  });

  await t.test("CSV and reports use the same California reporting year", async () => {
    sqlite.exec("INSERT INTO orders (id, order_number, seller_id, buyer_email, currency, stripe_checkout_session_id, subtotal_cents, shipping_cents, platform_fee_cents, tax_cents, total_cents, payment_status, paid_at, shipping_address) VALUES ('tax-order', 'TEST-YEAR-END', 'tax-seller', 'buyer@example.test', 'usd', 'cs_test_tax', 1000, 0, 100, 80, 1080, 'paid', '2027-01-01T03:00:00Z', '{\"address\":{\"state\":\"CA\"}}')");
    assert.equal((await get()).reports[0].year, 2026);
    const csv = await route.GET(new Request("http://localhost/api/admin?section=tax_export&year=2026"));
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /TEST-YEAR-END/);
    const next = await route.GET(new Request("http://localhost/api/admin?section=tax_export&year=2027"));
    assert.doesNotMatch(await next.text(), /TEST-YEAR-END/);
  });

  await t.test("tax UI renders the saved date, amounts, checklist, and calendar controls", async () => {
    const componentSource = await readFile(join(root, "components/admin-dashboard.tsx"), "utf8");
    const viewBuild = await build({
      absWorkingDir: root,
      jsx: "automatic",
      stdin: { contents: componentSource + "\nexport { TaxCenter };", resolveDir: root, sourcefile: "tax-view.tsx", loader: "tsx" },
      bundle: true, platform: "node", format: "esm", packages: "external", write: false,
      plugins: [{ name: "next-view-boundary", setup(builder) {
        builder.onResolve({ filter: /^next\/(link|image)$/ }, ({ path }) => ({ path, namespace: "next-view" }));
        builder.onLoad({ filter: /.*/, namespace: "next-view" }, () => ({ contents: "export default function UnusedNextComponent() { return null; }" }));
      } }],
    });
    await writeFile(viewPath, viewBuild.outputFiles[0].contents);
    const { TaxCenter } = await import(pathToFileURL(viewPath).href);
    const html = renderToStaticMarkup(createElement(TaxCenter, { data: await get(), action: async () => ({ ok: true }) }));
    assert.match(html, /Business start date/);
    assert.match(html, /value="2026-05-22"/);
    assert.match(html, /Before business start — review/);
    assert.match(html, /Add \/ refresh 2026 calendar/);
    assert.match(html, /Download orders CSV/);
    assert.match(html, /value="25"/);
    assert.match(html, /aria-busy="false"/);
    assert.match(html, /Payment recorded/);
    assert.match(html, /missing Stripe processing fees/);
    assert.doesNotMatch(html, /Invalid date|NaN/);
    const prelaunch = await get();
    prelaunch.profile = { ...prelaunch.profile, businessLaunchStatus: "prelaunch", businessStartedAt: null };
    const beforeLaunchHtml = renderToStaticMarkup(createElement(TaxCenter, { data: prelaunch, action: async () => ({ ok: true }) }));
    assert.match(beforeLaunchHtml, /Not launched \(owner reported\)/);
    assert.match(beforeLaunchHtml, /Prelaunch — review/);
    assert.match(beforeLaunchHtml, /assigned returns even with no sales/);
    assert.doesNotMatch(beforeLaunchHtml, /Before business start — review/);
  });
});
