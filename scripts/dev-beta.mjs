import { createServer, loadEnv } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.env.NODE_ENV === 'production') throw new Error('The beta preview is a local development server only.');
Object.assign(process.env, loadEnv('development', root, ''));
// Environment wins over .env files in Vite. Deliberately disable integrations
// even if this workstation also has live credentials for deployment work.
Object.assign(process.env, {
  NODE_ENV: 'development', SITE_URL: 'http://127.0.0.1:5173', MARKETPLACE_MODE: 'test',
  MCC_BETA_DEMO: 'true', ADMIN_DEV_BYPASS: 'false',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_CONNECT_WEBHOOK_SECRET: '',
  SHIPPO_API_KEY: '', SHIPPO_WEBHOOK_SECRET: '', RESEND_API_KEY: '', GOOGLE_PLACES_API_KEY: '',
});
const server = await createServer({
  root,
  define: {
    'process.env.MCC_BETA_DEMO': JSON.stringify('true'),
    'process.env.GOOGLE_PLACES_API_KEY': JSON.stringify(''),
    'process.env.ADMIN_DEV_BYPASS': JSON.stringify('false'),
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{
    name: 'local-beta-review-hub',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/beta-review') return next();
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !/^(127\.0\.0\.1|localhost)(:5173)?$/.test(req.headers.host || '')) {
          res.statusCode = 404; res.end(); return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        try { res.end(await readFile(join(root, '.sites-runtime/beta-review.html'))); }
        catch { res.statusCode = 503; res.end('Run npm run db:seed:beta to prepare the local review accounts.'); }
      });
    },
  }],
});
await server.listen();
server.printUrls();
