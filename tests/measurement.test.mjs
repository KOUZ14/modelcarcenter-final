import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

test('optional measurement enforces consent, excludes staff and test activity, and deduplicates paid confirmations', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const scratch = await mkdtemp(join(root, '.measurement-test-'));
  const bundle = join(scratch, 'measurement.mjs');
  const sqlite = new DatabaseSync(':memory:');
  const migration = await readFile(join(root, 'drizzle/0035_marketplace_usability.sql'), 'utf8');
  sqlite.exec(migration.split('ALTER TABLE')[0]);
  const binding = { prepare(sql) {
    let params = [];
    return { bind(...values) { params = values; return this; },
      async run() { return sqlite.prepare(sql).run(...params); },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    };
  }};
  const fixture = { binding, config: { marketplaceMode: 'live' }, session: null, admin: false };
  globalThis.__measurementTest = fixture;
  const previousStaff = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'owner@store.test';
  t.after(async () => {
    delete globalThis.__measurementTest;
    if (previousStaff === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previousStaff;
    sqlite.close(); await unlink(bundle).catch(() => {}); await rmdir(scratch);
  });
  const result = await build({
    stdin: { contents: `export * from './lib/measurement.ts'; export {GET, POST} from './app/api/measurement/route.ts';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{ name: 'measurement-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(?:@\/db|\.\/config|\.\/auth|@\/lib\/admin-auth)$/ }, ({path}) => ({path, namespace:'fixture'}));
      builder.onLoad({ filter: /.*/, namespace:'fixture' }, ({path}) => ({ contents:
        path === '@/db' ? 'export const getD1=()=>globalThis.__measurementTest.binding;' :
        path === './config' ? 'export const config=globalThis.__measurementTest.config;' :
        path === './auth' ? 'export const getCollectorAuth=()=>({api:{getSession:async()=>globalThis.__measurementTest.session}});' :
        'export const requireAdminApi=async()=>globalThis.__measurementTest.admin ? {email:"owner@store.test"} : new Response(null,{status:403});', loader:'ts' }));
    }}],
  });
  await writeFile(bundle, result.outputFiles[0].contents);
  const api = await import(pathToFileURL(bundle).href);
  const request = (headers = {}, body) => new Request('https://store.test/api/measurement', {method: body ? 'POST' : 'GET', headers: {cookie:'mcc_analytics=yes', ...headers}, ...(body ? {body:JSON.stringify(body)} : {})});
  const count = () => sqlite.prepare('SELECT count(*) AS n FROM task_measurements').get().n;
  const event = {id:crypto.randomUUID(), name:'inventory_import', details:{step:'import',result:'success',count:3,email:'private@invalid.test',query:'private',payment:'private',message:'private'}};

  assert.equal(await api.mayMeasure(request({cookie:''})), false);
  assert.equal(await api.mayMeasure(request({'sec-gpc':'1'})), false);
  assert.equal(await api.mayMeasure(request({dnt:'1'})), false);
  assert.equal(await api.mayMeasure(request({'user-agent':'Googlebot'})), false);
  assert.equal(await api.mayMeasure(request({'oai-authenticated-user-email':'owner@store.test'})), false);
  fixture.config.marketplaceMode = 'test';
  assert.equal((await api.POST(request({}, event))).status, 204); assert.equal(count(), 0);
  fixture.config.marketplaceMode = 'live';
  for (const email of ['owner@store.test', 'test-buyer@store.test', 'buyer@example.com']) {
    fixture.session = {user:{email}};
    assert.equal(await api.mayMeasure(request()), false);
  }
  fixture.session = null;
  assert.equal(await api.mayMeasure(request()), true);
  assert.equal((await api.POST(request({}, event))).status, 204);
  assert.equal((await api.POST(request({}, event))).status, 204);
  assert.equal(count(), 1);
  assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT * FROM task_measurements').all()), /private|email|payment|message/);
  assert.equal((await api.POST(request({}, {...event, id:crypto.randomUUID(), name:'purchase_completed'}))).status, 400);

  const now = new Date().toISOString();
  await api.measureConfirmedPurchase(request(), 'cs_test_sample', 1, now);
  await api.measureConfirmedPurchase(request({cookie:''}), 'cs_live_sample', 1, now);
  assert.equal(count(), 1);
  await api.measureConfirmedPurchase(request(), 'cs_live_sample', 2, now);
  await api.measureConfirmedPurchase(request(), 'cs_live_sample', 2, now);
  assert.equal(count(), 2);
  const paid = sqlite.prepare("SELECT * FROM task_measurements WHERE name='purchase_completed'").get();
  assert.equal(paid.count, 2); assert.doesNotMatch(paid.id, /cs_live/);
  assert.equal((await api.GET()).status, 403);
  fixture.admin = true;
  const report = await api.GET();
  assert.equal(report.headers.get('cache-control'), 'private, no-store');
  const reportBody = await report.json();
  assert.equal(reportBody.measurements.length, 2);
  assert.equal('id' in reportBody.measurements[0], false);

  sqlite.prepare("INSERT INTO task_measurements (id,name,day) VALUES ('old','buyer_search','2000-01-01')").run();
  await api.pruneMeasurementRecords(binding);
  assert.equal(count(), 2);
  await api.measureConfirmedPurchase(request(), 'cs_live_old', 1, '2000-01-01T00:00:00Z');
  assert.equal(count(), 2);
});
