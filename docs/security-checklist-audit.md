# Security checklist review

Reviewed 2026-09-16 against the 20 concerns supplied in the screenshot. The implementation is a Vinext/React Cloudflare Worker, D1/R2 storage, Better Auth 1.7.1 passwordless magic links, Sites identity for administrators, Stripe, and Shippo. There is no application password login or AI model integration.

| # | Concern | Outcome |
|---|---|---|
| 1 | HSTS | Already set by the Worker: one year with `includeSubDomains`. Preserved on guard rejection responses too. HTTPS termination remains a hosting responsibility. |
| 2 | CSRF tokens | Added a central, fail-closed origin check for every unsafe request before application processing, including JSON, multipart uploads and forms. Production accepts only the configured `SITE_URL` origin. A same-origin Referer is the fallback when Origin is absent; missing/null/foreign sources and cross-site Fetch Metadata are rejected. Better Auth's CSRF checks remain enabled. Explicit tokens are unnecessary for the current strictly same-origin browser interface under this policy. |
| 3 | Reset sessions on password change | Not applicable: password authentication is explicitly disabled. Database sessions remain revocable through Better Auth; cookie session caching is explicitly disabled so revocation takes effect immediately. If passwords are added, revocation on both change and reset must be configured then. |
| 4 | Expire reset links | The equivalent magic links already expire after 10 minutes, store hashed tokens, and are consumed once. Regression tests exercise actual verification, expiry and replay rejection. |
| 5 | Prevent user enumeration | Magic-link requests do not branch on account existence. The same success response covers new/existing addresses, email cooldowns and delivery failures. Sign-in copy now reflects that a request may be suppressed. Email/name inputs are normalized and bounded before auth storage. |
| 6 | Allowlist uploads | Existing MIME and signature checks permit JPEG/PNG/WebP listing photos and PDF/image support files, with randomized R2 keys, file/count caps and `nosniff` on serving. Support PDFs download as attachments. Added a size check before reading support files; request limits now run before multipart parsing. These checks are not a malware scanner or full image decoder. |
| 7 | Verify payment webhooks | Existing raw-body HMAC verification, timestamp tolerance, separate Stripe platform/Connect secrets, mode checks and event deduplication are preserved. Only the three specific Stripe/Shippo POST webhook routes bypass browser-origin checks; they still authenticate their deliveries. Added security events for rejected webhooks without logging payloads or tokens. |
| 8 | Set prices server-side | Already enforced: checkout loads authoritative product prices, quantities, seller accounts, fees and shipping calculations server-side. Existing checkout/Stripe tests cover these paths. |
| 9 | Block prompt injection | Not applicable: no AI model, prompt execution or model-enabled tool endpoint exists in the application. User content remains data. |
| 10 | Cap AI usage | Not applicable: no AI integration. Added request limits to existing public submission, checkout, shipping and address lookup APIs to reduce abuse of those services. Provider billing caps remain an operational control. |
| 11 | Limit request size | Added streamed byte counting before body parsing or side effects, including absent/dishonest Content-Length. Auth: 16 KiB; address lookup: 4 KiB; webhooks: 1 MiB; multipart photo/support uploads: 11 MiB; inventory-capable admin/store requests: 6 MiB; other bodies: 64 KiB. Oversized requests return 413; unsupported content encodings return 415. Upload budgets match the existing 11 MB Vinext guard. Very large combined support uploads or unusually escaped CSV imports must fit the total request budget. |
| 12 | Rate limit password resets | No reset flow. The equivalent magic-link flow now has shared D1 limits: five requests per client IP in 10 minutes and three emails per normalized address in 10 minutes. Email throttling does not reveal account existence. |
| 13 | Sanitize before storing | Existing bounded text normalization, numeric/enum/URL validation, parameterized SQL and React/email output escaping are preserved. Added auth input normalization. Do not HTML-encode all database values: escape according to the output context. Product JSON-LD already escapes `<`. |
| 14 | Lock down CORS | The application has no cross-origin API consumers. Worker responses remove permissive origin/credential CORS headers; mutation-origin enforcement is independent of CORS. Authentication/private API responses are explicitly non-cacheable. |
| 15 | Disable directory listing | No directory-index route is exposed. Public media retrieves a single listing object by key, never lists R2, and excludes private support-file prefixes. Keep source, migrations and secrets outside public assets when hosting. |
| 16 | Remove default admin route | Kept `/admin`: the relevant control is existing server-side Sites sign-in plus the `ADMIN_EMAILS` allowlist on admin pages/APIs. Development bypass remains disabled in production. Renaming a route would not improve authorization. |
| 17 | Lock accounts after failed login | No passwords to brute-force. Added a temporary shared authentication attempt limit (20/minute per client), including magic-link verification, alongside Better Auth's endpoint limiter. Accounts are not permanently locked by unauthenticated attempts, preventing trivial denial of service against another collector. |
| 18 | Log security events | Added structured events for rejected requests/webhooks, rate limits, failed security controls, access denials, auth results, admin mutations, and magic-link delivery failures. These events omit identities, request bodies, queries, cookies, tokens and exception messages. Configure retention/alerts at the hosting/logging layer. |
| 19 | Secure cookie flags | Already configured: HttpOnly, SameSite=Lax, host-scoped cookies and Secure in production. Real auth tests assert these flags and session revocation. Production now also rejects short/placeholder auth secrets. Magic-link response Referrer-Policy is `no-referrer`. |
| 20 | Restrict database permissions | The app uses a server-side D1 binding with ownership/admin checks and parameterized SQL; no browser database credential is introduced. Cloudflare/Sites roles, resource-scoped deployment tokens and direct Worker reachability must be verified in hosting. There is no PostgreSQL-style role grant to apply to this D1 binding. |

## Rate-limit storage and rollout

`0022_security_rate_limits.sql` is additive. Apply it before activating the new Worker (and to local D1 before exercising the APIs). Counters use a single conditional upsert to avoid read-then-write races across Worker instances. Their keys are HMACs using the auth secret, rather than stored email/IP values. Expired counters are reused on demand and deleted during existing hourly maintenance. Rejected requests do not extend a cooldown. Storage failures return 503 instead of allowing unthrottled access.

All API consumers share a 300/minute client cap in addition to sensitive-route rules. Client identity comes only from Cloudflare's `CF-Connecting-IP`; IPv6 clients share a /64 bucket. Missing/invalid ingress identity uses a shared restricted bucket. Better Auth's existing in-memory limiter is retained as an extra layer; the Worker/D1 guard is the persistent control. The limits reduce abuse; they are not a substitute for edge DDoS protection or aggregate provider spending limits.

`SITE_URL` must be the canonical HTTPS origin used by the browser. Redirect aliases to it. Clients issuing mutation requests must send that Origin (or a same-origin Referer). No blanket exemption exists for originless scripts or CORS preflights. Stripe and Shippo POST callbacks retain their exact exceptions and signature/token checks.

## Hosting controls to verify

- Ensure Cloudflare/Sites overwrites `CF-Connecting-IP` and `oai-authenticated-user-*` at the trusted gateway, and that the application Worker cannot be reached around that gateway with forged identity headers.
- Confirm HTTPS and HSTS coverage, narrow `ADMIN_EMAILS`, a random production auth secret of at least 32 characters, separate webhook secrets, and no production development bypass.
- Restrict deployment, D1 and R2 access to the required people/services and resources. Keep database migrations/deployment credentials outside browser assets and use separate local/test resources.
- Enable appropriate log retention and alerts for repeated denials, delivery failures and unavailable guards. Review limits against normal traffic and configure provider budgets.

These account-level settings are not established by a local source audit. No production settings or permissions were changed by this patch.

## Verification

`tests/security-hardening.test.mjs` exercises origin checks, exact webhook exceptions, body streaming/cancellation, real multipart uploads, concurrent SQLite-backed counters, expiry/cleanup, spoofed IP headers, unavailable storage, Worker dispatch/header behavior, and the actual Better Auth magic-link lifecycle. Existing suites cover payments, ownership, uploads and validation.

Validation passed: production build, Worker artifact validation, TypeScript checking, repository ESLint, and all 171 tests (zero skipped). The existing Node runtime was invoked directly on Windows because the package scripts use Bash. No live emails, payments, or production data mutations were used for tests.

References: [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit), [Better Auth magic links](https://better-auth.com/docs/plugins/magic-link), [Better Auth cookies](https://better-auth.com/docs/concepts/cookies), and [Cloudflare authorization](https://developers.cloudflare.com/workers/authorization/). Runtime-specific behavior was also checked against the installed dependency source.
