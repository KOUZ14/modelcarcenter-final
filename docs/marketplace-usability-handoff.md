# Marketplace usability handoff

September 18, 2026. This change extends the current site and preserves its existing branding, photographs, accounts, listings, guest checkout, collector tools and URLs. It includes existing working-tree improvements; those changes were retained rather than reset. **This is a code and automated-check handoff, not completion of the live usability study or browser acceptance checks.**

## Desktop homepage follow-up

At the owner's request, the homepage above 820px restores the previous large "Buy and sell model cars" hero, desktop navigation, full inventory filters and pagination, scale and brand panels, and expanded Model Hunt, seller and newsletter sections. The compact phone homepage and the other marketplace improvements remain in place. Homepage filtering retains URL persistence and empty-selection handling.

Follow-up validation: TypeScript, focused ESLint, production build/artifact validation, and all 262 existing automated tests passed. Browser screenshot and interaction checks remain outstanding.

## Implemented

- **Finding models:** prominent Shop, Community and Sell navigation; visible shopping search; seller dashboard and account access; shorter homepage with stock counts; consistent shopping results; URL-backed filters that retain empty selections; filter chips, clear/remove actions, useful loading/error/empty states; Models/Collectors/Posts tabs; release-specific offer comparison; prefilled Model Hunt with conditional email promises.
- **Buying confidently:** condition, included packaging, seller, dispatch and protection beside purchase controls; retained ZIP shipping estimator; adaptive actual-item photo requirements and photo labels; missing-evidence flags on older listings; compact new-seller history; required public introductions, specialties and packing information without residential street addresses.
- **Checkout:** products and seller groups before the address form; delivery, shipping and payment sequence; automatic rates after a valid address, retry and specific blockers; retained address and shipping choices; single-seller simplification; multi-seller delivery/return explanation. Stripe shows applicable tax and the final payable total before charging; a before-tax amount is labelled accordingly.
- **Seller setup and daily work:** four persisted setup tasks; independent application/listing statuses; direct uploads; Orders, Inventory and Payments as primary tasks; ship-by guidance; existing labels/tracking and payout state; spreadsheet template, preview, correction, stable-SKU updates and batch stock/price changes. A bank connection cannot approve an applicant store.
- **Fees, support and community:** configured 8.5% collector, 7% professional and eligible 5% founding rates; shared-rule proceeds calculator with editable processing assumptions; payout timeline; listing-process preview; real support-email path; dismissible/reopenable help; honest empty community states; existing public collector content retained.
- **Protection and measurement:** immutable per-order policy snapshots, exact order deadlines and unchanged active three-day window; separate longer-window proposal; optional consent-based task events, staff/test exclusions, server purchase deduplication, 90-day retention and private administrator aggregates.

## Existing features retained and checked

Automated checks exercise the existing guest cart, address carry-through, one-payment multi-seller checkout allocation, stock reservations, webhook idempotency, seller-scoped refunds and proceeds, shipping-rate rules, catalog matching, image upload/reordering rules, authentication, collector/community permissions, Model Hunts, preorders and tax records. Payment and carrier integration boundaries in these tests use controlled responses; they are not evidence of a real browser payment or a live carrier purchase.

The seller dashboard existed already. This work changes its task organization and setup guidance while keeping inventory, demand, promotions, shipping and order capabilities. CSV import existed already; the improvements add clearer preview/correction, repeat-upload behavior and batch updates. The ZIP estimator, guest checkout, privacy controls, collector collections and community publishing also existed.

## Validation record

- TypeScript: passed.
- ESLint: passed with 0 errors and 9 existing image/navigation/unused-variable warnings.
- Production Worker build and artifact validation: passed on the final application source.
- Database: generated and inspected `0035_marketplace_usability.sql`, snapshot and journal. Adds public profile fields, legacy-default order/reservation policy versions, and the optional event table/index. No existing transaction deadline or private address is rewritten.
- Focused checks cover empty-scale URL persistence, optional hunt fields, sealed/unboxed photo evidence, saved setup, all three fee rates, unknown policy handling, exact order/reservation snapshots, delivery replay behavior, CSV casing and reservation limits, staff/consent exclusion and deduplicated purchases.

Final regression result: **262 tests passed, 0 failed, 0 skipped**. This includes guest/multiple-seller checkout calculations, the saved reservation/order policy versions, repeated delivery events preserving deadlines, late transit updates retaining delivered status, repeated CSV uploads, reservation-safe stock updates, and measurement consent/purchase deduplication. Test integrations use controlled responses. Source whitespace validation also passed with the repository's Windows line-ending conventions.

## Browser checks and screenshots — outstanding

The supplied browser runtime returned no available browser. No desktop/mobile screenshots were captured, and no generated illustration was substituted for a real dashboard screenshot. The development preview attempt also found the existing local preview port occupied; the existing process was left running.

Run this capture and acceptance set with a connected browser and prepared test accounts:

| Screen or flow | Desktop and phone checks | Screenshot |
| --- | --- | --- |
| Home and signed-out header | Shop, Community, Sell, search, cart, sign-in; no horizontal overflow | Pending |
| Shop, empty 1:64 filter | Selected value, URL, chip and count agree; refresh and Back; clear one/all | Pending |
| Search and Model Hunt | Same results from all three entry points; preserved request criteria and honest confirmation | Pending |
| Listing and offers | Actual photos, seller, model/box condition, shipping, dispatch and protection visible | Pending |
| Guest checkout, one and multiple sellers | Address retained into Stripe test checkout; shipping, tax and total correct; no account required | Pending |
| Seller setup | Partial setup survives leaving/sign-in; statuses and next screens match saved data | Pending |
| Spreadsheet and stock | Correct an invalid row, repeat an SKU without duplicates, update quantity | Pending |
| Orders and Payments | Find deadline, add test tracking, understand holds versus bank arrival | Pending |
| Contextual help and community | Dismiss/reopen help after reload; public content/empty state; keyboard and touch access | Pending |

Use screenshots of the actual approved-seller dashboard on `/sell` once reviewed and scrubbed of customer/address/payment data. The public listing-process preview is implemented; **the requested real dashboard screenshot section is not complete**.

## Decisions and owner work

1. Decide the longer protection window and scope using [the proposal](protection-window-proposal.md). Three days remains active; this decision did not block other improvements.
2. Confirm founding-store enrollment criteria and each eligible store's start/end dates. Applying alone does not activate 5%; the later rate remains 7%. Public wording avoids inventing unconfirmed dates or eligibility.
3. Confirm support staffing and availability for short setup sessions. The email contact path is live code; sessions, review-time commitments, launch promotion and short videos are not claimed as delivered.
4. Recruit five real owners and run [the study protocol](store-owner-study.md), recording time, success, assistance and repeated confusion. Fix observed problems and retest.
5. Supply real sale inventory with appropriate photos and public store details. Invite real collectors, publish the owner's collection and answer genuine discussions using the existing publishing tools. No fake reviews, sales or engagement were added for launch.
6. External Shopify/eBay or other stock synchronization is separate integration work. CSV is a manual upload, and sellers must update stock when selling elsewhere.
7. Review [measurement definitions and limits](task-measurement.md). These are aggregate, opted-in task signals; device-based onboarding observations and confirmation-return purchase samples are not authoritative lifetime cohorts or total sales figures.

## Release notes

Published with the owner's explicit approval on September 18, 2026 (September 19 UTC), as saved Sites version 57. Deployment status is **succeeded**. The published URL is https://model-car-center.kman14.chatgpt.site and the existing custom domain remains https://modelcarcenter.com. The public audience and three-day protection policy were preserved.

Post-publication HTTP checks returned 200 for the custom-domain homepage, Help, Sell and the catalog API. The empty 1:64 API query returned valid catalog data with zero matching listings. These are service checks, not browser, screenshot or payment-UI acceptance. Those outstanding checks and the five-owner study remain listed above.

The saved release includes the generated migration. Do not roll back by dropping the new order-policy columns or rewriting sold-under terms. Existing listings missing photo evidence are flagged for seller completion; they are not given invented evidence or silently removed.
