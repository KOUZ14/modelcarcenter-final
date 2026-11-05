# Security hardening — September 26, 2026

These changes are in the local working tree. They have not been deployed, and migration `0037_security_uploads.sql` has not been applied to the production database. No production payments, email, customer records, secrets, or hosting settings were changed.

## Implemented

| Area | Result |
| --- | --- |
| Administrator authentication | Gateway identity and `ADMIN_EMAILS` are now insufficient on their own. Every admin operation also requires a database-backed, verified app session for the matching email, created within the last 30 minutes. Stale sessions must sign in again. The development bypass remains disabled in production. |
| Guest receipts | New checkouts issue a signed, HttpOnly, Secure (HTTPS), SameSite=Lax cookie scoped to receipt APIs. The capability is bound to a checkout and expires after 24 hours. Without it, a verified signed-in buyer must own the orders. Full buyer emails are masked in receipt responses. |
| Checkout cancellation | GET only displays a return page. Closing a payment and releasing inventory requires an explicit button and origin-checked POST. A completed payment returns its receipt instead of releasing stock. |
| Browser policy | Production scripts require fresh server-generated nonces with `strict-dynamic`; inline event handlers, objects, framing, and base URL changes are blocked. The framework and product structured-data script receive the nonce. Nonce-bearing HTML/RSC and personalized responses are not cached. Styles still allow inline CSS. |
| Request boundary | Vinext `.rsc` and repeated-slash aliases share canonical route budgets. Exact webhook exemptions are preserved. Store logos now receive the intended multipart budget. Existing origin checks, streamed byte limits, and atomic shared rate limits remain in force. |
| Images | JPEG, PNG, and WebP are fully decoded and freshly encoded, dropping source metadata and appended content. Inputs are bounded to 10 MiB, 6 million pixels, and 4096 pixels per edge. Profile/logo routes retain their smaller file limits. Listing and support photo clients resize to at most 2400 pixels before upload. |
| Upload budgets | Transactional D1 accounting limits per-owner daily uploads to 200 objects/256 MiB and new retained storage to 2 GiB. Site totals are 5000 objects/2 GiB daily and 20 GiB retained. Original/cropped versions count separately. D1 failures deny writes; failed R2 writes refund retained-storage charges. Daily charges are not refundable. |
| Unused files | Hourly maintenance removes up to 50 unreferenced managed uploads older than seven days. Referenced listing images, support evidence, store logos, avatars, and cover photos are protected. Tombstones and database triggers prevent late attachment after cleanup. Legacy objects are neither automatically metered nor deleted. |
| Tracking webhooks | Notifications prompt a server-authenticated Shippo lookup before delivery/refund/payout eligibility changes. Tracking identity must match. Optional `SHIPPO_HMAC_SECRET`, once provisioned and set, makes raw-body signature and five-minute timestamp validation mandatory in addition to the existing token. |
| Error handling | API responses no longer echo arbitrary checkout/provider exceptions. Server console logging uses bounded event names, status codes, and controlled reason codes instead of raw exception objects. |
| Continuous checks | Added dependency auditing, pinned/checksummed full-history Gitleaks scanning, type/lint/build/tests, and a disposable production-runtime verification job. Dependabot checks npm and GitHub Actions weekly. Magic-link email delivery also has a site-wide 2000/day budget. |

The upload migration is additive. Cleanup requires the new tables and triggers before the new Worker is deployed. Budgets cover uploads made through the new code; an R2 inventory/backfill is needed to include historical storage in aggregate capacity planning.

## Dependency remediation

Updated Next.js and its ESLint configuration to **16.3.6**, Cloudflare Vite plugin to **1.60.2**, Wrangler to **4.141.0**, and Drizzle Kit to **0.31.11**. Patched transitive dependencies include sharp/libvips, URI/YAML parsers, browserslist, and fflate. A narrow override removes the obsolete esbuild version under Drizzle's legacy loader; Drizzle's configuration check passes with it. Added pinned Photon/Wasm and image-size dependencies for image validation.

The registry reported critical Next.js and high image-processing/tooling advisories in the old tree. The Windows Next.js advisory does not establish that the deployed Vinext/Workers app was exploitable; upgrading removes the vulnerable dependency regardless. [Next.js advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [image optimizer advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)

The Gitleaks history scan covered 85 commits. Thirteen initial matches were reviewed: deterministic dummy credentials and tax calendar identifiers in named test files. `.gitleaks.toml` permits only those exact fixture values/patterns in those files; it does not exclude tests generally.

## Verification

Final local results on Node 22.23.2:

- **418 tests passed; zero failures or skips.**
- Production build, ESM artifact validation, and the workerd integration check passed, including successful fresh admin access and rejection after its 30-minute window.
- TypeScript and Drizzle configuration checks passed. ESLint reported zero errors and 16 existing UI/performance warnings. `git diff --check` passed.
- Fresh npm audit after dependency remediation reported **zero known vulnerabilities**, including development dependencies.
- Gitleaks passed for all **85 commits** and the **554-file source snapshot**, using the reviewed fixture exceptions described above.

The regression suite covers authentication, request normalization, CSRF/body budgets, Stripe signatures/modes and financial workflows, ownership, private media, checkout, receipts, malformed images, atomic upload accounting, cleanup races, and provider-confirmed tracking. New tests reject unrelated receipt accounts, expired/tampered capabilities, stale or mismatched admin sessions, forged delivery transitions, and repeated quota refunds.

`scripts/verify-security-runtime.mjs` runs the built artifact in workerd with a fresh D1 database, temporary R2 bucket, synthetic signed Better Auth session, and outbound provider calls blocked. It applies every migration; checks real HTML script nonces and no-store headers; rejects forged admin and anonymous private requests; and tests a 2400×2400 photo through the actual Wasm decoder and upload route. This supplements Node tests rather than mocking the Worker environment.

Reproduce on Node 22:

```sh
npm ci --ignore-scripts --offline=false
node scripts/audit-dependencies.mjs
npx tsc --noEmit
npx eslint . --ignore-pattern dist --ignore-pattern .next
npx vinext build
node --experimental-loader ./scripts/cloudflare-validation-loader.mjs scripts/validate-artifact.mjs dist/server/index.js dist/.openai/hosting.json
node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs
node scripts/verify-security-runtime.mjs
```

## Rollout and remaining work outside this source patch

1. Back up D1 and record the current deployed version. Apply migration **0037**, deploy the tested artifact, and verify admin sign-in, guest/verified-buyer receipts, uploads, and checkout cancellation on the canonical site. Keep the additive tables if rolling back application code. Old guest receipt links require verified buyer sign-in because they lack the new cookie.
2. Enable the new workflow in the actual GitHub delivery repository, require its checks before merge, and route failed scheduled scans to an owner. Files in the working tree do not establish that remote CI or branch protection is enabled.
3. Verify gateway stripping, direct-origin/alias access, trusted client-IP headers, CDN cache overrides, and query-string redaction on every production ingress. Test two unrelated accounts through the real gateway and verify browser hydration/navigation under CSP. Local workerd does not emulate hosting/CDN policy.
4. Require MFA on the admin mailbox, hosting, repository, payment, and email-provider accounts. Review least-privilege tokens, test/live separation, and secret rotation. These are account settings, not source changes.
5. Have Shippo provision HMAC delivery and then set `SHIPPO_HMAC_SECRET` to its separate shared key. Do not set it before provisioning or legitimate events will be rejected. Until then, the token and authoritative lookup remain active. [Shippo webhook security](https://docs.goshippo.com/tracking/webhook-security)
6. Provision a malware scanning/quarantine service for PDFs. PDFs remain private, access-controlled, forced-download attachments with restrictive CSP and nosniff; **they are not malware-scanned**. A signature prefix or response header cannot establish that a PDF is safe to open in a native viewer.
7. Configure alerts for `security_control_unavailable`, webhook rejection spikes, admin failures, `operation_failed`, and site-wide budget exhaustion. Redact URLs/queries and restrict log access/retention. Audit/retry records in D1 may retain provider error descriptions and also require restricted access and retention. The patch removes raw exceptions from console logs, not from every operational database record.
8. Exercise D1/R2 restores into isolated resources with integrations disabled. Compare restored orders, refunds, disputes, and transfers against Stripe before enabling financial jobs. A database rollback cannot roll back money movements or recover deleted R2 objects. Verify actual backup retention and maintain independent penetration testing and endpoint/action coverage.

This is a substantial source-level security improvement, not an ASVS certification or a guarantee that every vulnerability is absent. The initial threat model and research references remain in [the review](application-security-review-2026-09-26.md).

## Dependency follow-up — October 31, 2026

The earlier zero-advisory result above is historical. The launch review found six production dependency entries (two critical, three high, one low) and additional tooling findings in the old lockfile.

The follow-up upgrades Better Auth, its Drizzle adapter and CLI together to 1.7.14; Next.js and its ESLint configuration to 16.4.3; Cloudflare's Vite plugin to 1.66.0 and Wrangler to 4.154.0; Vite to 8.3.5; and Vinext from beta.8 to stable 1.0.0. React remains 19.2.8. Compatible transitive dependencies are refreshed in the lockfile, including sharp, source-map-js, Zod and Undici. Satori's pinned fflate is overridden to the patched 0.7.5 release. TypeScript ESLint's named-export minimatch dependency is scoped to patched 11.0.3; the older CommonJS callable API used by ESLint is not replaced with an incompatible major.

### Reviewed lint-only advisory

The remaining npm finding is [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249), propagated through ESLint's dependencies. The maintainer describes an optimizer in minimatch 10.2.6 that expands attacker-controlled glob patterns when `optimizationLevel >= 2`. The registry applies a broader `<11.0.1` range. The retained minimatch 3.1.5 implementation does not contain `firstPhasePreProcess`, `secondPhasePreProcess` or that optimization-level path. It is used only by development lint tools; application requests do not supply their patterns. Upgrading this callable CommonJS dependency directly to 11 would break its consumers.

CI uses `scripts/audit-dependencies.mjs` to keep the moderate-or-higher gate while reporting this specific reviewed finding. The exception is limited to the named lint dependency chain, minimatch **3.1.5**, development-only lockfile entries, and that exact moderate advisory. It expires **December 1, 2026**. New advisories, higher severity, missing evidence, production dependencies and failed registry responses still fail the check. Tests exercise those boundaries and npm's cyclic dependency metadata. Raw `npm audit` continues to report the finding; it is not represented as a clean full-tree audit. Re-review or remove this exception when compatible upstream releases or corrected advisory ranges become available.

Better Auth's security update changes verification-token identifiers. Use a newly requested magic link after deployment; a link generated before the update can fail.

The [Better Auth 1.7 upgrade guide](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/guides/1-7-upgrade-guide.mdx) also requires removal of the `account.issuer` requirement introduced in 1.7.0–1.7.2. The patched official CLI regenerated `db/auth-schema.generated.ts`. Append-only migration **0039** drops the obsolete issuer index and column, retaining account IDs, provider IDs, user links, credentials and sessions. The live `account` table was inspected before rollout and contained zero rows, so there were no duplicate provider/account keys or issuer values to migrate. Existing applied migrations remain unchanged. Review of Drizzle's output removed an unrelated table rebuild caused only by equivalent `CURRENT_TIMESTAMP` formatting; the generated snapshot records the current declarations. Rollback to 1.7.0–1.7.2 requires restoring their schema compatibility; prefer a forward fix with the patched package set.

The migration regression test checks populated legacy accounts and sessions as well as new inserts without issuer. Isolated workerd validation requests and consumes real magic links through the Drizzle/D1 adapter for new and existing users, with Resend intercepted locally and all other outbound calls blocked. This does not establish live inbox delivery or browser behavior.

Artifact validation caught a Vinext 1.0 compatibility issue: nested Worker chunks import runtime manifests as siblings although Vinext emits the originals at the server output root. The Sites build plugin places RSC Worker chunks beside those root-level manifests, including manifests populated after bundling. Client asset paths retain Vinext's defaults. Production artifact import and isolated workerd validation cover this packaging repair.

The shared discovery stylesheet is imported by its server pages. This avoids a nonexistent JavaScript preload emitted for the shared CSS-only client chunk, matching the upstream [RSC preload issue](https://github.com/cloudflare/vinext/issues/3064). A regression check validates every local asset URL in both RSC preload manifests against the emitted client files; it reproduced the missing preload before the import adjustment and passed afterward.

Final pre-publication validation: clean locked install; production audit **0** findings; full audit **15 moderate dependency entries**, all traced to the reviewed lint-only advisory; security gate passed; TypeScript and Drizzle checks passed; ESLint had 0 errors and 17 unrelated warnings; production build and artifact import passed; **438 tests passed**; isolated workerd checks, including new/existing-user magic-link sign-in, passed. Browser automation was unavailable in this environment, and live inbox delivery remains a separate manual check.
