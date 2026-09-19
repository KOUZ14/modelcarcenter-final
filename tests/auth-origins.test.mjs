import assert from "node:assert/strict";
import test from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { trustedAuthOriginsFor } from "../lib/auth-policy.ts";

function authFixture(siteUrl, nodeEnv) {
  const deliveries = [];
  const auth = betterAuth({
    baseURL: siteUrl,
    secret: "origin-regression-test-secret-at-least-32-characters",
    trustedOrigins: trustedAuthOriginsFor(siteUrl, nodeEnv),
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    rateLimit: { enabled: false },
    logger: { disabled: true },
    plugins: [magicLink({ async sendMagicLink(input) { deliveries.push(input); } })],
  });
  return {
    deliveries,
    submit(origin, callbackURL = "/account") {
      return auth.handler(new Request(`${siteUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "origin-test@example.test", callbackURL }),
      }));
    },
  };
}

test("local magic-link sign-in accepts loopback aliases on the configured port", async () => {
  const origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"];
  for (const siteUrl of origins) {
    const fixture = authFixture(siteUrl, "development");
    for (const origin of origins) {
      const response = await fixture.submit(origin);
      assert.equal(response.status, 200, `${siteUrl} should accept ${origin}`);
      assert.equal(new URL(fixture.deliveries.at(-1).url).origin, siteUrl);
    }
  }
});

test("local auth rejects unrelated origins, ports, schemes, and redirects", async () => {
  const fixture = authFixture("http://localhost:5173", "development");
  for (const origin of [
    "https://evil.example", "http://localhost.evil.example:5173",
    "http://127.0.0.1.evil.example:5173", "http://127.0.0.1:5174",
    "https://127.0.0.1:5173", "null",
  ]) {
    assert.equal((await fixture.submit(origin)).status, 403, origin);
  }
  assert.equal((await fixture.submit("http://127.0.0.1:5173", "https://evil.example/account")).status, 403);
  assert.equal(fixture.deliveries.length, 0);
});

test("production and non-local sites do not acquire loopback trust", async () => {
  for (const [siteUrl, nodeEnv] of [
    ["https://shop.example.test", "production"],
    ["https://shop.example.test", "development"],
    ["http://localhost:5173", "production"],
    ["http://localhost:5173", undefined],
  ]) {
    const fixture = authFixture(siteUrl, nodeEnv);
    assert.equal((await fixture.submit("http://127.0.0.1:5173")).status, 403);
    assert.equal(fixture.deliveries.length, 0);
    assert.equal((await fixture.submit(siteUrl)).status, 200);
  }
});
