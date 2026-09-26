import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY } from '../lib/checkout-address.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  return null;
}

test('logout updates the persistent provider and both account menus without a reload', async t => {
  const root = process.cwd(), scratch = await mkdtemp(join(root, '.sites-runtime/logout-test-')), file = join(scratch, 'logout.mjs');
  const originals = Object.fromEntries(['window', 'fetch', 'localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const fixture = globalThis.__logoutTest = {};
  const hooks = () => ({ states: [], refs: [], effects: [], index: 0, refIndex: 0, effectIndex: 0 });
  fixture.state = initial => {
    const h = fixture.hooks, index = h.index++;
    if (!(index in h.states)) h.states[index] = typeof initial === 'function' ? initial() : initial;
    return [h.states[index], next => { h.states[index] = typeof next === 'function' ? next(h.states[index]) : next; }];
  };
  fixture.ref = initial => { const h = fixture.hooks; return h.refs[h.refIndex++] ??= { current: initial }; };
  fixture.effect = (callback, dependencies) => {
    const h = fixture.hooks, index = h.effectIndex++, previous = h.effects[index];
    if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return;
    previous?.cleanup?.(); h.effects[index] = { dependencies, cleanup: callback() };
  };
  const mocks = {
    react: "const f=globalThis.__logoutTest; export const useState=f.state,useRef=f.ref,useEffect=f.effect,useMemo=fn=>fn(),useCallback=fn=>fn,createContext=()=>({Provider:'provider'}),useContext=()=>f.context;",
    'next/navigation': "const f=globalThis.__logoutTest;export const useRouter=()=>({replace:path=>{f.navigation.push(['replace',path]);f.path=path;},refresh:()=>f.navigation.push(['refresh'])}),usePathname=()=>f.path,useSearchParams=()=>new URLSearchParams();",
    'next/link': "export default 'a';",
    'next/image': "export default 'img';",
    './mobile-sheet': "export const MobileSheet='mobile-sheet';",
    '@/lib/auth-client': "export const authClient={signOut:()=>{const f=globalThis.__logoutTest;f.signOutCalls++;return f.logout();}};",
  };
  const result = await build({ stdin: { contents: "export {MarketplaceProvider} from './components/marketplace-provider.tsx';export {SiteHeader} from './components/site-header.tsx';", resolveDir: root }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, plugins: [{ name: 'logout-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
  } }] });
  await writeFile(file, result.outputFiles[0].contents); const ui = await import(pathToFileURL(file).href);
  let providerHooks, headerHooks, local, session, requests, tree;
  const savedCart = [{ productId: 'private-model', sellerId: 'seller', quantity: 2, availableQuantity: 5 }];
  function select(h) { fixture.hooks = h; h.index = h.refIndex = h.effectIndex = 0; }
  function renderProvider() { select(providerHooks); tree = ui.MarketplaceProvider({ children: null }); fixture.context = tree.props.value; return fixture.context; }
  function renderHeader() { select(headerHooks); return ui.SiteHeader({}); }
  function reset({ account, merge, cart } = {}) {
    providerHooks?.effects.forEach(effect => effect.cleanup?.());
    providerHooks = hooks(); headerHooks = hooks(); local = new Map(); session = new Map(); requests = [];
    fixture.path = '/'; fixture.signOutCalls = 0; fixture.navigation = []; fixture.logout = async () => ({ data: { success: true }, error: null });
    const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { pathname: '/' } } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage(local) });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage(session) });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/account');
      const action = options?.method === 'POST' ? JSON.parse(options.body).action : 'get'; requests.push(action);
      if (action === 'get') return account ? account.promise : Response.json({ authenticated: true, user: { id: 'buyer', email: 'buyer@example.test' }, profile: { displayName: 'Alex', avatarUrl: null }, store: { id: 'store', name: 'Alex Models', status: 'active' } });
      if (action === 'merge') return merge ? merge.promise : Response.json({ cart: savedCart, wishlist: ['private-favorite'] });
      if (action === 'cart') return cart ? cart.promise : Response.json({ ok: true });
      throw new Error(`Unexpected action: ${action}`);
    };
    renderProvider();
  }
  async function ready(options) { reset(options); await tick(); return renderProvider(); }
  t.after(async () => {
    providerHooks?.effects.forEach(effect => effect.cleanup?.()); delete globalThis.__logoutTest;
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    await unlink(file); await rmdir(scratch);
  });

  await t.test('logging out on the home page immediately clears identity, store links and private shopping data', async () => {
    let context = await ready(); assert.equal(context.collector.id, 'buyer');
    assert.ok(find(renderHeader(), n => n.props?.href === '/store'));
    local.set('mcc-cart-v1', JSON.stringify(savedCart)); local.set('mcc-wishlist-v1', '["private-favorite"]');
    session.set(CHECKOUT_ADDRESS_KEY, 'private delivery address'); session.set(CHECKOUT_SESSION_KEY, 'checkout');
    await context.signOut(); context = renderProvider();
    assert.equal(context.collector, null); assert.equal(context.authReady, true); assert.deepEqual(context.cart, []); assert.deepEqual(context.wishlist, []);
    assert.deepEqual(JSON.parse(local.get('mcc-cart-v1')), []); assert.deepEqual(JSON.parse(local.get('mcc-wishlist-v1')), []); assert.equal(session.size, 0);
    const header = renderHeader(); assert.ok(find(header, n => n.props?.className === 'account-sign-in'));
    assert.equal(find(header, n => n.props?.className === 'account-menu'), null); assert.equal(find(header, n => n.props?.href === '/store'), null);
    assert.ok(find(header, n => n.props?.['aria-label'] === 'Shopping cart, 0 items'));
    assert.deepEqual(fixture.navigation, [['replace', '/'], ['refresh']]); assert.deepEqual(requests, ['get', 'merge'], 'Logout must not erase the saved cart on the server');
    context.addToCart({ id: 'guest-model', availableQuantity: 1, priceCents: 1000, currency: 'usd' });
    assert.equal(renderProvider().cart[0].productId, 'guest-model'); assert.deepEqual(requests, ['get', 'merge'], 'New guest shopping stays local');
  });
  await t.test('repeat logout clicks share one request and the protected page is replaced after success', async () => {
    const context = await ready(), pending = deferred(); fixture.path = '/account'; fixture.logout = () => pending.promise;
    const first = context.signOut(), second = context.signOut(); assert.equal(first, second); assert.equal(fixture.signOutCalls, 1);
    assert.equal(renderProvider().collector.id, 'buyer'); assert.deepEqual(fixture.navigation, []);
    pending.resolve({ data: { success: true }, error: null }); await first;
    assert.equal(renderProvider().collector, null); assert.deepEqual(fixture.navigation, [['replace', '/'], ['refresh']]);
  });
  await t.test('failed logout preserves the account and shows a retryable error in both menus', async () => {
    for (const failure of ['response', 'network']) {
      await ready(); fixture.logout = async () => { if (failure === 'network') throw new Error('Offline'); return { error: { message: 'Session service unavailable' } }; };
      const button = find(renderHeader(), n => n.type === 'button' && n.props.children === 'Sign Out'); button.props.onClick();
      assert.ok(find(renderHeader(), n => n.type === 'button' && n.props.children === 'Signing out…' && n.props.disabled));
      await tick(); const context = renderProvider(), header = renderHeader();
      assert.equal(context.collector.id, 'buyer'); assert.deepEqual(context.cart, savedCart); assert.deepEqual(context.wishlist, ['private-favorite']); assert.deepEqual(fixture.navigation, []);
      assert.ok(find(header, n => n.props?.role === 'alert')); assert.ok(find(find(header, n => n.type === 'mobile-sheet'), n => n.props?.role === 'alert'));
      fixture.logout = async () => ({ data: { success: true }, error: null });
      find(header, n => n.type === 'button' && n.props.children === 'Sign Out').props.onClick(); await tick(); assert.equal(renderProvider().collector, null);
    }
  });
  await t.test('late account and merge responses cannot restore a signed-out profile, cart or wishlist', async () => {
    for (const stage of ['account', 'merge']) {
      const pending = deferred(); const context = await ready({ [stage]: pending });
      await context.signOut();
      pending.resolve(Response.json(stage === 'account' ? { authenticated: true, user: { id: 'old-buyer' }, profile: { displayName: 'Old account' } } : { cart: savedCart, wishlist: ['private-favorite'] }));
      await tick(); const guest = renderProvider(); assert.equal(guest.collector, null); assert.deepEqual(guest.cart, []); assert.deepEqual(guest.wishlist, []);
      if (stage === 'account') assert.deepEqual(requests, ['get']);
    }
  });
  await t.test('late cart failures do not reappear after logout and queued account writes are discarded', async () => {
    const pending = deferred(), context = await ready({ cart: pending });
    context.setQuantity('private-model', 3); await tick(); context.setQuantity('private-model', 4);
    await context.signOut(); pending.reject(new Error('Connection lost')); await tick(); renderProvider();
    assert.deepEqual(requests, ['get', 'merge', 'cart']); assert.equal(find(tree, n => n.props?.role === 'alert'), null); assert.deepEqual(fixture.context.cart, []);
  });
});
