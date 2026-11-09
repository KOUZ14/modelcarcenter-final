# Promoted listings implementation plan

Status: fixed-duration plan approved and implemented September 17, 2026. See [operations and configuration](promoted-listings.md). Paid launch remains controlled by the administrator.

## Product proposal

Let an approved professional seller pay to feature one eligible listing in a clearly labeled sponsored section on the first marketplace results page. The seller can review the price, purchase a promotion, manage its visibility, and see recorded impressions and clicks in Seller Hub > Marketing > Promoted listings.

The approved first version uses a fixed fee for seven calendar days. The introductory default is $2.99 USD per listing, configurable in administration. A percentage-of-sale or pay-per-click model would require a different billing and attribution design.

| Decision | Proposed starting point | Status |
| --- | --- | --- |
| Billing | One upfront payment per listing for seven days; seller explicitly purchases each renewal | Approved |
| Launch price | $2.99 USD introductory default; configurable by the administrator | Selected following the owner's request for a researched recommendation |
| Sellers | Approved, active professional stores with current seller terms and a purchasable listing | Proposed |
| Listings | Active, in-stock listings with available units and a primary image | Proposed |
| Placement | Up to two sponsored cards above the first page of marketplace results, at most one per seller | Proposed |
| Measurement | Recorded viewable impressions, product clicks, and click-through rate | Proposed |
| Cancellation | Stop showing immediately; voluntary pauses/cancellations do not extend the paid window | Policy to confirm |
| Refunds | Full refund if payment succeeds but activation is impossible; administrator handles service-failure adjustments | Policy to confirm |

This version sells eligibility for rotating placement over a stated period. Checkout must explain that placement depends on matching searches, availability, and competing campaigns; there is no guaranteed number of views or sales. Start with a limited seller pilot to measure delivery before widening paid availability.

## Seller experience

1. Open `/store?view=marketing&filter=promoted`, or choose Promote from an eligible inventory item.
2. Select one listing. Show why unavailable listings cannot be promoted, including stock, missing image, listing status, seller status, and an existing campaign.
3. Review the listing preview, placement description, duration, full price/tax breakdown, cancellation rules, and promotion terms. Record the accepted terms version with the purchase.
4. Continue to a dedicated Stripe Checkout session. Return to the same Seller Hub section with a payment-pending or active state derived from the server.
5. See campaigns with listing, status/reason, start/end, purchase amount, refund status, impressions, clicks, and CTR. Offer pause, resume, and end actions where allowed.
6. After expiry, offer a new purchase at the current price. A renewal is a new campaign and payment, preserving the previous history.

Preorders, collector accounts, bulk campaigns, scheduled starts, automatic renewals, bidding, keyword targeting, homepage placements, and conversion-based reporting can follow after this version. Preorder code is currently changing in the working tree; eligibility must explicitly require `in_stock`.

## Placement and eligibility

- Reuse the catalog's seller/listing status, accepted-terms, search, scale, manufacturer, condition, and availability rules. Add promotion-specific requirements without weakening the shared rules.
- Select sponsored results separately from organic results. Keep organic sorting, counts, pagination, and filter values intact. Do not show a sponsored section on later pages or on seller-filtered searches.
- Exclude listing IDs already present on the current organic page, then choose up to two candidates from different sellers. Leave unused slots empty when there are too few eligible candidates.
- Rotate eligible sellers using a server-controlled time bucket and deterministic ordering, then rotate listings within each seller. Buying more campaigns must not give a seller multiple slots in one response. Measure distribution during the pilot; do not promise equal impression counts.
- Label both the section and each sponsored card. The ordinary appearance of the same product elsewhere does not acquire a sponsored label or tracking.
- Validate eligibility on every placement request. Paused, ended, unpaid, refunded, disputed, expired, out-of-stock, archived, rejected, and suspended listings/campaigns cannot serve. A temporarily fully reserved listing is suppressed and can reappear if units become available before the campaign ends.
- Return ordinary results if promotion selection fails. Expiry is enforced by timestamps in serving queries, so a missed scheduled job cannot keep a promotion running.

## Lifecycle and payment rules

Keep delivery status and payment status separate. Suggested campaign statuses are `pending_payment`, `active`, `paused`, `ended`, and `expired`, with reason fields for operator actions and termination. Eligibility failures such as temporary stock exhaustion are computed serving restrictions, not proof that the payment failed.

- A draft selection needs no persistent campaign until checkout is requested. Create a pending campaign and a payment attempt before calling Stripe, using a unique request key.
- Allow at most one pending, active, or paused campaign for a listing. Enforce the rule in the database so concurrent tabs cannot buy duplicates. Failed/abandoned attempts are reconciled with Stripe before releasing the lock; an API timeout is not evidence that payment failed.
- Freeze listing ownership, purchased duration, amount, currency, and terms version in the purchase record. Calculate charges on the server. Changes to the configured price apply only to new purchases.
- A verified paid session activates the campaign exactly once and sets its first start/end timestamps. Repeated or out-of-order events cannot reset the start time, add duration, reopen a terminated campaign, or create another payment.
- Recheck seller/listing eligibility at activation. If payment arrived after cancellation or the listing is no longer eligible, record the payment and queue an idempotent full refund. Show refund-pending until Stripe confirms the outcome.
- Pause and resume only affect visibility within the original calendar window. Explain that the expiry does not move before purchase and before pausing. Ending is terminal; the seller can purchase another campaign later.
- A successful refund stops delivery; refund requests stop it while pending. Payment disputes also stop delivery. Reinstatement after a resolved dispute requires an explicit administrator action and cannot extend the original window.
- Handle delayed payment success/failure, expired Checkout sessions, failed/pending refunds, and refunds made in Stripe's dashboard. Scheduled maintenance retries reconciliation and alerts administrators to unresolved payments.

Create promotion charges as purchases from the platform. They must not create merchandise orders, inventory reservations, shipping charges, seller transfers, or seller gross-sales entries. Record advertising receipts, tax, processing fees, and refunds separately in platform reporting. Configure the service's tax treatment explicitly before paid launch instead of copying the model-car/shipping classification.

The existing platform webhook calls `processStripeEvent` in `lib/orders.ts` directly. Introduce explicit dispatch for promotion sessions before merchandise finalization and share event deduplication safely. Mark Checkout Session and PaymentIntent metadata with a purpose and campaign/attempt ID; match refund/dispute events to stored PaymentIntent/charge IDs. Metadata alone is not proof of ownership or the expected amount. Preserve platform/Connect webhook signature separation.

Use verified webhooks plus server-side reconciliation for payment confirmation. A success URL is not payment evidence. Stripe documents webhook delivery, duplicate events, and ordering considerations in its [webhook guide](https://docs.stripe.com/webhooks), and refund outcomes/events in its [refund guide](https://docs.stripe.com/refunds).

## Data and implementation boundaries

Proposed D1 tables, with Drizzle schema and a new generated migration:

| Table | Responsibility |
| --- | --- |
| `promotion_campaigns` | Seller/listing, campaign status, immutable purchase snapshot, accepted terms, first activation, expiry, pause/end reason, and concurrency version |
| `promotion_payments` | Checkout attempts and request keys, unique Stripe session/PaymentIntent/charge IDs, expected/paid amounts, currency, payment and dispute state |
| `promotion_refunds` | Requested amount/reason, unique operation key and Stripe refund ID, provider status, retry/error state |
| `promotion_events` | Short-lived, deduplicated impression/click records tied to campaign and issued placement token |
| `promotion_daily_metrics` | UTC-day campaign totals updated atomically only when a new event is accepted |
| `promotion_audit` | Actor, action, prior/new state, reason, and time for campaign/payment administrative changes |

Add seller/date and serving indexes, valid-status and nonnegative-money checks, unique provider/operation IDs, and a partial unique listing index for live/pending campaigns. Keep financial history when a listing is archived; campaign deletion must not cascade payment history. Use D1-compatible conditional updates and atomic batches to resolve races; Stripe calls happen outside database transactions with durable retry state.

| Existing area | Planned change |
| --- | --- |
| `components/seller-hub-panels.tsx` | Replace the promoted placeholder with a dedicated campaign panel |
| `components/store-dashboard.tsx`, `lib/store.ts` | Inventory entry point and seller-scoped campaign summary; load detailed history on demand |
| New `lib/promotions*.ts` modules | Eligibility, lifecycle, placement selection, payments, measurement, and reconciliation |
| New `/api/store/promotions` and `/api/store/promotions/checkout` | Owned campaign reads/actions and idempotent purchase creation using existing authentication/origin guards |
| New `/api/promotions/placements` and `/api/promotions/events` | Fetch eligible placements using the visible query/current page; accept bounded, signed measurement events |
| `lib/catalog.ts` | Extract reusable catalog predicates so sponsored and organic search constraints stay aligned |
| `components/marketplace-page.tsx`, `components/product-card.tsx` | Separate sponsored section, explicit presentation context, and labeled tracked links |
| `lib/stripe.ts`, `app/api/stripe/webhook/route.ts`, `lib/orders.ts` | Dedicated promotion Checkout body and explicit event dispatch, preserving merchandise behavior |
| `components/admin-dashboard.tsx`, `app/api/admin/route.ts` | Campaign inspection, termination/refunds, audit history, and promotion revenue reporting |
| `worker/index.ts` | Expiry, payment/refund recovery, event retention cleanup, and overdue-work reporting |
| Seller Hub docs, promotion terms, `.env.example` | Current capability description, purchase policies, feature controls, and price configuration |

Keep issued placement tokens out of shared caches. Fetch the sponsored section with `no-store` after organic results are known. Current Worker middleware already makes API responses private/no-store; make this endpoint's contract explicit rather than relying on the catalog route's nominal public cache header.

## Measurement

- Count a recorded impression when at least half of a card is visible for one continuous second while the document is visible. This is the product's chosen measurement definition. A catalog/API response, prefetch, or hidden card is not an impression.
- Count explicit clicks on a sponsored card's product links, including keyboard activation. Do not count wishlist/store links, ordinary product cards, framework prefetches, or server redirects alone. Navigation must still work when measurement fails.
- Issue a short-lived signed token containing campaign, listing, placement, expiry, and a random page-view nonce. Deduplicate by campaign, nonce, and event type with a unique database constraint. Reject forged/expired tokens and invalid placement contexts.
- Exclude authenticated seller self-views and known automated traffic where identifiable. Apply event-specific rate limits and payload limits using the existing request-security system. Report counts as recorded activity, not verified unique people; browser blocking and unidentified bots limit accuracy.
- Use no persistent cross-site identifier or buyer purchase linkage in this version. Keep accepted event IDs for seven days for deduplication/debugging, retain aggregate campaign metrics, and expose only seller-owned aggregates. Promotion tables must not store buyer emails, raw IP addresses, or full search histories.
- Compute CTR as recorded clicks divided by recorded impressions, with an empty state for zero impressions. Do not label ordinary sales during a campaign as attributed sales or show ROAS without an attribution design.

## Delivery sequence and completion checks

1. **Product rules and persistence.** Settle the billing model; implement eligibility, lifecycle, schema, migration, feature controls, and seller/admin authorization. Verify database uniqueness under concurrent requests and ensure disabled promotions do not affect marketplace use.
2. **Purchase and reconciliation.** Implement promotion Checkout, event routing, durable payment/refund records, and recovery. Verify failed/abandoned checkout, late payment, repeated/out-of-order webhook delivery, duplicate clicks on Pay, lost API responses, mismatched amounts/ownership, and cancellation during payment. Merchandise and preorder payments must continue to pass their existing tests.
3. **Seller and buyer workflows.** Build the campaign panel and inventory action, then sponsored selection and presentation. Verify query/filter relevance, exact expiry, seller diversity, organic count/order stability, duplicate suppression, stock reservation changes, and immediate suppression after suspension/refund.
4. **Measurement and operations.** Add deduplicated events, daily reporting, admin controls, and scheduled reconciliation. Verify event replay/concurrency, forged tokens, metric privacy, refund failures, and promotion-only revenue accounting. Exercise the full workflow with test payments and representative seeded campaigns.
5. **Pilot and paid rollout.** Validate the migration on a copy of the database, run the project build and relevant regression tests, and review the seller purchase/placement experience. Enable a limited seller pilot, inspect delivery and payment recovery, then widen access at the chosen price. Track paid-but-inactive campaigns, refund backlog, serving errors, delivery distribution, and campaign impressions/clicks.

Use independent controls for new purchases and serving. Disabling new purchases must preserve paid campaigns; an emergency serving shutdown must record the outage and support appropriate seller adjustments. Retain financial records and safe read-only campaign history during rollback.

The billing model, introductory price, and purchase terms are now implemented. Paid launch requires service tax configuration, administrator enablement, and verification in the target Stripe environment. Test coverage uses mocked Stripe responses; it does not prove a hosted account's webhook or tax configuration.
