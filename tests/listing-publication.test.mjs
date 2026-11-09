import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/d1';
import { POLICY_VERSION } from '../lib/legal.ts';
import { photoAltForViews } from '../lib/listing-evidence.ts';

test('direct publication and report-based listing moderation', async t => {
  const root = process.cwd(), scratch = await mkdtemp(join(root, '.sites-runtime/publication-test-')), file = join(scratch, 'api.mjs');
  const sqlite = new DatabaseSync(':memory:');
  for (const name of (await readdir('drizzle')).filter(n => n.endsWith('.sql')).sort()) sqlite.exec(await readFile(join('drizzle', name), 'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const binding = { prepare(query) { let values = []; return {
    bind(...args) { values = args; return this; },
    async raw() { const s = sqlite.prepare(query); s.setReturnArrays(true); return s.all(...values); },
    async all() { return { results: sqlite.prepare(query).all(...values), success: true }; },
    async first() { return sqlite.prepare(query).get(...values) ?? null; },
    async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
  }; }, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const fixture = globalThis.__publication = { binding, db: drizzle(binding), user: 'owner', admin: true };
  t.after(async () => { delete globalThis.__publication; sqlite.close(); await unlink(file).catch(() => {}); await rmdir(scratch); });
  for (const id of ['owner', 'buyer']) sqlite.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)').run(id, id, `${id}@example.test`);
  sqlite.exec(`INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,seller_type,status,stripe_charges_enabled,stripe_payouts_enabled,description,specialty,packing_approach,shipping_origin_country,shipping_origin_region)
    VALUES ('seller','owner','seller','Model collector','Owner','owner@example.test','collector','active',1,1,'I have collected and cared for model cars since 2005.','1:18 road cars','Original boxes protected inside padded outer cartons.','US','CA');
    INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','AUTOart','autoart','1:18','McLaren','F1','McLaren F1');
    INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status,model_condition,packaging_condition,original_box_status,missing_parts,defects,restoration_customization,coa_status,accessories,primary_image_url)
    VALUES ('listing','seller','model','mclaren-f1','MC-1','McLaren F1','1:18','AUTOart','McLaren','F1',15000,1,'draft','near_mint','excellent','included','None known','None known','None known','not_included','None included','/media/front.jpg');`);
  for (const view of ['front', 'rear', 'left', 'right', 'top', 'underside', 'packaging']) sqlite.prepare('INSERT INTO product_images (id,product_id,url,alt) VALUES (?,\'listing\',?,?)').run(view, `/media/${view}.jpg`, photoAltForViews([view], 'Actual model'));
  const result = await build({ stdin: { contents: "export {POST as listing} from './app/api/listings/route.ts'; export {POST as report} from './app/api/listings/report/route.ts'; export {GET as reports,POST as moderate} from './app/api/admin/community/route.ts'; export {getProductBySlug} from './lib/catalog.ts';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{ name: 'boundaries', setup(b) {
    const mocks = {
      '@/db': 'export const getDb=()=>globalThis.__publication.db,getD1=()=>globalThis.__publication.binding;',
      '@/lib/collector-auth': "export const requireCollectorApi=async()=>globalThis.__publication.user?{user:{id:globalThis.__publication.user,email:'owner@example.test'},profile:{displayName:'Owner',bio:''}}:Response.json({error:'Sign in'},{status:401});",
      '@/lib/admin-auth': "export const requireAdminApi=async()=>globalThis.__publication.admin?{email:'admin@example.test'}:Response.json({error:'Forbidden'},{status:403});",
    };
    b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: mocks[path] }));
  } }] });
  await writeFile(file, result.outputFiles[0].contents); const api = await import(pathToFileURL(file).href);
  const post = (handler, payload) => handler(new Request('https://mcc.test/api/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  const publish = (extra = {}) => post(api.listing, { action: 'publish', productId: 'listing', sellerTermsVersion: POLICY_VERSION, ...extra });
  const status = () => sqlite.prepare("SELECT status FROM products WHERE id='listing'").get().status;
  const report = (extra = {}) => post(api.report, { productId: 'listing', reason: 'Misleading condition: damage is visible but undisclosed.', ...extra });

  await t.test('requires sign-in, ownership, current terms, payouts and complete evidence', async () => {
    fixture.user = null; assert.equal((await publish()).status, 401);
    fixture.user = 'buyer'; assert.equal((await publish()).status, 400); fixture.user = 'owner';
    assert.equal((await publish({ sellerTermsVersion: 'old' })).status, 400);
    sqlite.exec("UPDATE sellers SET stripe_payouts_enabled=0"); assert.equal((await publish()).status, 400);
    sqlite.exec("UPDATE sellers SET stripe_payouts_enabled=1,status='suspended'"); assert.equal((await publish()).status, 400);
    sqlite.exec("UPDATE sellers SET status='active',description='Too short'"); assert.equal((await publish()).status, 400);
    sqlite.exec("UPDATE sellers SET description='I have collected and cared for model cars since 2005.'");
    sqlite.exec("UPDATE product_images SET alt='Both sides - Actual model' WHERE id='left'");
    const response = await publish(); assert.equal(response.status, 400); assert.match((await response.json()).fields.images, /Confirm legacy labels/);
    sqlite.prepare("UPDATE product_images SET alt=? WHERE id='left'").run(photoAltForViews(['left'], 'Actual model'));
    assert.equal(status(), 'draft'); assert.equal(await api.getProductBySlug('mclaren-f1'), null);
  });
  await t.test('publishes drafts and legacy submissions directly, making the buyer page available', async () => {
    for (const oldStatus of ['draft', 'pending_review']) {
      sqlite.prepare("UPDATE products SET status=? WHERE id='listing'").run(oldStatus);
      const response = await publish(oldStatus === 'pending_review' ? { action: 'submit' } : {});
      assert.equal(response.status, 200); assert.equal((await response.json()).status, 'active'); assert.equal(status(), 'active');
      assert.equal((await api.getProductBySlug('mclaren-f1')).title, 'McLaren F1');
    }
    assert.equal(sqlite.prepare('SELECT seller_terms_version FROM sellers').get().seller_terms_version, POLICY_VERSION);
  });
  await t.test('reports require sign-in and a public listing; retries create one report without hiding the listing', async () => {
    fixture.user = null; assert.equal((await report()).status, 401); fixture.user = 'buyer';
    assert.equal((await report({ reason: '  ' })).status, 400);
    assert.equal((await report({ productId: 'missing' })).status, 400);
    sqlite.exec("UPDATE products SET status='draft'"); assert.equal((await report()).status, 400);
    sqlite.exec("UPDATE products SET status='active'");
    assert.equal((await report()).status, 200); assert.equal((await report()).status, 200);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM community_reports').get().n, 1); assert.equal(status(), 'active');
    const stored = sqlite.prepare('SELECT * FROM community_reports').get(); assert.equal(stored.owner_id, 'buyer'); assert.match(stored.reason, /undisclosed/);
  });
  await t.test('only admins can inspect and resolve reports; dismissing preserves publication', async () => {
    const id = sqlite.prepare('SELECT id FROM community_reports').get().id;
    fixture.admin = false; assert.equal((await api.reports()).status, 403); assert.equal((await post(api.moderate, { id, action: 'remove', resolution: 'Damaged item' })).status, 403); assert.equal(status(), 'active');
    fixture.admin = true; const data = await (await api.reports()).json(); assert.equal(data.reports[0].listing_title, 'McLaren F1'); assert.equal(data.reports[0].listing_slug, 'mclaren-f1');
    assert.equal((await post(api.moderate, { id, action: 'remove', resolution: '' })).status, 400);
    assert.equal((await post(api.moderate, { id, action: 'dismiss', resolution: 'Damage is already disclosed.' })).status, 200); assert.equal(status(), 'active');
    assert.equal((await post(api.moderate, { id, action: 'remove', resolution: 'Stale decision' })).status, 400);
  });
  await t.test('removing a reported listing hides the buyer page and records the moderator and reason', async () => {
    await report(); const id = sqlite.prepare("SELECT id FROM community_reports WHERE status='open'").get().id;
    assert.equal((await post(api.moderate, { id, action: 'remove', resolution: 'Undisclosed damage. Correct the condition details before relisting.' })).status, 200);
    assert.equal(status(), 'inactive'); assert.equal(await api.getProductBySlug('mclaren-f1'), null);
    const resolved = sqlite.prepare('SELECT * FROM community_reports WHERE id=?').get(id); assert.equal(resolved.status, 'resolved'); assert.equal(resolved.reviewed_by, 'admin@example.test');
    assert.equal(sqlite.prepare("SELECT rejection_reason FROM products WHERE id='listing'").get().rejection_reason, resolved.resolution);
  });
});
