import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildBetaFixture, insertStatement, reviewPeople, PREFIX } from './beta-fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const options = new Set(process.argv.slice(2));
if ([...options].some(value => !['--check', '--login-only'].includes(value))) throw new Error('Only --check and --login-only are supported. This command cannot target a remote database.');
if (process.env.NODE_ENV === 'production' || process.env.MARKETPLACE_MODE === 'live') throw new Error('Beta seeding is only available in local test mode.');
const scratch = join(root, '.sites-runtime');
const fixture = buildBetaFixture();
const statements = fixture.records.map(insertStatement);

// Exercise every real migration and inventory/privacy constraint before local writes.
export async function validateFixture() {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of (await readdir(join(root, 'drizzle'))).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(join(root, 'drizzle', file), 'utf8'));
    db.exec('PRAGMA foreign_keys=ON; BEGIN');
    for (const { sql, values } of statements) db.prepare(sql).run(...values);
    for (const change of fixture.transitions) db.prepare('UPDATE collection_offers SET status=?,payment_deadline=? WHERE id=?').run(change.status, change.paymentDeadline ?? null, change.id);
    db.exec('COMMIT');
    // Re-running must not duplicate rows, refresh immutable offers or undo edits.
    for (const { sql, values } of statements) db.prepare(sql).run(...values);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error(`Foreign-key violations: ${JSON.stringify(violations)}`);
    const reserved = db.prepare('SELECT sum(reserved_quantity) n FROM products').get().n;
    if (reserved !== 1) throw new Error('Expected exactly one reserved physical piece.');
    const counts = {};
    for (const table of new Set(fixture.records.map(r => r.table))) counts[table] = db.prepare(`SELECT count(*) n FROM "${table}"`).get().n;
    return counts;
  } finally { db.close(); }
}

const counts = await validateFixture();
if (options.has('--check')) {
  console.log(JSON.stringify({ validated: true, repeatable: true, foreignKeys: true, counts }, null, 2));
  process.exit(0);
}
await mkdir(scratch, { recursive: true });
// A generated config containing ONLY placeholder/local resources prevents any
// environment, CLI argument, or hosted project ID from changing the target.
const configPath = join(scratch, 'beta-local.json');
await writeFile(configPath, JSON.stringify({ name: 'mcc-beta-local-seed', compatibility_date: '2026-08-18', d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }], r2_buckets: [{ binding: 'IMAGES', bucket_name: 'site-creator-r2' }] }));
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_WRITE_LOGS = 'false';
process.env.MINIFLARE_REGISTRY_PATH = join(root, '.wrangler/registry');
const { getPlatformProxy } = await import('wrangler');
const proxy = await getPlatformProxy({ configPath, envFiles: [], persist: { path: resolve(root, '.wrangler/state/v3') }, remoteBindings: false });
try {
  const db = proxy.env.DB, bucket = proxy.env.IMAGES;
  await db.prepare('SELECT id FROM collection_offers LIMIT 1').all(); // Fail early if migrations are missing.
  if (!options.has('--login-only')) {
    // Never reset the database or touch unrelated records. Apply the seed atomically;
    // transition only offers created during this invocation.
    const existing = new Set((await db.prepare("SELECT id FROM collection_offers WHERE id LIKE 'beta-v1-%'").all()).results.map(r => r.id));
    const sharp = (await import('sharp')).default;
    const assets = new Map();
    for (const asset of new Set(fixture.media.map(m => m.asset))) assets.set(asset, await sharp(join(root, 'public/images', asset)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer());
    for (const media of fixture.media) {
      const key = `community/${media.id}.jpg`;
      if (!await bucket.head(key)) await bucket.put(key, assets.get(media.asset), { httpMetadata: { contentType: 'image/jpeg' } });
    }
    const batch = statements.map(({ sql, values }) => db.prepare(sql).bind(...values));
    for (const change of fixture.transitions) if (!existing.has(change.id)) batch.push(db.prepare('UPDATE collection_offers SET status=?,payment_deadline=? WHERE id=?').bind(change.status, change.paymentDeadline ?? null, change.id));
    await db.batch(batch);
    console.log(JSON.stringify({ seeded: 'local only', prefix: PREFIX, counts, photos: fixture.media.length }, null, 2));
  }
  // Create short-lived, single-use links through the EXISTING Better Auth flow.
  // This adds no development bypass or authentication route to the application.
  const links = [];
  for (const [index, personIndex] of reviewPeople.entries()) {
    const person = fixture.people[personIndex];
    const exists = await db.prepare('SELECT id FROM user WHERE id=? AND email=?').bind(person.id, person.email).first();
    if (!exists) throw new Error('Seed the sample accounts before issuing review links.');
    const token = randomBytes(32).toString('base64url'), now = Date.now();
    await db.prepare('DELETE FROM verification WHERE id=?').bind(`${PREFIX}review-${personIndex}`).run();
    await db.prepare('INSERT INTO verification (id,identifier,value,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(`${PREFIX}review-${personIndex}`, createHash('sha256').update(token).digest('base64url'), JSON.stringify({ email: person.email, name: person.name }), now + 24 * 3600000, now, now).run();
    links.push({ name: person.name, role: ['Active collector', 'Store owner', 'New collector'][index], url: `http://127.0.0.1:5173/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fcommunity` });
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>MCC · Beta review</title><style>body{font:17px/1.6 system-ui;background:#f4f2ed;color:#181818;max-width:850px;margin:8vh auto;padding:24px}h1{font-size:44px;line-height:1.1}a{color:#174c36}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}.card{padding:24px;background:white;border:1px solid #ddd;border-radius:12px}.button{display:block;background:#163d2d;color:white;padding:10px 15px;text-align:center;border-radius:6px;text-decoration:none}small{color:#555}nav{display:flex;gap:24px;flex-wrap:wrap;margin:32px 0}</style><p>MODEL CAR CENTER · LOCAL BETA</p><h1>A busy marketplace.<br>A community to explore.</h1><p>24 fictional collectors, six stores, 48 listings, 193 collection pieces and 72 conversations in the feed. All activity is simulated. Payments, shipping purchases and email delivery are disabled in the beta server.</p><nav><a href="/">Browse Shop</a><a href="/community">Community feed</a><a href="/community?view=collectors">Explore collectors</a></nav><div class="cards">${links.map(l => `<section class="card"><small>${l.role}</small><h2>${l.name}</h2><p>${l.role === 'Active collector' ? 'Private shelves, saved posts, replies, message requests and offers.' : l.role === 'Store owner' ? 'An established store, sale pieces and incoming collector offers.' : 'A smaller collection, a wishlist and a welcome conversation.'}</p><a class="button" href="${l.url}">Review as ${l.name.split(' ')[0]}</a></section>`).join('')}</div><p><small>Sign-in links are single use and expire after 24 hours. Regenerate with <code>npm run db:seed:beta -- --login-only</code>. To change accounts, sign out first. This page is served only by the local beta command and is excluded from deployed builds.</small></p></html>`;
  await writeFile(join(scratch, 'beta-review.html'), html);
  await writeFile(join(scratch, 'beta-review-access.json'), JSON.stringify(links));
  console.log('Review hub: http://127.0.0.1:5173/beta-review (start with npm run dev:beta).');
} finally { await proxy.dispose(); }
