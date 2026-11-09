# Application security review — Model Car Center

Reviewed September 26, 2026 (America/Los_Angeles).

**Historical assessment, followed by implementation in the same session.** The current fixes, validation, migration, and outstanding operational requirements are in [security-hardening-implementation.md](security-hardening-implementation.md). The findings and test counts below describe the initial review, not the final source state. A subsequent fresh registry audit found 14 vulnerable dependency entries; these were patched. The initial zero-advisory result must not be used as the release baseline.

Use **OWASP ASVS 5.0 Level 2 as the target verification baseline** for this marketplace, with additional scrutiny for administrator access, payments, and personal data. This is a recommended engineering target, not a claim that the application has passed ASVS. ASVS supplies testable requirements across authentication, authorization, validation, business logic, and other controls. [OWASP ASVS](https://owasp.org/projects/asvs?tab=main)

## Scope and trust boundaries

This was a source review, current primary-source research, dependency audit, and local regression testing. It was not a production penetration test. No production settings, payments, emails, or customer records were changed. Local environment secret values were not inspected. Secret scanning of the complete Git history, a full endpoint-by-endpoint authorization assessment, and production infrastructure inspection remain outstanding.

The stack is Vinext 1.0.0-beta.8 implementing the Next.js API surface, React 19.2.8, Better Auth 1.7.1, Cloudflare Workers/D1/R2, Stripe, Shippo, and transactional email. Next.js documentation is useful architectural guidance, but security behavior must also be checked against the installed Vinext implementation. For example, this review checked its actual route normalization rather than assuming Next.js routing behavior. [Next.js data security](https://nextjs.org/docs/app/guides/data-security), [Vinext source](https://github.com/cloudflare/vinext)

| Boundary | Assets and failure to prevent |
| --- | --- |
| Anonymous browser → application | Spam, mass email, checkout reservation abuse, expensive requests, malicious input |
| Collector/seller → another account's records | Orders, shipping addresses, private messages, original photos, support evidence, inventory |
| Hosting gateway → administrator APIs | Forged identity, unauthorized refunds, seller changes, exports, payout-related operations |
| Application → Stripe/Shippo/email | Leaked credentials, spoofed or replayed events, duplicate financial operations, provider costs |
| Worker → D1/R2/caches/logs | Private response reuse, exposed files/tokens, unbounded storage, incomplete recovery |

## Existing protections worth preserving

- Password authentication is disabled. Magic links expire after ten minutes and their tokens are stored hashed. Database sessions are revocable; session-cookie caching is disabled. Production cookies use HttpOnly, Secure, and SameSite=Lax. See [auth.ts](../lib/auth.ts) and [auth-policy.ts](../lib/auth-policy.ts).
- The Worker checks mutation origins before dispatch, limits streamed body bytes even without a trustworthy Content-Length, and uses atomic shared D1 counters. Guard-storage failures fail closed. See [request-security.ts](../lib/request-security.ts) and [security-rate-limit.ts](../lib/security-rate-limit.ts).
- Reviewed ownership helpers bind access to the authenticated user and resource. Admin routes require the admin helper and email allowlist. Continue enforcing authorization at every operation; a protected page or hidden button is insufficient. [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- Checkout uses server-loaded prices and inventory. Stripe webhooks verify raw-body signatures, timestamp tolerance, and live/test mode, with separate platform and Connect secrets. Existing tests cover additional financial invariants. Continue using hosted payment collection and minimizing card-data handling. [Stripe security guide](https://docs.stripe.com/security/guide)
- Uploads already have size/type controls, randomized storage keys, and ownership checks. Private support files require access checks, PDFs download as attachments, and responses use nosniff.

The earlier [security checklist](security-checklist-audit.md) provides additional background. Its dated test counts are historical, not current verification results.

## Findings fixed in this patch

### 1. Route aliases bypassed some endpoint-specific limits

**Confirmed, priority high; patched locally.** Vinext strips a trailing `.rsc` and collapses repeated slashes before route dispatch, including API routes. The request guard previously matched the original path. Thus `/api/auth/sign-in/magic-link.rsc` did not receive the same five-per-ten-minute IP rule, and `/api/addresses/autocomplete.rsc` received the generic 64 KiB body budget instead of 4 KiB. Broader authentication/API limits and per-email limits still applied where matched; this was not an authentication bypass.

`securityPolicyPath()` now maps these aliases to their destination for rate limits, body budgets, response headers, and security-event classification. Webhook exemptions still use their existing exact-path check; `.rsc` and repeated-slash webhook aliases receive no new exemption. A regression test checks aliases against the installed Vinext normalizer, verifies that they share an exhausted sign-in bucket, and rejects an oversized address request.

### 2. Private pages lacked complete explicit Worker cache protection

**Confirmed defense-in-depth gap, priority medium; patched locally.** The Worker explicitly protected APIs and community pages, but omitted account, admin, store, resolution, and other private pages. Several pages already use `force-dynamic`; no production cache leak was demonstrated.

The Worker now applies `private, no-store` to the private route families, including `.rsc` responses. Requests with cookies, Authorization, or gateway identity, and responses setting cookies, also receive no-store policies. CDN and surrogate cache headers are set consistently so a preexisting public CDN policy cannot override the application policy. Cloudflare documents separate CDN-header precedence and dashboard rules that can override origin policies. Production cache rules still require verification. [Cloudflare cache controls](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/)

Tradeoff: cookie-bearing public responses handled by this Worker also become uncacheable. This is a conservative privacy default and may reduce cache hits. Anonymous public media can retain its cache policy. These response headers do not audit or purge existing framework/application caches.

### 3. A stricter route referrer policy was overwritten

**Confirmed, priority medium; patched locally.** `/api/shipping/label` set `no-referrer`, but the Worker replaced it with its default. The Worker now preserves route policies and explicitly uses `no-referrer` on authentication, checkout, receipt API, and unsubscribe paths. This reduces propagation of bearer links in Referer headers, including to same-origin resources. It does not remove tokens from browser history or access logs.

The regression tests also verify that cookies and existing security headers survive response wrapping, that private responses override public CDN headers, and that anonymous public media remains cacheable.

## Priorities identified before implementation

### P0 — Verify the administrator gateway boundary before relying on it

**Conditional critical impact; deployment status unknown.** [chatgpt-auth.ts](../app/chatgpt-auth.ts) reads `oai-authenticated-user-email`, and [admin-auth.ts](../lib/admin-auth.ts) checks that value against `ADMIN_EMAILS`. The application does not verify a signed identity assertion itself. This architecture depends on the gateway removing client-supplied identity headers and preventing direct ingress around that gateway.

In a staging environment with production-equivalent routing, inventory the canonical domain, aliases, `workers.dev`, preview/version URLs, and any direct origin. Send unauthenticated requests with a forged allowlisted test identity to a read-only admin endpoint. None may return admin data. Also verify that `CF-Connecting-IP` cannot be supplied by an untrusted ingress, because rate-limit identity depends on it. Do not treat a matching Host or Origin as proof of authenticated identity.

If bypass ingress exists, close it or add verified, issuer/audience-bound authentication supported by the actual hosting provider. If adopting Cloudflare Access, verify its signed assertion as documented; an identity header alone is not equivalent. Require MFA for privileged hosting, repository, payment, and admin identities and keep access narrowly assigned. [Cloudflare Worker routes](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

### P1 — Strengthen the browser script policy

**Confirmed hardening gap; no XSS exploit demonstrated.** [worker/index.ts](../worker/index.ts) still allows `script-src 'self' 'unsafe-inline'`. This weakens CSP as a fallback against script injection.

Introduce an unpredictable per-response nonce or an appropriate hash-based policy. Propagate it through the renderer to trusted scripts, start with report-only validation in staging, then enforce it after testing hydration, navigation, structured data, error pages, checkout returns, and uploads. Do not simply remove `unsafe-inline`, reuse a fixed nonce, or add nonces indiscriminately to all script tags. Cache behavior must be compatible with per-response nonces. [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

### P1 — Bind guest receipt access more tightly

**Confirmed bearer-link design; no session-ID guessing demonstrated.** [orders/by-session](../app/api/orders/by-session/route.ts) returns receipt details using only the Stripe checkout session ID. [getPublicOrderBySession](../lib/orders.ts) includes the full buyer email, items, and totals and has no receipt-access expiry check. Anyone obtaining a valid URL can read that response.

Preserve guest checkout while issuing a separate, expiring receipt capability bound to the originating browser or a verified email flow. Authenticated access should check the buyer relationship. Minimize the guest response and mask the email where possible. Test missing/expired capabilities, an unrelated account, multi-seller orders, refunds, and the guest returning from Stripe. The header patch reduces one leakage path; it does not change this authorization model.

### P1 — Add account-level storage and cost budgets

**Confirmed missing controls in reviewed upload handlers.** [collector photos](../app/api/collectors/photos/route.ts) and [store logos](../app/api/store/logo/route.ts) create new R2 objects without a cumulative account byte quota in those handlers. Existing IP and per-file limits do not bound long-term storage or abuse across addresses.

Add atomic per-account daily upload count/byte budgets, aggregate provider budgets, and cleanup for abandoned/replaced uploads. Fully decode and re-encode supported images with pixel/dimension limits; signatures and JPEG metadata removal do not establish that all file contents are safe. Quarantine/scan PDF support evidence where practical. Keep private originals inaccessible through public R2 endpoints. [OWASP resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/), [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

Related correctness issue: the logo handler accepts up to 5 MiB, but its route is absent from the multipart body-budget allowlist and currently receives the 64 KiB default. Align the limits when implementing upload budgets rather than raising a global limit.

### P1 — Prove authorization and payment invariants across all entry points

Existing helpers and selected tests are useful evidence, not complete coverage. Maintain an endpoint/action matrix for anonymous users, two unrelated buyers, two unrelated sellers, suspended sellers, and admins. Exercise IDs belonging to the other account for orders, labels, evidence files, private originals, conversations, offers, promotions, and preorders. Assert no reads, writes, or provider calls happen on denial.

Use Stripe test mode to test duplicate/out-of-order events, invalid signatures, replay, concurrent inventory reservations, partial refunds, transfers, and retries after provider timeouts. Establish that each operation is idempotent and that funds/inventory cannot be created or released twice. [OWASP ASVS business-logic requirements](https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json)

### P2 — Remove state-changing GET behavior and protect webhook tokens

[checkout/return](../app/api/checkout/return/route.ts) can expire an open checkout and release a reservation on GET, using an HttpOnly SameSite=Lax cookie and a provider-verified return token. Those checks limit the impact, but cross-site top-level GET navigation can carry Lax cookies. Move cancellation to an origin-checked POST after a read-only return page, preserving the Stripe return experience. Test that following a link alone cannot cancel another open checkout. [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

[Shippo's webhook route](../app/api/shippo/webhook/route.ts) uses a shared query-string token, not Stripe-style payload signing. Verify query redaction at every gateway and log sink and rotate the token after any exposure. A token does not authenticate body contents if it leaks. Evaluate provider-supported stronger delivery authentication and independent API reconciliation for consequential tracking transitions.

### P2 — Make security checks and recovery continuous

`.npmrc` and `scripts/sites-env.sh` disable automatic install-time audits. The explicit `npm audit --json --ignore-scripts` run succeeded with zero known advisories across production and development dependencies. No checked-in `.github` workflow was present. External CI may exist and was not inspected.

Add a scheduled and pull-request dependency audit, full-history secret scanning, and security tests to the real delivery pipeline. Pin and review updates for Vinext, React/RSC, Better Auth, Vite, and Wrangler; include build-tool dependencies in review. An empty advisory list is not proof that a dependency has no vulnerabilities. Better Auth's release guidance illustrates why auth upgrades must include integration testing. [Better Auth security update](https://better-auth.com/blog/security-update-june-2026)

The structured security logger omits sensitive values, but generic `console.error(error)` calls remain. Review upstream error objects and hosting logs for URLs, tokens, addresses, and email. Alert on admin access anomalies, signature failures, guard failures, upload growth, and payout/refund anomalies. Define retention and access controls. [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

Verify least-privilege deployment/service credentials, separate test/live resources, secret rotation procedures, and D1/R2 recovery. Restore a staging copy and reconcile restored financial state against Stripe before permitting payments or transfers. D1 Time Travel is a recovery mechanism whose availability and retention should be checked for the actual deployment; it does not roll back external payments or R2 objects. [Cloudflare D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/)

## Delivery sequence and evidence

1. **Before the next production release:** verify admin ingress, review cache/log rules, deploy the local fixes through the normal process, and confirm private HTML and RSC responses cannot be shared between two test accounts.
2. **Next hardening increment:** enforce the tested script policy, strengthen receipt authorization, add upload quotas/decoding, and complete the authorization matrix with payment concurrency tests.
3. **Ongoing:** run advisory/secret checks, review alerts, exercise restores, and arrange an independent scoped penetration test against a representative staging deployment.

Final local verification using Node 22.23.2:

- Full regression suite: **408 tests passed, 0 failed, 0 skipped**.
- Targeted security/auth/privacy/Stripe suite: **20 tests passed**.
- Production Vinext build and ESM Worker artifact/hosting-manifest validation: **passed**. The build emitted a duplicate `discovery` CSS output warning; no CSS files were changed in this patch.
- TypeScript `--noEmit`, ESLint on the three changed source/test files, and `git diff --check`: **passed**.
- Explicit npm audit across production and development dependencies: **0 known vulnerabilities reported**.

The existing package scripts use Bash. Equivalent Node entry points were used on Windows, including:

```text
npm audit --json --ignore-scripts
node node_modules/vinext/dist/cli.js build
node --experimental-loader ./scripts/cloudflare-validation-loader.mjs scripts/validate-artifact.mjs dist/server/index.js dist/.openai/hosting.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js worker/index.ts lib/request-security.ts tests/security-hardening.test.mjs
node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs
```

These tests include actual Better Auth behavior, SQLite-backed counters, and isolated Cloudflare runtime coverage. The Worker header test mocks application dispatch; it verifies boundary behavior rather than production CDN behavior. Deployment checks, browser verification through the real gateway, and the remaining priorities above are still required.
