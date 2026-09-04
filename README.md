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
- Guest Stripe-hosted Checkout using Connect separate charges and delivery-gated seller transfers
- Collector listing drafts, structured condition/details, R2 photo uploads, founder moderation, rejection feedback, and controlled edits/deactivation
- Collector Stripe-hosted payout onboarding and a seller-only sales/fulfillment view
- Atomic inventory reservation, release on expiration/failure, and webhook-only paid-order finalization
- Stripe-hosted seller onboarding, capability status tracking, full refunds with transfer and fee reversal
- Shippo carrier-rate comparison, protected 4×6 label purchase, package dimensions, high-value insurance/signature enforcement, tracking timelines, and same-recipient combined shipping
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
- A Shippo account and test API token for fulfillment development
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
| `SUPPORT_EMAIL` | Customer-facing support and email reply-to address; use `support@modelcarcenter.com` |
| `ADMIN_EMAILS` | Comma-separated ChatGPT-authenticated emails allowed into `/admin` |
| `ADMIN_DEV_BYPASS` | Explicit local-only bypass; ignored when `NODE_ENV=production` |
| `STRIPE_SECRET_KEY` | Platform secret key; test key during development |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook` |
| `STRIPE_API_VERSION` | Pinned Stripe API version; default `2026-02-25.clover` |
| `COLLECTOR_MARKETPLACE_FEE_BPS` | Collector marketplace commission on item subtotal in basis points; default `850` (8.5%) |
| `PROFESSIONAL_MARKETPLACE_FEE_BPS` | Standard professional-store commission on item subtotal; default `700` (7%) |
| `FOUNDING_SELLER_MARKETPLACE_FEE_BPS` | Active founding professional-store commission; default `500` (5%) |
| `FOUNDING_SELLER_PROMOTION_MONTHS` | Length of an admin-assigned founding promotion; default `6` months |
| `CHECKOUT_EXPIRATION_MINUTES` | Reservation/Checkout lifetime, 30–1440 minutes |
| `SHIPPING_COUNTRIES` | Comma-separated ISO two-letter countries, default `US` |
| `STRIPE_AUTOMATIC_TAX` | Enables Stripe automatic tax when `true`; no custom tax calculation exists |
| `SHIPPO_API_KEY` | Server-only Shippo token; use `shippo_test_...` during development |
| `SHIPPO_API_VERSION` | Pinned Shippo API version; default `2018-02-08` |
| `SHIPPO_WEBHOOK_SECRET` | Random secret embedded in the private Shippo tracking-webhook URL |
| `SHIPPO_INSURANCE_THRESHOLD_CENTS` | Item value that automatically requires carrier insurance; default `25000` ($250) |
| `SHIPPO_SIGNATURE_THRESHOLD_CENTS` | Item value that automatically requires standard signature confirmation; default `75000` ($750) |
| `SHIPPO_QUOTE_EXPIRATION_MINUTES` | Local rate-selection window; default `20` minutes |
| `SHIPPO_MAX_LABEL_COST_CENTS` | Hard server-side purchase limit per label; default `10000` ($100) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender; use `Model Car Center <support@modelcarcenter.com>` |

Hosted runtime values are configured through OpenAI Sites rather than committed env files.

## Collector authentication

Collector accounts use Better Auth's D1-compatible Drizzle adapter and magic-link plugin. The catch-all auth endpoint is `/api/auth/*`; `/sign-in` is the user-facing entry point. A new collector only enters an email, follows the single-use link, and then lands in the profile section of My Garage to confirm a display name. Existing collector sessions last 30 days and are refreshed daily.

For local sign-in, configure `SITE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM`. When Resend is not configured in development, the email layer logs that delivery was skipped, so a real magic-link round trip requires a development Resend key and verified sender.

Authentication and authorization are separate. Collector listing, image, and fulfillment endpoints derive the user from the server session and then constrain database reads/writes to that user's seller or product. Browser-supplied user IDs, emails, seller IDs, prices, and payout destinations are never trusted as authorization.

## Professional store accounts

Approved professional sellers use the same passwordless magic-link authentication at `/sign-in`, then work from `/store`. On the first verified sign-in, the app links the account only when exactly one unowned professional seller record has the same normalized contact email. It never claims collector sellers, already-owned stores, ambiguous duplicate-email records, or records for an unverified account.

The Store Console provides:

- Seller-scoped product creation and editing, stock changes that cannot drop below reserved inventory, publishing/unpublishing, and archival
- In-stock and preorder sales modes with required expected release dates, paid-order release snapshots, automatic ship-by recalculation, and buyer release-update email
- Durable one-time restock alerts on sold-out product pages; inventory increases reactivate sold-out listings and notify active subscribers
- CSV preview and seller-SKU upsert importing using the canonical inventory template; new imports start as drafts and updates preserve the existing product status
- Paid-order details and shipping-address access for the owning store, carrier rates and labels, handling reminders, tracking events, and manual-tracking fallback
- Lifetime sales, order, fee, unit, inventory-value, low-stock, rolling six-month, and top-product analytics calculated only from that seller's records
- Storefront profile, shipping, and return-policy settings; contact-email changes, refunds, payout remediation, suspensions, and store closure remain founder/support actions

Professional stores can create and edit drafts before onboarding is complete, but products can become active only while the seller is active and Stripe reports both charges and payouts enabled. Suspended accounts retain read-only access. Store inventory "deletion" is archival so order snapshots and in-flight reservation references remain intact.

### Availability lifecycle

Preorder inventory is an allocation: checkout charges the buyer in full, reserves the requested units exactly like in-stock inventory, and shows the expected release date on the product page, cart, Stripe line item, confirmation email, buyer account, and seller order. Mixed carts use the latest preorder release date as the fulfillment anchor. When a seller changes a preorder date or switches the product to in stock, affected paid orders receive an email and their ship-by deadline is recalculated.

Sold-out product pages remain public so collectors can save the model or register an email alert. Raising available inventory above zero reactivates a sold-out listing and attempts each active alert once. Successfully delivered alerts are marked notified; skipped or failed email deliveries remain active for a later retry. Every alert email includes a tokenized unsubscribe link.

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

Migration `0007_sudden_jimmy_woo.sql` adds seller ship-from/package defaults, short-lived rate quotes, purchased shipments, combined-order links, and deduplicated tracking events. Apply it before opening the Store Console shipping workflow.

Migration `0008_damp_eternity.sql` adds collector package dimensions, professional-store calculated/flat/free modes, buyer checkout-rate quotes, and immutable selected-service snapshots on reservations and orders.

## Shippo fulfillment

Shippo calls occur only on the server. The browser never receives the API token or an arbitrary Shippo label URL. Collector sellers use calculated checkout shipping from their listing package data. Professional stores choose calculated, flat-rate, or free shipping in Store settings. For calculated shipping, the buyer receives up to three server-selected carrier choices and the chosen rate is bound to the authoritative cart before Stripe Checkout starts.

Authenticated sellers can request fulfillment rates only for their own paid, unfulfilled orders. The server filters those rates to the buyer-selected service or an objectively equal/faster service; a slower downgrade is rejected for both Shippo labels and manual tracking attestations. A label purchase accepts only a rate ID captured in that owner’s unexpired quote; the quote is atomically claimed before purchase and cannot be reused.

Before requesting rates, complete the ship-from address, carrier phone, and default package dimensions in **Store Console → Settings**. Package values can be adjusted per shipment. The server calculates declared value from authoritative order subtotals and automatically adds insurance and standard signature confirmation at the configured thresholds. Sellers cannot turn those protections off in the browser.

Combined shipping is available for up to ten open orders only when seller, currency, normalized buyer email, and normalized delivery address all match. One Shippo transaction and tracking number is then linked to every included order.

Label creation moves orders to `processing`; it does not satisfy the handling deadline. Orders become `shipped` only after Shippo reports carrier transit, and `delivered` after a delivery event. Sellers can manually refresh tracking from the order view. For automatic events, create a Shippo `track_updated` webhook pointing to:

Verified-purchase feedback does not unlock when an order is merely marked `shipped`. Publishing is allowed after the carrier changes the order to `delivered`, with a 14-calendar-day fallback from `shipped_at` so a missing final carrier scan cannot block the buyer indefinitely. The same delivery eligibility rule protects the write endpoint and filters public seller reputation.

```text
https://YOUR_DOMAIN/api/shippo/webhook?token=YOUR_SHIPPO_WEBHOOK_SECRET
```

Use a test webhook with a `shippo_test_...` token. The handler rejects live events when the integration is in test mode. Rotate `SHIPPO_WEBHOOK_SECRET` if the webhook URL is exposed.

### Account deletion and retained records

Account deletion revokes the collector's sessions, removes the Better Auth user/profile through foreign-key cascades, suspends the associated collector seller, and deactivates its listings. Paid orders remain as immutable transaction records; their `buyer_user_id` becomes null while order snapshots and fulfillment data are retained for operational, accounting, dispute, and legal needs. Uploaded listing media is not automatically erased because retained transaction/listing records may still reference it; support can handle an appropriate deletion request after retention obligations are satisfied.

## R2 listing images

The logical Sites R2 binding is `IMAGES`. Collector listings, professional Store Console products, and founder-admin products accept direct JPEG, PNG, and WebP uploads instead of image URL fields. Uploads validate both declared MIME type and file signature, allow up to eight images per listing, and cap each image at 10 MB. Objects use unpredictable keys under `listings/<seller>/<product>/...`; D1 stores only metadata and the private bucket key. `/media/*` streams those objects with immutable cache metadata and content-type hardening.

For local development, ensure the `IMAGES` binding is available through the Sites/Vite environment before testing uploads. In production, Sites provisions the bucket declared in `.openai/hosting.json`.

## Collector selling and moderation

`/sell` presents two deliberate paths:

- **Sell from your collection** opens the authenticated collector listing flow at `/sell/model`.
- **Apply as a professional seller** keeps the original application and founder-managed inventory workflow.

Collector listings save as drafts. A collector can upload photos and edit the draft, but submission is gated on complete Stripe Connect charges/payout capability, every collectible-grade disclosure, all six photo-checklist confirmations, and at least four original images. Submitted listings enter `pending_review` and are not public. The founder approves or rejects them in `/admin`; rejected listings preserve a review note for the collector. Editing a live collector listing returns it to review. Sellers can fulfill only their own paid orders, and suspension blocks seller actions.

Every new listing records model condition separately from packaging condition, original-box status, missing parts, defects, restoration/customization, material, product number, edition/serial, COA status, accessories, and provenance. Missing-parts, defects, restoration/customization, and accessories fields require an explicit disclosure such as `None known`; provenance and identifiers remain optional when they do not exist. The same standard applies to collector, professional-store, admin, and CSV-created drafts before they can become active.

## Stripe Connect and Checkout

1. Complete Stripe's Connect platform setup in test mode.
2. Configure platform responsibility and branding appropriate for separate charges and transfers.
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the marketplace settings to `.env.local` and the Sites runtime.
4. Submit a seller application through `/sell`.
5. In `/admin`, approve the application and select **Send onboarding**. The server creates a connected account and sends a single-use Stripe-hosted onboarding link.
6. After onboarding, use **Refresh Stripe** or the `account.updated` webhook. A seller can become active only when both charges and payouts are enabled and the founder has approved the seller.

Individual collectors start the same Stripe-hosted onboarding from My Garage. They never enter bank or identity data into Model Car Center. Their draft cannot be submitted, and an admin cannot approve it, until Stripe reports both charges and payouts enabled.

Checkout is server-authoritative. The browser sends only product IDs and quantities. The server reloads active products and the active seller from D1, checks available inventory, determines the seller's current fee program, calculates the commission against item subtotal only, reserves inventory and the exact fee snapshot transactionally, then creates a finite Stripe Checkout Session. New payments use separate charges and transfers: the platform charge is captured at checkout, while the seller transfer is released only after the carrier-confirmed delivery review window. Client-supplied fee values are ignored.

The V1 marketplace rates are 8.5% for collector sellers and 7% for professional stores. An admin can explicitly designate a professional store for the 5% founding rate; the stored six-month start/end window is evaluated on every checkout, then expires automatically back to 7% without deleting the seller's founding history. Orders retain `marketplace_fee_bps` and `platform_fee_cents`, so later pricing changes never rewrite historical fees. There are no listing, monthly, subscription, or account-opening fees for V1.

Marketplace commission and payment processing are separate. With the current separate-charges-and-transfers flow Stripe assesses processing fees to the Model Car Center platform, not the connected seller. Completed orders record the actual Stripe processing fee when Stripe returns the expanded balance transaction, the seller proceeds, and the transfer lifecycle; seller interfaces do not invent a processing amount when it is unavailable.

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
- `refund.updated`
- `refund.failed`
- `transfer.updated`
- `transfer.reversed`

For local forwarding:

```bash
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,account.updated,charge.refunded,refund.updated,refund.failed,transfer.updated,transfer.reversed \
  --forward-to localhost:5173/api/stripe/webhook
```

Put the CLI's `whsec_...` value in `STRIPE_WEBHOOK_SECRET`. It is different from a Dashboard endpoint secret.

Use Stripe test mode and test payment methods until every seller/account, webhook, reservation, email, refund, and fulfillment path has been exercised. The success page does not create orders; it waits for the verified webhook-created order.

Full admin refunds are available for orders with a remaining paid balance. Resolution cases support full and partial refunds. The server uses Stripe idempotency and either cancels an unreleased seller transfer or proportionally reverses a released transfer. Legacy destination-charge orders continue to reverse the destination transfer and refund the application fee.

## Resolution notifications

Customer Support updates queue transactional email for the affected party when a case is opened, the seller responds, either party adds evidence, a return is authorized, a case is escalated, or a refund is recorded. Escalations also notify the monitored support inbox. Each message links directly to the shared case timeline.

The worker checks once an hour for active seller-response, buyer-evidence, buyer-escalation, and return-shipment deadlines that are less than 24 hours away. It also releases eligible seller transfers three calendar days after carrier-confirmed delivery, while leaving any order with an active case on hold. Reminder records, case-event emails, transfers, and reversals are idempotent and failed financial operations are retried.

## Resend

1. Verify the sender domain in Resend.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to `Model Car Center <support@modelcarcenter.com>`.
4. Set `SUPPORT_EMAIL` to the monitored `support@modelcarcenter.com` inbox. All notification replies are routed there.

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
seller_sku,title,description,scale,model_manufacturer,vehicle_make,vehicle_model,vehicle_year,color,model_condition,packaging_condition,original_box,missing_parts,defects,restoration_customization,material,product_number,edition_serial,coa,accessories,provenance,price,inventory_quantity,availability_type,release_date,keywords
```

- Select the seller before upload.
- `seller_sku`, title, scale, manufacturer, vehicle make/model, collectible conditions/disclosures, material, price, and inventory are required.
- `price` is decimal currency and is normalized to integer cents.
- `availability_type` is optional and defaults to `in_stock`; use `preorder` with a `release_date` in `YYYY-MM-DD` format.
- `model_condition` is `mint`, `near_mint`, `excellent`, `good`, `fair`, or `poor`.
- `packaging_condition` is `sealed`, `mint`, `excellent`, `good`, `fair`, `poor`, or `not_included`; `original_box` is `included`, `not_included`, or `reproduction`.
- `coa` is `included`, `not_included`, or `not_applicable`.
- Add product photos from the product editor after the import. Photos are uploaded directly; sellers do not need to host them elsewhere.
- The importer reports row-level errors and makes no changes until the preview is clean and committed.
- The unique key is seller + seller SKU. A later import updates that product while preserving its uploaded photos; it does not silently duplicate the SKU.
- New imported products start as drafts. Before activation, add at least four photos and confirm the full photo checklist in the product editor.

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run validate:artifact
```

Tests cover search normalization, product availability modes, preorder release validation and ship anchors, server totals, fee calculation, the single-seller rule, Model Hunt validation, CSV validation/upsert planning, Stripe signature and event idempotency logic, inventory reservation/release/completion, safe auth redirects, resource ownership, seller-only fulfillment, wishlist deduplication, guest-data merging, verified legacy-record claims, moderation gates, image validation, high-value shipping rules, package validation, combined-shipping identity, handling reminders, tracking-state mapping, and the built marketplace artifact.

## Production launch checklist

Before moving from test keys to live operation:

1. Confirm the published Marketplace Terms, Privacy Policy, Returns & Refunds Policy, Shipping Policy, Cookie & Local Storage Policy, and Seller Terms with counsel before opening live transactions.
2. Configure the production Sites `DB` and `IMAGES` bindings and apply all committed migrations; do not seed demo inventory.
3. Generate and securely configure a production-only `BETTER_AUTH_SECRET`; confirm that `SITE_URL` exactly matches the public HTTPS origin.
4. Verify magic-link delivery, expiration, replay resistance, sign-out, protected-route redirects, and account deletion using a real production-domain inbox.
5. Configure live Stripe Connect and Shippo, platform branding, live secret keys, both webhook endpoints/secrets, commission, shipping countries, high-value thresholds, and optional automatic tax.
6. Onboard a professional seller and a collector seller in Stripe live mode; confirm charges/payouts, listing moderation, delivery-gated transfers, fees, and seller-only fulfillment.
7. Verify the Resend production domain and sender.
8. Set production `SUPPORT_EMAIL` and `ADMIN_EMAILS`; keep `ADMIN_DEV_BYPASS` false or unset.
9. Confirm R2 upload, media delivery, deletion, cache headers, MIME/signature rejection, and the eight-image/10-MB limits.
10. Import and review real professional-seller inventory, images, shipping, and return summaries.
11. Run a low-value live guest order and account order through payment, claim/link behavior, seller email, fulfillment, tracking email, and refund before opening traffic.
12. Remove any remaining `[DEMO]` records if a development database was ever copied manually.

The founder remains intentionally involved in professional seller approval, collector listing review, inventory import, Model Hunt confirmation, seller suspension, and refunds.
