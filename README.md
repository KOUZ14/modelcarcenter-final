# Model Car Center V1

Model Car Center is a guest-checkout marketplace for collectible model cars from independent sellers. The V1 supports the complete first business loop:

`seller inventory → marketplace search → product view → single-seller cart → Stripe Checkout → paid order → seller fulfillment`

It also includes Model Hunt, which records collector demand when the desired model is unavailable and lets the founder confirm and email a future match.

## V1 capabilities

- D1-backed catalog, products, sellers, applications, Model Hunts, subscribers, reservations, orders, order snapshots, and Stripe event deduplication
- Search across collector-relevant fields, filters, sorting, and pagination
- Public product and seller storefront routes with truthful inventory, shipping, and return information
- Device-local cart and wishlist, with one seller enforced per checkout
- Guest Stripe-hosted Checkout using Connect destination charges and a configurable application fee
- Atomic inventory reservation, release on expiration/failure, and webhook-only paid-order finalization
- Stripe-hosted seller onboarding, capability status tracking, full refunds with transfer and fee reversal
- Resend transactional email for paid orders, shipments, onboarding, and confirmed Model Hunt matches
- Founder-only ChatGPT-authenticated admin with an explicit email allowlist
- Validated CSV preview and seller-SKU upsert import
- Development-only demo seed; production is never automatically populated
- Sitemap, robots rules, product metadata/structured data, accessible forms, and working policy routes

The V1 intentionally does not include buyer accounts, seller dashboards, multi-vendor checkout, reviews, offers, auctions, messaging, or automated Shopify/eBay synchronization.

## Prerequisites

- Node.js 22.13 or newer
- npm
- Bash, GNU `timeout`, `flock`, `curl`, and `sha256sum` for the repository's Sites validation scripts (WSL2 is recommended on Windows)
- A Stripe account with Connect enabled for marketplace test mode
- A Resend account and verified sender/domain for live email
- OpenAI Sites access for hosted D1 and deployment

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

## Database and D1

The logical Sites D1 binding is `DB` in `.openai/hosting.json`. The schema is in `db/schema.ts`; generated migrations are committed under `drizzle/`. The local-only Wrangler configuration exists only to let the CLI manage the same logical binding during development.

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

## Stripe Connect and Checkout

1. Complete Stripe's Connect platform setup in test mode.
2. Configure platform responsibility and branding appropriate for destination charges.
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the marketplace settings to `.env.local` and the Sites runtime.
4. Submit a seller application through `/sell`.
5. In `/admin`, approve the application and select **Send onboarding**. The server creates a connected account and sends a single-use Stripe-hosted onboarding link.
6. After onboarding, use **Refresh Stripe** or the `account.updated` webhook. A seller can become active only when both charges and payouts are enabled and the founder has approved the seller.

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

Tests cover search normalization, availability, server totals, fee calculation, the single-seller rule, Model Hunt validation, CSV validation/upsert planning, Stripe signature and event idempotency logic, inventory reservation/release/completion, and the built marketplace artifact.

## Production launch checklist

Before moving from test keys to live operation:

1. Have counsel approve the launch-draft terms, privacy, return, and seller-terms pages.
2. Configure the production Sites `DB` binding and apply the committed migration; do not seed demo inventory.
3. Configure live Stripe Connect, platform branding, live secret key, live webhook endpoint, live webhook secret, commission, shipping countries, and optional automatic tax.
4. Onboard each real seller in Stripe live mode and confirm charges/payouts before activation.
5. Verify the Resend production domain and sender.
6. Set the production `SITE_URL`, `SUPPORT_EMAIL`, and `ADMIN_EMAILS`; keep `ADMIN_DEV_BYPASS` false or unset.
7. Import and review real seller inventory, images, shipping, and return summaries.
8. Run a low-value live order through payment, seller email, fulfillment, tracking email, and refund before opening traffic.
9. Remove any remaining `[DEMO]` records if a development database was ever copied manually.

The founder remains intentionally involved in seller review, inventory import, Model Hunt confirmation, fulfillment coordination, and refunds for V1.
