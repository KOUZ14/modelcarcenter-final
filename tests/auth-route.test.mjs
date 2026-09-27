import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

test("magic-link requests survive Vinext's request proxy in Cloudflare", async (t) => {
  const bundle = await build({
    stdin: {
      contents: `
        import { POST } from './app/api/auth/[...all]/route.ts';
        import { boundRequestBody } from './lib/request-security.ts';
        import { createTrackedAppRouteRequest } from './node_modules/vinext/dist/server/app-route-handler-runtime.js';
        export default {
          async fetch(input) {
            const { request } = createTrackedAppRouteRequest(await boundRequestBody(input));
            return POST(request);
          },
        };
      `,
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      sourcefile: "auth-route-test-worker.js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "worker", "browser"],
    external: ["node:*"],
    plugins: [{
      name: "capture-auth-request",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: "auth", namespace: "test-auth" }));
        builder.onLoad({ filter: /.*/, namespace: "test-auth" }, () => ({
          contents: `export function getCollectorAuth() {
            return { async handler(request) {
              return Response.json({
                url: request.url,
                method: request.method,
                origin: request.headers.get('origin'),
                cookie: request.headers.get('cookie'),
                ip: request.headers.get('cf-connecting-ip'),
                payload: await request.json(),
              });
            }};
          }`,
          loader: "js",
        }));
      },
    }],
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-08-18",
    compatibilityFlags: ["nodejs_compat"],
  }));
  t.after(() => runtime.dispose());
  const origin = "https://shop.example.test";
  const url = `${origin}/api/auth/sign-in/magic-link`;
  const payload = {
    email: "  Collector@Example.Test  ",
    name: "  Collector  ",
    adultConsent: "on",
    callbackURL: "/account",
    newUserCallbackURL: "/account?new=1",
    errorCallbackURL: "/sign-in?error=invalid-link",
    untrustedExtra: "discard",
  };
  async function submit(body) {
    return runtime.dispatchFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
        origin,
        cookie: "mcc.session_token=test-session",
        "cf-connecting-ip": "192.0.2.1",
      },
      body,
    });
  }

  const response = await submit(JSON.stringify(payload));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url,
    method: "POST",
    origin,
    cookie: "mcc.session_token=test-session",
    ip: "192.0.2.1",
    payload: {
      email: "collector@example.test",
      name: "Collector",
      callbackURL: payload.callbackURL,
      newUserCallbackURL: payload.newUserCallbackURL,
      errorCallbackURL: payload.errorCallbackURL,
    },
  });

  for (const body of [
    JSON.stringify({ ...payload, adultConsent: false }),
    JSON.stringify({ ...payload, email: "invalid-email" }),
    "{invalid-json",
  ]) {
    const rejected = await submit(body);
    assert.equal(rejected.status, 400);
    assert.equal(typeof (await rejected.json()).error, "string");
  }
});
