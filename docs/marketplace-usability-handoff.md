# Marketplace usability handoff

September 18, 2026. This change extends the current site and preserves its existing branding, photographs, accounts, listings, guest checkout, collector tools and URLs. It includes existing working-tree improvements; those changes were retained rather than reset. **This is a code and automated-check handoff, not completion of the live usability study or browser acceptance checks.**

## CSV import follow-up - September 22, 2026

- Import now follows three numbered steps: prepare the spreadsheet, choose a CSV, and review/save. Selecting a file checks it automatically and displays its filename. The template instructions explicitly say to replace the example, and previews flag the unchanged sample model.
- Dedicated preview styles separate model/SKU, price, stock and create/update results. Phone previews become labeled cards. Separate counts show new drafts, existing listings to update and rows to fix. Update guidance explains replacement quantities, blank optional fields, retained photos and restocking behavior.
- A collapsed column guide lists required fields and accepted condition values. Raw CSV editing is optional; edits invalidate the preview. Invalid replacement files clear old previews, corrected files can reuse the same filename, and concurrent submissions are blocked. Errors identify rows and prevent saving until all rows are valid.

Validation: 33 focused import, business-logic and seller-dashboard tests passed, along with TypeScript, focused ESLint, production build and artifact validation. The local Seller Hub's initial flow was checked in Chrome. Desktop preview, 390px cards, 360px errors, expanded field guidance and success layouts were checked using static fixtures rendered from the real component and production CSS, with no horizontal overflow. Browser file selection was blocked by the extension's file-access setting; upload/preview/save transitions were verified by controlled component tests. No inventory was saved during browser checks. Viewport restored; changes have not been deployed.

## Seller dashboard follow-up - September 22, 2026

- Storefront-link correction: View storefront now follows the public route's active-store/current-terms eligibility. Apex Miniatures (Demo) had no current terms acceptance, so the unconditional link reached the intentional public 404. The menu now explains Storefront not live and links to Seller Terms; other blocked states link to the relevant setup/support action. Public eligibility is unchanged. Verified the live menu-to-terms route, 31 targeted checks, TypeScript and focused ESLint; no terms were accepted and no account records changed.
- Mobile navigation is a 72px identity header and drawer. Overview starts with overdue/unshipped orders, followed by compact linked metrics and tasks; completed setup steps stay collapsed. Growth replaces overlapping Demand, Opportunities and Marketing navigation, and available tools open by default. Analytics uses one consistent label.
- Orders present purchased model snapshots, photos, SKU, quantity, deadline and status before expandable shipping and financial forms. Money stays on one line. Three local Apex demo orders have no order-item records: the UI identifies missing packing details and provides a support action instead of reconstructing purchases from current inventory. Shipment creation waits for valid item records.
- Payments presents one account status and required action, including the connected-Stripe/outstanding-terms case. Held and released amounts retain existing settlement rules. Legacy direct-payout orders explain why they are excluded from MCC release totals, show known order proceeds separately, and retain their historical processing-fee payer. Eligibility dates and bank-arrival limitations are explicit.
- Inventory becomes thumbnail cards on phones, with price, stock, status and Edit visible. Needs attention includes missing required photo evidence once per listing. Bulk stock/price updates and CSV import are in the main toolbar; CSV preview, stable SKUs and reservation safeguards remain intact.
- The listing editor fills the viewport with one scroll area, four section links and fixed Save/Cancel controls. Shared-catalog reuse remains first, manual release details are optional, and publishing requirements form a concise checklist. Photo handling, separate model/packaging condition and preorder controls are preserved.
- Analytics offers 30/90/180-day ranges and equal-length previous-period comparisons, a revenue chart with accessible values, and product performance links. Units come from saved order items; incomplete history is called out instead of reported as zero. Test orders and other currencies are excluded. The temporary profit calculator and unavailable turnover panel were removed from this report.
- Settings separates storefront, shipping/returns, payments/fees and terms, with publication blockers first and URL-backed section selection. Logo upload supports preview, replace/remove and metadata stripping, with store ownership enforced when saving; country names replace codes. Help provides direct links to Orders, Payments, listing creation, stock updates, CSV and shipping settings.
- Buyer messages remains inside Seller Hub, opening existing listing enquiries first. A mobile selector exposes messages, requests, offers and shipping requests without horizontal clipping. Incoming listing enquiries are seller-scoped; shipping requests link to Orders. Message dates use UTC consistently across server and browser; supporting dates are 12px, message text is 14px, and the full model title can wrap.

Local Chrome checks covered 360x740, 390x844 and 1280x900. At 360px, Overview starts around 90px and the first overdue order around 249px. Inventory and bulk stock rows fit their 313px content width. The editor has one scrolling area and persistent Save/Cancel controls; the $117.07 order amount stays on one line. Checked menu focus/closing, order disclosures, inventory tools, catalog/manual editor and cancellation, payment-to-terms routing, settings selection/refresh, analytics ranges, Growth/Help links and seller inbox/shipping separation. No live inventory, settings, shipping purchases, terms acceptance, uploads or messages were submitted.

The demo order gap remains a data-repair concern: normal order-item snapshots and seller isolation pass database checks, and missing history is not fabricated or silently backfilled. Current catalog items cannot establish what those historical orders contained.

Validation: 84 targeted seller, catalog, messaging, preorder and usability checks passed. After the inbox time-zone fix, all 17 seller-dashboard/messaging checks passed, including a new cross-time-zone rendering regression. TypeScript and focused ESLint passed; the existing collector-inbox image warning remains. The final production build and artifact validation passed, with the existing duplicate discovery CSS and experimental-loader warnings. A fresh inbox load shows stable dates without new browser errors. The review tab was closed and viewport restored. Changes have not been deployed.

## Sell page follow-up - September 22, 2026

- The introduction leads directly to “Sell from my collection” and “Apply as a store.” These two compact cards compare the configured collector/store rates, with requirements expandable for each route. Seller Dashboard remains a quieter link. At 360×640, the actions start around 338px and 520px; both finish above the bottom navigation.
- The store action opens and focuses an application directly below the choices. Existing `#professional-application` links open it after reload, and collapsing/reopening preserves unsent fields. Store-specific content stays collapsed until requested.
- The founding offer leads with “Eligible stores: 5% for six months, then 7%, plus processing,” using the configured rates and duration. Expanded guidance explains that Model Car Center must confirm eligibility and dates separately from store approval; applying does not activate the offer. No unconfirmed enrollment criteria or review deadlines are promised.
- “Preview the seller tools” reaches a visual walkthrough of the store workspace. Four keyboard-accessible tabs show Inventory, Buyer interest, Orders and Payments. Each pairs a seller benefit with a dashboard example: bulk stock updates and CSV imports, wishlist interest and Model Hunt matches, dispatch deadlines and tracking, or held and released proceeds.
- The calculator starts with seller type, price and shipping, followed immediately by the estimate on phones. Tax/processing assumptions and the full calculation are expandable. Deduction values remain on one line, and changes still use the existing proceeds rules.
- Application labels are 15px, consent text is 14px, optional fields are identified in labels, and examples are associated with inputs as help text. Review expectations sit above the fields; detailed fee disclosures are collapsed, with the essential fee visible beside the application.

The walkthrough uses clearly marked sample data and existing product imagery. Low-stock filtering and an expandable spreadsheet example work locally. The preview retains the existing `#listing-preview` anchor, identifies its store scope, links collectors to My Garage, and provides a seller-support link. Capability descriptions follow the existing Seller Hub: external stock changes require manual updates, carrier label tools depend on availability, and release to Stripe is distinct from bank arrival.

The embedded listing-form demo and its unused adapter, form hooks and dedicated tests were removed. The real listing editor retains its existing behavior and the corrected photo guidance for factory-sealed models. No listing, account, shipping or payment action is connected to the walkthrough.

Local Chrome checks covered 360×640, 390×844 and 1280×900 without horizontal overflow. Checked the preview anchor, all four views, arrow-key navigation, active-panel visibility, 48px mobile tabs, low-stock filtering and the spreadsheet example. Earlier page checks covered application anchors/reload, keyboard collapse, unsent-field preservation, all three calculator rates, custom assumptions and invalid-input recovery. No application, listing or account data changed. Viewport overrides were cleared after review.

Validation: 21 targeted seller-hub, demand, processing and usability tests passed. TypeScript, focused ESLint, production build and artifact validation passed. Existing duplicate discovery CSS and experimental-loader build warnings remain. These changes have not been deployed.

## Mobile notifications follow-up - September 22, 2026

- The page title is 34px bold on phones and 42px on desktop; populated category headings are 18px semibold. Preferences is a bordered settings control with a 44px target and opens the Messages & notifications section of profile settings. Mark all read has its own spacing and underlined treatment.
- An empty inbox shows one “You’re all caught up” panel explaining that order updates, replies and new followers appear here. Empty categories are omitted from populated inboxes. Mark all read appears only when unread notifications exist; its count includes updates older than the latest 100 displayed items and excludes blocked actors.
- Marketplace orders & updates is an underlined, 44px link below a spaced divider. The notifications header uses a compact 44px search icon that opens the marketplace search field; other pages retain their existing search presentation.

Local Chrome checks covered the empty inbox at 360×640, 390×844 and 1280×900, with no horizontal overflow. Verified the dominant title, single empty panel, absent mark-read action, touch targets, Preferences anchor, search destination and orders link. No account preferences or real notification read states were changed. Controlled database fixtures checked older unread counts, both block directions, account isolation, and preserving already-read timestamps during Mark all read.

Validation: 19 targeted tests, TypeScript, focused ESLint, production build and artifact validation passed. The browser reported no errors, and the viewport was restored after testing. Notification changes have not been deployed.

## Mobile account follow-up - September 22, 2026

- My Garage uses a compact identity header and labeled section selector on phones; desktop keeps a lighter sidebar with the current section marked. Account sections use normal URL-backed navigation, including Back, refresh and direct links. The phone header keeps search accessible through its icon.
- The overview leads with the latest purchased model, seller, payment/delivery status, total and estimated delivery when supplied, followed by two recent saved listings. The server scopes saved previews to the signed-in account and publicly viewable listings; unavailable saves retain a route to the full wishlist.
- Wishlist, Orders, Active hunts, Active listings and Sales are equal compact cells, each linking to its section. Selling is a secondary overview link and remains available in My Listings; the duplicate selling button in the empty listings section is removed. Empty accounts have a primary Browse models action.
- My Orders puts complete-image thumbnails, model specifications and quantities before seller/status details. Track package and Get help with this order appear before protection copy. Known carriers support older manually entered tracking numbers; unfamiliar carriers retain their number and help route without a fabricated tracking destination. Confirmed delivery remains authoritative if a later carrier payload repeats an older scan.
- The exact stored/calculated MCC reporting deadline remains visible, with a short distinction between non-delivery and the three-calendar-day window after confirmed delivery. The longer protection/return explanation and shipment history are expandable. Policy windows, preorder payments/history, feedback eligibility and support authorization are unchanged.

Local Chrome checks used the actual dashboard, shared header and styles with isolated fictional account data at 360×640, 390×844 and 1280×900. At 360px, the latest-order card starts around 314px and View order ends around 566px, above navigation starting at 574px. All five totals measure 99×80px. Checked count links, section selection, Back, refresh, direct order anchoring, saved/unavailable models, empty state, tracking destinations and expandable shipment/policy details. No horizontal overflow or browser errors were found. The fixture/tab was removed and viewport restored; no real orders, accounts or external carrier requests were changed/submitted.

Validation: 22 focused account/protection checks passed; the six account checks passed again after adding the stale-carrier regression case. TypeScript and focused ESLint passed without errors. Production build and artifact validation passed with the existing duplicate discovery CSS and experimental-loader warnings. These changes have not been deployed.

## Mobile profile editor follow-up - September 22, 2026

- The editor has a 28–40px page heading, section links, and distinct Profile details, Privacy, and Messages & notifications groups. Handle guidance includes the allowed format and resulting profile address; Bio has a live 500-character counter, and interests explicitly use commas.
- Avatar and cover photo each have a single-image selector, preview, replace/remove controls, and crop guidance. Inputs accept one JPG, PNG or WebP up to 10 MB. Images are re-encoded before upload, location metadata is removed, and failed replacements preserve the current image. Removing or replacing a photo stays a draft until Save profile.
- Privacy guidance explains that a private profile hides its public pieces, publishing reveals pieces already marked public, and the new-piece default leaves existing pieces unchanged. First publication still needs a separate confirmation. Short, 16px messaging choices explain who can start a conversation and whether it goes to the inbox or requests. Notification examples distinguish social activity from future discovery alerts and email subscriptions.
- Preview public profile opens a private modal using current edits and an explicit projection of public collection pieces. Private pieces, purchase costs and private notes are excluded. Previewing does not save or publish; closing restores focus and page scrolling.
- Save profile fills the mobile form width. Unsaved edits show a 70px save bar directly above the existing 66px navigation. Saving waits for uploads, prevents duplicate submissions, preserves failed edits, and confirms success in place; contextual return links lead back to a piece or comment draft. Discard restores saved values. Profile details, preferences and image references now save in one transaction, preventing partial photo updates after a rejected handle.

Local Chrome checks used the actual editor, shared header and styles with an isolated fictional profile and local-only save responses at 360×640, 390×844 and 1280×900. Checked full message labels, field guidance, single-image inputs, draft removal, publication validation, private preview, Escape/focus restoration, success confirmation and navigation/save-bar separation. No horizontal overflow or browser errors remained. The temporary fixture/tab was removed and viewport restored; account authentication and real uploads were not exercised through the browser.

Validation: 46 targeted tests passed, including upload conversion/failures, privacy projection, publication consent, atomic saves, retry behavior and profile/comment return paths. The 12 profile/collection checks passed again after the final save-confirmation adjustment. TypeScript and focused ESLint passed with image-optimization warnings. Production build and artifact validation passed with the existing duplicate discovery CSS and experimental-loader warnings. These changes have not been deployed.

## Mobile collection piece follow-up - September 22, 2026

- Availability labels now come from shared server-safe code, fixing the empty badge caused by reading a client-module export from the server page. All five supported states have text; an unknown legacy value says “Availability not specified.” Historical pieces say “Previously owned by.”
- Wishlist is a full-width button with account-backed saved/removal state and retryable errors. Its explanation identifies “Models I’m looking for.” One secondary “View model details & offers” link replaces the two release links. Messaging remains an underlined link with a 48px tap area and preserves the owner/piece context. Owner editing and commerce restrictions remain intact.
- “Collection shelves” identifies the grouping. Each name links to the owner’s matching shelf, with the shelf selected and the collection navigation targeted; unrelated/private shelf memberships are not added to the page.
- Collection photos reuse the inspection viewer, with a visible Enlarge photo action, full-image fitting, zoom, panning, photo navigation and Escape/Close. Collection images omit seller-specific view labels. Zoom no longer steals focus from its control; closing restores focus and page scrolling.
- Comment requirements explain the display name, handle and public profile in plain language. Sign-in continues through profile setup when needed; an already public profile returns directly to the comment draft. Publication still requires an explicit choice and confirmation. Drafts remain scoped to the piece/account, survive sign-in and expire after seven days.

Local Chrome checks covered 360×640, 390×844 and 1280×900 with no horizontal overflow or browser errors. Alex’s piece shows “Not for sale.” Wishlist, offers and messaging targets measure 48px tall. Checked the full-screen viewer above the bottom navigation, zoom/reset, keyboard focus and Escape, selected-shelf navigation, wishlist sign-in return, the combined model/offer destination, and comment draft recovery after sign-in navigation and a full reload. The temporary draft was cleared and the viewport restored. Account mutations and post-sign-in profile routing were verified with controlled fixtures; no live comments, messages or profile changes were submitted.

Validation: 41 targeted tests passed, including server-rendered availability, missing model/photo data, contextual links, wishlist failures and duplicate taps, profile return paths, draft recovery and viewer focus. TypeScript passed; focused ESLint reported no errors, with eight existing image/navigation warnings. Production build and artifact validation passed with the existing duplicate discovery CSS and experimental-loader warnings.

## Mobile community feed follow-up - September 22, 2026

- The phone header omits marketplace search on the community route, followed by a compact title and Create post action. Topic search and chips are collapsed behind Filters; an active topic remains visible beside Clear filter. Empty results name the selected topic and preserve the For you, Following or Saved context when clearing it.
- The weekly-theme block and its public-feed query were removed. Collector suggestions appear once after the first three posts on phone/tablet, or after the available posts in a shorter feed. Desktop retains collector discovery beside the feed.
- Feed, Collectors, Collections and Saved fit in one navigation row. More exposes My collection and Wishlist. The active destination is explicit, and legacy mobile selectors no longer hide Saved.
- The composer starts with a caption and photo control. Topic, post type and model/collection tags load when expanded and remain intact when collapsed. Commercial disclosure and public visibility stay beside Publish. Publishing waits for photo uploads and opens the newly created post after success.
- Shared post/discussion changes are preserved: equally sized actions link directly to the comment composer inside Discussion, and reporting remains inside comment options. Post dates use a fixed UTC timezone to prevent a server/browser hydration mismatch.

Validation: 21 targeted community tests passed, including filter recovery, optional tags, commercial disclosure, upload gating, public/private content permissions and consistent dates across time zones. TypeScript passed; focused ESLint reported zero errors with image/navigation warnings. Production build and artifact validation passed with the existing duplicate discovery CSS and experimental-loader warnings.

Local Chrome checks covered 360×640, 390×844 and 1280×900 with no horizontal overflow. The first post starts around 272px down the mobile page, with its photo on the opening screen. All four community destinations fit; More opens the remaining links and closes with Escape. Checked JDM empty results and Clear filter recovery, collector suggestions after the third post, 56px post-action targets, direct Comment navigation with the discussion field visible and focused, and comment reporting inside an expandable menu. The initial composer measures about 440px tall at 390px, with optional values retained across collapse/reopen. Desktop retains search and sidebar discovery. A fresh page load has no browser errors. The temporary draft was discarded and the viewport restored; publishing and upload behavior were tested with controlled fixtures, without posting live content.

## Mobile community post detail follow-up - September 22, 2026

- Comments use compact rows with 32px avatars or initials, relative timestamps with full date/time tooltips, and Reply controls. Reply adds the collector's @handle to the existing draft and focuses the composer; discussion remains chronological. Report is inside each comment's keyboard-accessible options menu. Post dates use an explicit locale and UTC so server/browser time zones cannot cause a hydration mismatch.
- The composer appears above existing comments. On the detail page, Comment focuses it without navigating. Feed Comment links open the same composer. Like, Comment, Save and the new visible Share action have matching 56px touch targets. Share uses native sharing when available, with clipboard confirmation and a selectable-link fallback.
- Signed-out visitors see account and public-profile requirements before writing, with a Sign in to comment action. Signed-in collectors without a public profile get a setup link that returns to the discussion. Drafts persist in this browser for seven days, survive sign-in and profile setup, and clear after successful posting or Clear draft. Failed posts retain the text; restoring a draft never posts it. New-account magic links retain the composer anchor.
- Tagged models show a catalog thumbnail when available, a separate model name, and scale, manufacturer and color in both the strip and details panel. Item-only tags use public piece metadata; private piece metadata is withheld.

Local Chrome checks covered 360×640, 390×844 and 1280×900 with no horizontal overflow. On the Nissan fixture, the comment field starts around 1,020px down the phone page, before the replies. Checked Comment/Reply focus, addressed drafts, sign-in destination, draft recovery after navigation and reload, report-menu open/cancel/Escape, and the model details panel. The temporary draft was cleared and viewport overrides restored. Authenticated writes, expired sessions, storage failures, moderation visibility and sharing fallbacks were exercised with controlled fixtures; no real comments or reports were submitted.

Validation: 32 targeted tests passed; TypeScript passed; focused ESLint reported no errors and eight image/navigation warnings. Production build and artifact validation passed. These changes have not been deployed.

## Mobile cart follow-up - September 21, 2026

- A persistent mobile bar shows the selected total before tax and the next action. It replaces the bottom navigation while the cart has items. Missing carrier quotes show an item subtotal plus pending shipping instead of a misleading total; tax-inclusive configurations retain their explicit label.
- One compact three-column navigation links Delivery, Shipping and Order summary. Payment remains on the next screen. The seller-selection explanation appears immediately above the checkboxes, and unchecked items stay in the cart.
- Fixed seller rates are labeled per order before an address is entered. Carrier quotes remain bound to complete delivery details and their expiry. Expanded shipping shows dispatch timing and carrier/service/transit information when available, without inventing a delivery estimate for fixed rates.
- Guest and signed-in carts include condition, packaging and original-box details with readable secondary text. Legacy missing details are explicitly unspecified. Re-adding a listing refreshes its cart details.
- “Enter delivery details” and the summary's address guidance focus the first incomplete field and show a specific error. Other blockers link to seller selection, shipping or the agreement checkbox. Autocomplete remains optional, with its data-sharing explanation before activation; required consent and the existing three-day platform deadline remain explicit.

Local Chrome checks covered 360×640, 390×844 and 1280×900, with no horizontal overflow. At 360px all three navigation steps share one row, and the 86px bottom bar replaces the main navigation. Two fixture offers total $427.50 plus $14.90 fixed shipping, or $442.40 before tax. Checked seller selection, no-seller recovery, single-seller behavior, missing-name/street/ZIP focus and errors, order review, agreement focus without acceptance, shipping details and reload persistence. Temporary cart items and delivery values were cleared and the viewport restored. No live payment or carrier purchase was submitted.

Validation: 40 targeted tests passed; TypeScript and focused ESLint passed; production build and artifact validation passed. Existing duplicate discovery CSS and experimental-loader build warnings remain.

## Mobile seller storefront follow-up - September 21, 2026

- The introduction now shows the seller name, short bio, shipping origin, “Shop this seller” and “Message seller.” Tenure and verified-purchase feedback appear in a compact summary. Full profile and marketplace-history details are expandable, with one explanation separating approval from item guarantees and buyer reputation. Empty optional values and exact field-name placeholders such as `specialty` and `packing_approach` are omitted; real descriptions are preserved.
- Shared shipping facts appear above the inventory: the Apex fixture shows “$6.95 per order · dispatch within 1 business day.” Expanded shipping and returns retain the seller's policy and distinguish seller contact requirements from MCC's existing platform deadlines.
- Store-specific search, available scale choices, newest/price sorting, counts, empty states and pagination preserve their state in the URL. The seller is fixed by the storefront route. The former 48-listing truncation is replaced by 24-item pages; equal prices/dates have stable page boundaries.
- Storefront cards omit repeated seller identity and generic shipping text. They retain complete-image fitting, 13px specifications, prominent prices, save/cart actions and a quieter comparison link below the cart action.
- Seller contact uses the approved store's owner and works without an active listing. Sign-in preserves the selected store; the composer supports a general store enquiry. Existing contact preferences, blocks, request acceptance and self-message restrictions remain enforced.

Local Chrome checks covered 360×640, 390×844 and 1280×900. The Apex inventory heading now starts around 410px down the phone page; the first product photos start around 720px after the visible search/filter controls. Checked the jump link, search, both price directions, scale filtering, refresh/Back, empty results, expanded policies, omitted placeholders, sign-in destination, complete-image fitting and horizontal overflow. The browser viewport was restored. Message delivery and no-listing/contact-permission cases were exercised with controlled fixtures, without sending real messages.

Validation: 41 targeted tests passed; TypeScript passed; focused ESLint reported no errors and one existing unused-variable warning; production build and artifact validation passed. Existing duplicate discovery CSS and experimental-loader warnings remain.

## Mobile wishlist follow-up - September 21, 2026

- “Your wishlist” now includes an item count and a compact device/account sync line. Populated wishlists retain an “Add more models” link. The empty state has “No saved models yet,” one browsing button and a collapsed “Add a wanted model” action.
- “Saved listings” explains that these are specific sellers' offers. Full-width mobile rows place an uncropped photo beside the name, 13px specifications and price, with seller/shipping information and accessible cart/removal controls below. Cart actions respect stock and quantity limits. Removed or unavailable listings remain removable, and batch loading supports more than 100 saved IDs.
- “Models I'm looking for” explains release-level intent separately. Its inline search uses the existing model search and account wishlist APIs, including releases without current offers. Guests can search and sign in with their query preserved. Account additions/removals update the list after a successful response and expose retryable errors. Tagged-model actions use the same wanted-model terminology.

Local Chrome checks covered 360×640, 390×844 and 1280×900. At 360px, the Nissan saved row measured about 210px tall, with the cart and removal controls above the bottom navigation. Two saved offers and their actions fit on the 390px screen. Checked empty/populated states, item counts, refresh persistence, browsing, release search, sign-in return paths, cart limits, removal and horizontal overflow. Temporary saved/cart items were cleared and the viewport restored. Signed-in wanted-model mutations were checked with controlled component/API fixtures, not a live account.

Validation: 30 targeted tests passed; TypeScript passed; focused ESLint reported no errors and six existing warnings in community code/tests; production build and artifact validation passed. Existing duplicate CSS asset and experimental-loader warnings remain.

## Mobile product listing follow-up - September 21, 2026

- The purchase summary now puts price, shipping and a short condition summary directly below the title. The main cart action fills the row beside a small listing-save control. Once it scrolls above the viewport, a mobile price/cart bar replaces the bottom navigation and retains a Shop link. Both cart controls share stock limits and saved cart state.
- The gallery has one enlargement control and explicitly fits complete images. Short specifications use a compact list; condition disclosures, photo coverage and shipping have full-width space. Missing disclosures are explicitly unknown, and unspecified optional details are grouped.
- Same-release alternatives appear as “Other offers for this model,” with seller, condition, packaging, price and shipping differences. “Similar models” excludes the current release and selects one active listing per other release, using normalized catalog scales for older listings.
- The listing shows two compact collector posts after buying alternatives. “View all collector discussion” opens the model's full discussion, with chronological pagination that preserves posts sharing a timestamp. The duplicate catalog-wishlist action was removed from this section; the purchase control saves this seller's listing.
- Returns explain the required MCC request within three calendar days after carrier-confirmed delivery, alongside the seller's separately labeled policy and contact requirements. A longer seller contact window does not extend the platform deadline. Existing policy and order deadlines are unchanged.

Local Chrome checks covered 360×640, 390×844 and 1280×900. On the Nissan beta fixture, the main cart button ends at approximately 563px on the 640px-tall phone, above the navigation starting at 574px. At 390px, other offers begin around 1,052px down the page. The comparison link opens four offers, and the discussion link reaches all 12 tagged posts. Checked photo enlargement, save persistence, sticky navigation replacement, adding a single-stock listing, the resulting View cart action, return disclosures and horizontal overflow. Temporary cart/save changes were cleared.

Validation: 37 targeted tests passed; TypeScript passed; focused ESLint reported no errors and one existing unused-variable warning in the community tests; production build and artifact validation passed. These are local fixture checks, not a live purchase or deployment.

## Desktop homepage follow-up

At the owner's request, the homepage above 820px restores the previous large "Buy and sell model cars" hero, full inventory filters and pagination, scale and brand panels, and expanded Model Hunt, seller and newsletter sections. The shared header is used throughout the site, including the desktop homepage. The compact phone homepage and the other marketplace improvements remain in place. Homepage filtering retains URL persistence and empty-selection handling.

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

## Browser checks and screenshots - outstanding

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
