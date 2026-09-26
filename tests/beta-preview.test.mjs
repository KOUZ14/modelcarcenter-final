import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const readConfig = (mode, beta) => JSON.parse(execFileSync(process.execPath, [
  '--experimental-strip-types', '--input-type=module', '-e',
  `import { config } from './lib/config.ts'; console.log(JSON.stringify({mode:config.marketplaceMode,origin:config.siteUrl,stripe:config.stripeSecretKey,shippo:config.shippoApiKey,email:config.resendApiKey}));`,
], { cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: mode, MCC_BETA_DEMO: beta, MARKETPLACE_MODE: 'live', SITE_URL: 'https://example.test', STRIPE_SECRET_KEY: 'sk_live_fixture_only', SHIPPO_API_KEY: 'shippo_live_fixture_only', RESEND_API_KEY: 're_fixture_only' }, encoding: 'utf8' }));

test('local beta suppresses integrations even when local bindings contain credentials', () => {
  assert.deepEqual(readConfig('development', 'true'), { mode: 'test', origin: 'http://127.0.0.1:5173', stripe: '', shippo: '', email: '' });
});
test('the beta marker cannot disable production configuration', () => {
  assert.deepEqual(readConfig('production', 'true'), { mode: 'live', origin: 'https://example.test', stripe: 'sk_live_fixture_only', shippo: 'shippo_live_fixture_only', email: 're_fixture_only' });
});
test('ordinary development retains its explicit integration configuration', () => {
  assert.equal(readConfig('development', 'false').stripe, 'sk_live_fixture_only');
});
