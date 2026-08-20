# Model Car Center

Model Car Center is a collector-first marketplace for collectible model cars from independent professional and individual sellers. Guest browsing and checkout still work, while optional collector accounts add a persistent garage and self-service selling:

`find → buy → save → hunt → sell → fulfill`

The professional-seller flow uses the same seller/product/order architecture: seller applications, founder approval, Stripe Connect, checkout, webhooks, refunds, and Model Hunt administration remain intact, while approved stores can self-manage inventory and fulfillment.

## Capabilities

- Passwordless collector accounts powered by Better Auth email magic links, 10-minute hashed verification tokens, secure cookie sessions, and Resend delivery
- A protected **My Garage** for cross-device wishlists and carts, Model Hunts, orders, collector listings, sales, profile settings, and account deletion
- A protected **Store Console** for approved professional sellers with store-scoped inventory CRUD, CSV imports, order fulfillment, storefront settings, and sales analytics
- Conservative email-based claiming of legacy guest orders and Model Hunts: only a verified matching account can claim an unowned record
- Conflict-aware guest-to-account migration: wishlists are deduplicated, same-seller carts merge, and different-seller carts require an explicit choice
- D1-backed accounts, sessions, profiles, carts, wishlists, catalog, sellers, applications, Model Hunts, reservations, orders, snapshots, and Stripe event deduplication
- Search across collector-relevant fields, filters, sorting, and pagination
- Public product and seller storefront routes with truthful inventory, shipping, return, and professional/collector seller information
- Single-seller carts enforced for both guests and signed-in collectors
- Guest Stripe-hosted Checkout using Connect destination charges and a configurable application fee
- Collector listing drafts, structured condition/details, R2 photo uploads, founder moderation, rejection feedback, and controlled edits/deactivation
- Collector Stripe-hosted payout onboarding and a seller-only sales/fulfillment view
- Atomic inventory reservation, release on expiration/failure, and webhook-only paid-order finalization
- Stripe-hosted seller onboarding, capability status tracking, full refunds with transfer and fee reversal
- Resend transactional email for authentication, paid orders, shipments, onboarding, listing review, and confirmed Model Hunt matches
- Founder-only ChatGPT-authenticated admin with an explicit email allowlist
- Founder listing-review queue with approve/reject controls and seller suspension
- Validated CSV preview and seller-SKU upsert import
- Development-only demo seed; production is never automatically populated
- Sitemap, robots rules, product metadata/structured data, accessible forms, and working policy routes

The marketplace intentionally does not include multi-vendor checkout, reviews, offers, auctions, messaging, or automated Shopify/eBay synchronization.

## Prerequisites

- Node.js 22.13 or newer
- npm
- Bash, GNU `timeout`, `flock`, `curl`, and `sha256sum` for the repository's Sites validation scripts (WSL2 is recommended on Windows)
- A Stripe account with Connect enabled for marketplace test mode
- A Resend account and verified sender/domain for live email
- OpenAI Sites access for hosted D1, R2, and deployment

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run db:migrate:local
npm run db:seed
npm run dev
```

Open the exact local URL printed by Vite (normally `http://localhost:5173`).

The seed command is safe for development only. It inserts one seller and four products whose names begin with `[DEMO]`. It is never called by the application, build, migration, or production deployment.

On native Windows, use WSL2 for the scripted workflow. If running Vite directly from PowerShell, ensure Node 22+ is on `PATH`, then run `npx vite`.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public origin used in Checkout returns, email links, canonical URLs, and sitemap |
| `BETTER_AUTH_SECRET` | High-entropy secret (at least 32 characters) used to sign collector sessions and auth state |
| `SUPPORT_EMAIL` | Customer-facing support address |
| `ADMIN_EMAILS` | Comma-separated ChatGPT-authenticated emails allowed into `/admin` |
| `ADMIN_DEV_BYPASS` | Explicit local-only bypass; ignored when `NODE_ENV=production` |
| `STRIPE_SECRET_KEY` | Platform secret key; test key during development |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook` |
| `STRIPE_API_VERSION` | Pinned Stripe API version; default `2026-02-25.clover` |
| `MARKETPLACE_FEE_BPS` | Commission on item subtotal in basis points (`1000` = 10%) |
| `CHECKOUT_EXPIRATION_MINUTES` | Reservation/Checkout lifetime, 30–1440 minutes |
| `SHIPPING_COUNTRIES` | Comma-separated ISO two-letter countries, default `US` |
| `STRIPE_AUTOMATIC_TAX` | Enables Stripe automatic tax when `true`; no custom tax calculation exists |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, such as `Model Car Center <orders@example.com>` |

Hosted runtime values are configured through OpenAI Sites rather than committed env files.

## Collector authentication

Collector accounts use Better Auth's D1-compatible Drizzle adapter and magic-link plugin. The catch-all auth endpoint is `/api/auth/*`; `/sign-in` is the user-facing entry point. A new collector only enters an email, follows the single-use link, and then lands in the profile section of My Garage to confirm a display name. Existing collector sessions last 30 days and are refreshed daily.

For local sign-in, configure `SITE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM`. When Resend is not configured in development, the email layer logs that delivery was skipped, so a real magic-link round trip requires a development Resend key and verified sender.

Authentication and authorization are separate. Collector listing, image, and fulfillment endpoints derive the user from the server session and then constrain database reads/writes to that user's seller or product. Browser-supplied user IDs, emails, seller IDs, prices, and payout destinations are never trusted as authorization.

## Professional store accounts

Approved professional sellers use the same passwordless magic-link authentication at `/sign-in`, then work from `/store`. On the first verified sign-in, the app links the account only when exactly one unowned professional seller record has the same normalized contact email. It never claims collector sellers, already-owned stores, ambiguous duplicate-email records, or records for an unverified account.

The Store Console provides:

- Seller-scoped product creation and editing, stock changes that cannot drop below reserved inventory, publishing/unpublishing, and archival
- CSV preview and seller-SKU upsert importing using the canonical inventory template; new imports start as drafts and updates preserve the existing product status
- Paid-order details and shipping-address access for the owning store, plus tracking updates and customer shipment email
- Lifetime sales, order, fee, unit, inventory-value, low-stock, rolling six-month, and top-product analytics calculated only from that seller's records
- Storefront profile, shipping, and return-policy settings; contact-email changes, refunds, payout remediation, suspensions, and store closure remain founder/support actions

Professional stores can create and edit drafts before onboarding is complete, but products can become active only while the seller is active and Stripe reports both charges and payouts enabled. Suspended accounts retain read-only access. Store inventory "deletion" is archival so order snapshots and in-flight reservation references remain intact.

## Database and D1

The logical Sites D1 binding is `DB` in `.openai/hosting.json`. The schema is in `db/schema.ts`; Better Auth's generated schema is committed as `db/auth-schema.generated.ts`; additive Drizzle migrations are committed under `drizzle/`. The local-only Wrangler configuration exists only to let the CLI manage the same logical binding during development.

Generate a migration after a schema change:

```bash
npm run db:generate
```

Inspect the generated SQL, then apply it locally:

```bash
npm run db:migrate:local
```

Load the optional development catalog:

```bash
npm run db:seed
```

OpenAI Sites provisions the real D1 resource from the `DB` declaration and applies packaged migrations during deployment. Do not run the development seed against production.

Migration `0001_spicy_prism.sql` adds auth/session/profile, persistent cart/wishlist, account ownership, collector seller/listing, moderation, and R2 image metadata without rebuilding or deleting existing V1 tables. Apply migrations before testing account routes against an existing database.

### Account deletion and retained records

Account deletion revokes the collector's sessions, removes the Better Auth user/profile through foreign-key cascades, suspends the associated collector seller, and deactivates its listings. Paid orders remain as immutable transaction records; their `buyer_user_id` becomes null while order snapshots and fulfillment data are retained for operational, accounting, dispute, and legal needs. Uploaded listing media is not automatically erased because retained transaction/listing records may still reference it; support can handle an appropriate deletion request after retention obligations are satisfied.

## R2 listing images

The logical Sites R2 binding is `IMAGES`. Collector uploads accept JPEG, PNG, and WebP only, validate both declared MIME type and file signature, allow up to eight images per listing, and cap each image at 10 MB. Objects use unpredictable keys under `listings/<seller>/<product>/...`; D1 stores only metadata and the private bucket key. `/media/*` streams those objects with immutable cache metadata and content-type hardening.

For local development, ensure the `IMAGES` binding is available through the Sites/Vite environment before testing uploads. In production, Sites provisions the bucket declared in `.openai/hosting.json`.

## Collector selling and moderation

`/sell` presents two deliberate paths:

- **Sell from your collection** opens the authenticated collector listing flow at `/sell/model`.
- **Apply as a professional seller** keeps the original application and founder-managed inventory workflow.

Collector listings save as drafts. A collector can upload photos and edit the draft, but submission is gated on complete Stripe Connect charges/payout capability and at least one image. Submitted listings enter `pending_review` and are not public. The founder approves or rejects them in `/admin`; rejected listings preserve a review note for the collector. Editing a live collector listing returns it to review. Sellers can fulfill only their own paid orders, and suspension blocks seller actions.

## Stripe Connect and Checkout

1. Complete Stripe's Connect platform setup in test mode.
2. Configure platform responsibility and branding appropriate for destination charges.
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the marketplace settings to `.env.local` and the Sites runtime.
4. Submit a seller application through `/sell`.
5. In `/admin`, approve the application and select **Send onboarding**. The server creates a connected account and sends a single-use Stripe-hosted onboarding link.
6. After onboarding, use **Refresh Stripe** or the `account.updated` webhook. A seller can become active only when both charges and payouts are enabled and the founder has approved the seller.

Individual collectors start the same Stripe-hosted onboarding from My Garage. They never enter bank or identity data into Model Car Center. Their draft cannot be submitted, and an admin cannot approve it, until Stripe reports both charges and payouts enabled.

Checkout is server-authoritative. The browser sends only product IDs and quantities. The server reloads active products and the active seller from D1, checks available inventory, calculates shipping and the application fee, reserves inventory transactionally, then creates a finite Stripe Checkout Session. Stripe receives `application_fee_amount` and `transfer_data[destination]` for a destination charge.

### Webhook setup

Create a Stripe webhook destination pointing to:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `account.updated` (connected-account events)
- `charge.refunded`

For local forwarding:

```bash
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,account.updated,charge.refunded \
  --forward-to localhost:5173/api/stripe/webhook
```

Put the CLI's `whsec_...` value in `STRIPE_WEBHOOK_SECRET`. It is different from a Dashboard endpoint secret.

Use Stripe test mode and test payment methods until every seller/account, webhook, reservation, email, refund, and fulfillment path has been exercised. The success page does not create orders; it waits for the verified webhook-created order.

Full admin refunds are available only for paid, unrefunded orders. The server uses Stripe idempotency, reverses the seller transfer, refunds the application fee, and optionally restocks inventory after Stripe reports success. Partial refunds and disputes remain in the Stripe Dashboard for V1.

## Resend

1. Verify the sender domain in Resend.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Set `SUPPORT_EMAIL` to the monitored support inbox.

When Resend is absent in development, the email abstraction logs a clear skipped-email message and returns `sent: false`. Admin actions that require a real notification, such as notifying a Model Hunt collector, do not mark the collector notified when email is unavailable.

## Admin authorization

`/admin` uses the existing dispatch-owned Sign in with ChatGPT helpers. Do not create application routes for `/signin-with-chatgpt`, `/signout-with-chatgpt`, or `/callback`.

Authentication alone is not authorization. The signed-in email must appear in `ADMIN_EMAILS`. For example:

```dotenv
ADMIN_EMAILS=founder@example.com,operations@example.com
```

For local development only, `ADMIN_DEV_BYPASS=true` skips ChatGPT sign-in. The bypass is explicitly disabled whenever `NODE_ENV=production`.

The admin provides:

- Overview counts and simple Model Hunt demand breakdowns
- Seller application review, seller records, Stripe onboarding/status, activation, and suspension
- Product creation/editing, inventory changes, activation/deactivation, search, and seller filter
- CSV validation, preview, row errors, and commit
- Model Hunt probable matches, manual linking, and confirmed notifications
- Paid/unfulfilled/shipped/refunded order views, shipping/tracking email, and guarded full refunds

## Inventory CSV

Download the canonical template from the admin import tab. The columns are:

```text
seller_sku,title,description,scale,model_manufacturer,vehicle_make,vehicle_model,vehicle_year,color,condition,price,inventory_quantity,image_urls,keywords
```

- Select the seller before upload.
- `seller_sku`, title, scale, manufacturer, vehicle make/model, condition, price, and inventory are required.
- `price` is decimal currency and is normalized to integer cents.
- `condition` is `new`, `used`, `preowned`, or `other`.
- Multiple image URLs are separated with `|` or `;` and must use HTTP(S).
- The importer reports row-level errors and makes no changes until the preview is clean and committed.
- The unique key is seller + seller SKU. A later import updates that product and replaces its image list; it does not silently duplicate the SKU.
- New imported products start as drafts and must be activated by the founder.

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run validate:artifact
```

Tests cover search normalization, availability, server totals, fee calculation, the single-seller rule, Model Hunt validation, CSV validation/upsert planning, Stripe signature and event idempotency logic, inventory reservation/release/completion, safe auth redirects, resource ownership, seller-only fulfillment, wishlist deduplication, guest-data merging, verified legacy-record claims, moderation gates, image validation, and the built marketplace artifact.

## Production launch checklist

Before moving from test keys to live operation:

1. Have counsel approve the launch-draft terms, privacy, return, and seller-terms pages.
2. Configure the production Sites `DB` and `IMAGES` bindings and apply all committed migrations; do not seed demo inventory.
3. Generate and securely configure a production-only `BETTER_AUTH_SECRET`; confirm that `SITE_URL` exactly matches the public HTTPS origin.
4. Verify magic-link delivery, expiration, replay resistance, sign-out, protected-route redirects, and account deletion using a real production-domain inbox.
5. Configure live Stripe Connect, platform branding, live secret key, live webhook endpoint, live webhook secret, commission, shipping countries, and optional automatic tax.
6. Onboard a professional seller and a collector seller in Stripe live mode; confirm charges/payouts, listing moderation, destination charges, fees, and seller-only fulfillment.
7. Verify the Resend production domain and sender.
8. Set production `SUPPORT_EMAIL` and `ADMIN_EMAILS`; keep `ADMIN_DEV_BYPASS` false or unset.
9. Confirm R2 upload, media delivery, deletion, cache headers, MIME/signature rejection, and the eight-image/10-MB limits.
10. Import and review real professional-seller inventory, images, shipping, and return summaries.
11. Run a low-value live guest order and account order through payment, claim/link behavior, seller email, fulfillment, tracking email, and refund before opening traffic.
12. Remove any remaining `[DEMO]` records if a development database was ever copied manually.

The founder remains intentionally involved in professional seller approval, collector listing review, inventory import, Model Hunt confirmation, seller suspension, and refunds.
