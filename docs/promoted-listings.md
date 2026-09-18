# Promoted listings

Professional sellers use `/store?view=marketing&filter=promoted`; an eligible inventory row also has a Promote link. Administrators use `/admin/promotions` for pricing, pilot access, delivery controls, refunds, payment recovery, and audit history. Purchase terms are at `/promotion-terms`.

## Price and launch controls

The introductory default is **$2.99 USD per listing for seven calendar days**. This is a product recommendation, not an observed market-clearing rate or a forecast of results. The owner requested a researched recommendation on September 17, 2026.

- [Etsy Ads](https://help.etsy.com/hc/en-us/articles/360033701174-How-to-Set-Up-and-Manage-an-Etsy-Ads-Campaign) has a $1 minimum daily budget and charges for clicks. A budget is a spending cap, not a guaranteed daily charge.
- [eBay's general campaign strategy](https://www.ebay.com/help/selling/listings/optimizing-your-listings?id=4164) uses a percentage of the qualifying sale amount, with attribution rules. Its payment risk and delivery model differ from this fixed-duration offer.

These are reference points, not directly comparable weekly placement prices. MCC has no established campaign-delivery history in this implementation. $2.99 (about $0.43 per day) limits the initial outlay while the pilot measures actual exposure. Review recorded delivery, seller uptake, and refund requests before increasing the price or enabling a broad paid rollout. Neither impressions nor sales are guaranteed.

Apply `drizzle/0028_promoted_listings.sql` together with its prerequisite migrations through the established migration/deployment workflow. Defaults come from `lib/promotion-rules.ts` until an administrator saves the singleton settings record:

- New purchases: disabled.
- Serving existing paid campaigns: enabled.
- Price: 299 cents; USD only in this version.
- Service tax treatment: unconfigured, which blocks purchases. Select either the appropriate no-collection setting or Stripe automatic tax with an appropriate service tax code. These are configuration choices, not an application determination of tax obligations.
- Pilot seller IDs: configurable allowlist; blank permits all eligible professional stores once purchases are enabled.

Settings changes require a reason and are audited. Disabling purchases does not stop existing campaigns. Disabling serving stops placements and logs the settings change so operations can identify the outage and issue service adjustments. The original campaign price, duration, tax configuration, and terms version remain frozen when settings change.

The feature uses existing Stripe platform credentials and `BETTER_AUTH_SECRET` for purpose-scoped placement signatures. It does not need new environment variables or a third-party tracking SDK. Live Checkout still enforces existing marketplace production-readiness checks.

## Eligibility and placement

Listings must belong to active professional stores with accepted current seller terms, a connected Stripe account with charges/payouts enabled, an active in-stock listing, remaining available units after reservations, and a primary image. Preorders and collector listings cannot be promoted. Check eligibility at purchase, payment activation, serving, and measurement time.

The first marketplace results page can show two sponsored cards above its organic grid. Search and filters use the same catalog predicates. Seller-specific views and later pages show no sponsored section. Listings already present in the organic page are excluded; organic counts, sorting, and pagination are unchanged. When every eligible listing is already visible organically, the sponsored section is empty. Explain this limitation when recruiting pilot stores.

Selection rotates by minute, chooses distinct sellers first, and then chooses listings within each selected seller. More purchased campaigns do not buy multiple slots per response. No equal-impression guarantee is made. Self-views by signed-in store owners and recognizable automated clients are excluded where identifiable.

## Payment and lifecycle

Each pending purchase owns one campaign and one durable payment attempt. Unique request/session/payment IDs and a partial unique live-listing index prevent duplicate purchases. Network errors preserve the attempt for recovery. A pending campaign can continue its original checkout from Seller Hub.

Promotion Checkout sessions carry `purpose=listing_promotion` metadata and charge the platform for an advertising service. They create no merchandise orders, inventory reservations, shipping charges, or seller transfers. Verified platform events are dispatched to promotion processing before normal order processing; Connect webhooks retain their separate verification route.

Activation requires a verified paid session with matching campaign, payment, seller, terms, subtotal, and currency. Current refunds are reconciled before first activation. The paid window begins once and lasts exactly seven days; repeated or late events cannot reset it. Pauses, temporary stock exhaustion, and seller-initiated cancellation do not extend it. Timestamp checks enforce expiry even if scheduled maintenance is delayed.

Cancelled/ineligible campaigns receiving a late payment queue a full refund. Refund requests stop delivery immediately, but remain pending until Stripe confirms the outcome. Admin partial refunds and dashboard refunds also stop delivery. Disputes pause active campaigns; winning a dispute permits administrator reinstatement only for the remaining original window.

Stripe platform event subscriptions must include Checkout completion, asynchronous payment success/failure and expiry, charge refunds, refund status changes, and dispute changes. Verify the destination in the target Stripe account before paid launch. Stripe delivery semantics are documented in the [webhook guide](https://docs.stripe.com/webhooks).

Scheduled Worker maintenance reconciles pending/active payments, expires campaigns, submits/reconciles queued refunds, and deletes measurement events older than seven days. An administrator can run recovery immediately. Lost checkout responses are recovered using the original idempotency key or bounded provider lookup. Uncertain refund submissions older than the safe key window remain flagged for review rather than being blindly reissued; inspect their provider state before resolving them. Financial records are retained.

## Reporting and privacy

An impression is a recorded continuous one-second view of at least half a sponsored card while the document is visible. A click is an explicit sponsored product-link interaction, including keyboard activation and middle-click. Wishlist actions, store links, ordinary cards, and framework prefetches do not count. Browsing/navigation still works if measurement fails.

Short-lived signed tokens identify the placement and page view. A database uniqueness constraint deduplicates impression/click events. The accepted event and aggregate increment happen in one atomic D1 batch. No campaign-event table stores buyer identities, emails, raw IP addresses, or search histories. The normal security rate limiter still processes requests.

Seller reports contain only their campaign totals. Counts are recorded events, not unique people; blocked requests and unidentified bots affect accuracy. CTR is clicks divided by impressions, omitted when impressions are zero. Conversion attribution and ROAS are not implemented.

Admin financial reporting separates collected amounts, original tax, confirmed refunds, and recorded processing fees. It is not an accounting net-revenue calculation: tax reversals and disputes require reconciliation. The last 100 seller campaigns and last 200 admin campaigns are shown; retained database history is not deleted by these display limits.

## Verification

`tests/promotions.test.mjs` runs real generated SQLite migrations with mocked Stripe calls and exercises ownership, eligibility, checkout retry, duplicate payment events, expiry, pauses, refunds, disputes, rotation, filters, organic exclusion, event signatures, event deduplication, and seller-scoped reporting. The Worker security fixture includes promotion maintenance. Run the project build, TypeScript, lint, and regression suite before release.

No live seller payment, refund, or ad campaign is created by these tests. Target-account configuration and real campaign delivery must be verified during the controlled pilot.
