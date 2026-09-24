# Model Car Center page review checklist

Inventory date: September 20, 2026. Covers **all 43 page routes** in the current source, additional dashboard views and forms, the 404 screen, and the local beta review hub. Each dynamic route represents a shared page template; individual listings, profiles, posts, and collection pieces reuse those templates.

**Live** links use [modelcarcenter.com](https://modelcarcenter.com/). **Local** links use [127.0.0.1:5173](http://127.0.0.1:5173/); change that origin if your development server prints a different address. The live origin comes from the [release handoff](marketplace-usability-handoff.md#release-notes). This is a source-based review inventory: live availability and browser behavior have not been verified for this checklist, and unpublished changes may appear only locally.

Review each item on desktop and phone. Check a box after reviewing it; record problems in the notes table at the end. **Account** means a signed-in collector, **Store** means an approved professional seller account, and **Admin** means an authorized founder account. Public pages should also be checked while signed out.

For populated local examples, use the [beta setup instructions](beta-seed.md) and [beta review hub](http://127.0.0.1:5173/beta-review). Alex has collector activity, Maya owns Apex Miniatures, and Jamie has a newer collection. Example links below require that local seed; they are not live inventory. The beta server disables payments, shipping purchases, and email delivery, so those flows need a separately configured test environment.

## Shopping and discovery - 9 routes

- [ ] **Home** - `/` - [Live](https://modelcarcenter.com/) · [Local](http://127.0.0.1:5173/). Review desktop and phone layouts, search, filters, featured sections, and navigation.
- [ ] **Shop / marketplace** - `/marketplace` - [Live](https://modelcarcenter.com/marketplace) · [Local](http://127.0.0.1:5173/marketplace). Review filters, sorting, pagination, result counts, and empty results.
- [ ] **Search** - `/search` - [Live](https://modelcarcenter.com/search) · [Local](http://127.0.0.1:5173/search). Shopping searches redirect to Shop; collector and post searches have their own views below.
- [ ] **Product listing** - `/products/[slug]` - [Local example](http://127.0.0.1:5173/products/beta-nissan-fairlady-z-s30-0). On live, open a listing from [Shop](https://modelcarcenter.com/marketplace). Review photos, condition, seller, stock, shipping, protection, and purchase actions; also review sold-out and preorder listings when available.
- [ ] **Catalog model / compare seller offers** - `/models/[id]` - [Local example](http://127.0.0.1:5173/models/beta-v1-catalog-0). On live, follow a model or compare-offers link from [Shop](https://modelcarcenter.com/marketplace). Review model identity, offer comparison, and the no-available-offers state.
- [ ] **Seller storefront** - `/sellers/[slug]` - [Local example: Apex Miniatures](http://127.0.0.1:5173/sellers/beta-apex-miniatures). On live, follow the seller link from any [listing](https://modelcarcenter.com/marketplace). Review public store details, policies, and inventory.
- [ ] **Saved items / wishlist** - `/wishlist` - [Live](https://modelcarcenter.com/wishlist) · [Local](http://127.0.0.1:5173/wishlist). Review saved listings and catalog models, empty state, and guest/account behavior.
- [ ] **Cart** - `/cart` - [Live](https://modelcarcenter.com/cart) · [Local](http://127.0.0.1:5173/cart). Review empty, one-seller, and multiple-seller carts; quantities, delivery address, shipping, and totals.
- [ ] **Order confirmation** - `/checkout/success` - [Live base screen](https://modelcarcenter.com/checkout/success) · [Local base screen](http://127.0.0.1:5173/checkout/success). A populated confirmation requires the `session_id` returned by checkout; the bare link only reviews the missing-session state.

## Community and collections - 8 routes

- [ ] **Community feed** - `/community` - [Live](https://modelcarcenter.com/community) · [Local](http://127.0.0.1:5173/community). Review feed cards, topics, composer, comments, and signed-out prompts.
- [ ] **Community post detail** - `/community/posts/[id]` - [Local example](http://127.0.0.1:5173/community/posts/beta-v1-post-0). On live, open a post from [Community](https://modelcarcenter.com/community). Review photos, linked models/pieces, replies, and post actions.
- [ ] **Collector showroom** - `/collectors/[handle]` - [Local example: Alex](http://127.0.0.1:5173/collectors/beta-alexs-garage). On live, open a profile from [Explore collectors](https://modelcarcenter.com/community?view=collectors). Review public identity, collection, follow/message actions, and profile tabs.
- [ ] **Collection piece detail** - `/collection/[id]` - [Local public example](http://127.0.0.1:5173/collection/beta-v1-piece-0-0). On live, open a piece from a [public collection](https://modelcarcenter.com/community?view=collections). Review photos, story, availability, comments, and owner-only details.
- [ ] **My Collection** - `/collection` - [Live](https://modelcarcenter.com/collection) · [Local](http://127.0.0.1:5173/collection). **Account.** Review shelves, filters, visibility, empty state, and adding/editing pieces.
- [ ] **My public profile / profile setup** - `/profile` - [Live](https://modelcarcenter.com/profile) · [Local](http://127.0.0.1:5173/profile). **Account.** Published profiles redirect to their showroom; new/unpublished profiles show the editor.
- [ ] **Inbox** - `/messages` - [Live](https://modelcarcenter.com/messages) · [Local](http://127.0.0.1:5173/messages). **Account.** Review collector messages, marketplace conversations, and combined-shipping requests.
- [ ] **Notifications** - `/notifications` - [Live](https://modelcarcenter.com/notifications) · [Local](http://127.0.0.1:5173/notifications). **Account.** Review groups, unread indicators, destinations, preferences, and mark-all-read.

## Accounts, selling, and order support - 9 routes

- [ ] **Sign in / account creation** - `/sign-in` - [Live](https://modelcarcenter.com/sign-in) · [Local](http://127.0.0.1:5173/sign-in). Review while signed out, including email validation, link-sent feedback, and return to the requested page.
- [ ] **My Garage** - `/account` - [Live](https://modelcarcenter.com/account) · [Local](http://127.0.0.1:5173/account). **Account.** Review overview and the seven account views listed below.
- [ ] **Buyer preorder shortcut** - `/preorders` - [Live](https://modelcarcenter.com/preorders) · [Local](http://127.0.0.1:5173/preorders). Redirects to `/account?view=orders`; review with a buyer account containing a preorder.
- [ ] **Start a Model Hunt** - `/model-hunt` - [Live](https://modelcarcenter.com/model-hunt) · [Local](http://127.0.0.1:5173/model-hunt). Review blank and search-prefilled forms, validation, and confirmation.
- [ ] **Sell / professional seller application** - `/sell` - [Live](https://modelcarcenter.com/sell) · [Local](http://127.0.0.1:5173/sell). Review seller options, fees, the seller-tools walkthrough (inventory, buyer interest, orders and payments), application, and help links.
- [ ] **Create or edit a collector listing** - `/sell/model` - [Live](https://modelcarcenter.com/sell/model) · [Local](http://127.0.0.1:5173/sell/model). **Account.** Review model identity, condition, photos, shipping, draft, and review feedback. Open an existing listing from My Garage to review editing.
- [ ] **Seller Dashboard / Seller Hub** - `/store` - [Live](https://modelcarcenter.com/store) · [Local](http://127.0.0.1:5173/store). **Store.** Review connected-store behavior and the “No store is connected” screen with an ordinary collector account.
- [ ] **Seller preorder shortcut** - `/store/preorders` - [Live](https://modelcarcenter.com/store/preorders) · [Local](http://127.0.0.1:5173/store/preorders). Redirects to `/store?view=inventory&filter=preorders`; **Store** access is required at the destination.
- [ ] **Order help & support requests** - `/resolution` - [Live](https://modelcarcenter.com/resolution) · [Local](http://127.0.0.1:5173/resolution). **Account.** Check the immediate Choose an order action, single-sentence empty state, missing-order/contact recovery, optional process guidance and conditional Purchases/Sales filters. Review eligible orders, opening a request, attachments, responses and status. Keep next actions and exact deadlines visible on phone request cards and before request details, including overdue returns. Open real test records to exercise `?order=...` and `?case=...`.

## Help, policies, and email preferences - 12 routes

- [ ] **Shopping and selling help** - `/help` - [Live](https://modelcarcenter.com/help) · [Local](http://127.0.0.1:5173/help).
- [ ] **Contact support** - `/contact` - [Live](https://modelcarcenter.com/contact) · [Local](http://127.0.0.1:5173/contact).
- [ ] **Buyer protection** - `/protection` - [Live](https://modelcarcenter.com/protection) · [Local](http://127.0.0.1:5173/protection).
- [ ] **Shipping policy** - `/shipping` - [Live](https://modelcarcenter.com/shipping) · [Local](http://127.0.0.1:5173/shipping).
- [ ] **Returns and refunds** - `/returns` - [Live](https://modelcarcenter.com/returns) · [Local](http://127.0.0.1:5173/returns).
- [ ] **Terms of service** - `/terms` - [Live](https://modelcarcenter.com/terms) · [Local](http://127.0.0.1:5173/terms).
- [ ] **Seller terms** - `/seller-terms` - [Live](https://modelcarcenter.com/seller-terms) · [Local](http://127.0.0.1:5173/seller-terms).
- [ ] **Promoted listing terms** - `/promotion-terms` - [Live](https://modelcarcenter.com/promotion-terms) · [Local](http://127.0.0.1:5173/promotion-terms).
- [ ] **Privacy policy** - `/privacy` - [Live](https://modelcarcenter.com/privacy) · [Local](http://127.0.0.1:5173/privacy).
- [ ] **Privacy and data deletion requests** - `/privacy/request` - [Live](https://modelcarcenter.com/privacy/request) · [Local](http://127.0.0.1:5173/privacy/request).
- [ ] **Cookie policy** - `/cookies` - [Live](https://modelcarcenter.com/cookies) · [Local](http://127.0.0.1:5173/cookies).
- [ ] **Email preferences / unsubscribe** - `/unsubscribe` - [Live](https://modelcarcenter.com/unsubscribe) · [Local](http://127.0.0.1:5173/unsubscribe). Review the base instructions, then use a test email's actual unsubscribe link for its confirmation form and completion state.

## Administration - 5 routes

- [ ] **Founder admin dashboard** - `/admin` - [Live](https://modelcarcenter.com/admin) · [Local](http://127.0.0.1:5173/admin). **Admin.** Review the ten internal sections below.
- [ ] **Community moderation** - `/admin/community` - [Live](https://modelcarcenter.com/admin/community) · [Local](http://127.0.0.1:5173/admin/community). **Admin.** Review moderation queues, reports, and available actions.
- [ ] **Preorder operations** - `/admin/preorders` - [Live](https://modelcarcenter.com/admin/preorders) · [Local](http://127.0.0.1:5173/admin/preorders). **Admin.** Review preorder status, refund issues, and recovery controls.
- [ ] **Promoted listings administration** - `/admin/promotions` - [Live](https://modelcarcenter.com/admin/promotions) · [Local](http://127.0.0.1:5173/admin/promotions). **Admin.** Review pricing, availability, promotions, and refund controls.
- [ ] **Admin access denied** - `/admin/access-denied` - [Live](https://modelcarcenter.com/admin/access-denied) · [Local](http://127.0.0.1:5173/admin/access-denied). Review the explanation, switch-account link, and return-home link.

## Additional views and forms

These share the routes above but expose distinct screens or tasks worth checking separately.

### Search and community

- [ ] **Collector search** - [Live](https://modelcarcenter.com/search?type=collectors) · [Local](http://127.0.0.1:5173/search?type=collectors).
- [ ] **Post search** - [Live](https://modelcarcenter.com/search?type=posts) · [Local](http://127.0.0.1:5173/search?type=posts).
- [ ] **For You feed** - [Live](https://modelcarcenter.com/community?tab=for_you) · [Local](http://127.0.0.1:5173/community?tab=for_you).
- [ ] **Following feed** - [Live](https://modelcarcenter.com/community?tab=following) · [Local](http://127.0.0.1:5173/community?tab=following). Use an account with followed collectors and one without.
- [ ] **Saved posts** - [Live](https://modelcarcenter.com/community?tab=saved) · [Local](http://127.0.0.1:5173/community?tab=saved). Use an account with saved posts.
- [ ] **Explore collectors** - [Live](https://modelcarcenter.com/community?view=collectors) · [Local](http://127.0.0.1:5173/community?view=collectors).
- [ ] **Browse collections** - [Live](https://modelcarcenter.com/community?view=collections) · [Local](http://127.0.0.1:5173/community?view=collections).
- [ ] **Create post** - open [Community live](https://modelcarcenter.com/community) or [locally](http://127.0.0.1:5173/community), then select **Create post**. Review text, photos, model/piece tags, and validation.
- [ ] **Professional seller application form** - [Live](https://modelcarcenter.com/sell#professional-application) · [Local](http://127.0.0.1:5173/sell#professional-application).

### Collector profile, collection, and inbox

The showroom links below use Alex's local example. On live, open a real collector's showroom and select the same tab.

- [ ] **Showroom: Collection** - [Local example](http://127.0.0.1:5173/collectors/beta-alexs-garage?tab=collection).
- [ ] **Showroom: Posts** - [Local example](http://127.0.0.1:5173/collectors/beta-alexs-garage?tab=posts).
- [ ] **Showroom: For Sale** - [Local example: Maya](http://127.0.0.1:5173/collectors/beta-apex-miniatures?tab=sale).
- [ ] **Showroom: About** - [Local example](http://127.0.0.1:5173/collectors/beta-alexs-garage?tab=about).
- [ ] **Showroom: View as visitor** - [Local example](http://127.0.0.1:5173/collectors/beta-alexs-garage?visitor=1). Sign in as Alex; check that private collection details stay hidden.
- [ ] **Public profile editor** - [Live](https://modelcarcenter.com/profile?edit=1) · [Local](http://127.0.0.1:5173/profile?edit=1). **Account.** Review publishing, visibility, contact, and notification preferences.
- [ ] **Add collection piece** - [Live](https://modelcarcenter.com/collection?add=1) · [Local](http://127.0.0.1:5173/collection?add=1). **Account.** Review catalog matching and an unmatched personal item.
- [ ] **Edit collection piece** - [Local example, sign in as Alex](http://127.0.0.1:5173/collection?edit=beta-v1-piece-0-0). On live, choose **Edit piece** on one of your own pieces.
- [ ] **Collection commerce states** - review local examples for [not for sale](http://127.0.0.1:5173/collection/beta-v1-piece-0-0), [open to offers](http://127.0.0.1:5173/collection/beta-v1-piece-1-0), [for sale](http://127.0.0.1:5173/collection/beta-v1-piece-1-5), and [previously owned](http://127.0.0.1:5173/collection/beta-v1-piece-0-6). Also check a reserved piece when that state is available.
- [ ] **Inbox: Messages** - [Live](https://modelcarcenter.com/messages?tab=messages) · [Local](http://127.0.0.1:5173/messages?tab=messages). Open a conversation to review the thread screen.
- [ ] **Inbox: Offers** - [Live](https://modelcarcenter.com/messages?tab=offers) · [Local](http://127.0.0.1:5173/messages?tab=offers).
- [ ] **Inbox: Requests** - [Live](https://modelcarcenter.com/messages?tab=requests) · [Local](http://127.0.0.1:5173/messages?tab=requests).

### My Garage - account required

- [ ] **Overview** - [Live](https://modelcarcenter.com/account?view=overview) · [Local](http://127.0.0.1:5173/account?view=overview).
- [ ] **Wishlist** - [Live](https://modelcarcenter.com/account?view=wishlist) · [Local](http://127.0.0.1:5173/account?view=wishlist).
- [ ] **Model Hunts** - [Live](https://modelcarcenter.com/account?view=hunts) · [Local](http://127.0.0.1:5173/account?view=hunts).
- [ ] **My Orders, including preorders** - [Live](https://modelcarcenter.com/account?view=orders) · [Local](http://127.0.0.1:5173/account?view=orders). Review order details, tracking, preorder balances, and support links with appropriate test records.
- [ ] **My Listings** - [Live](https://modelcarcenter.com/account?view=listings) · [Local](http://127.0.0.1:5173/account?view=listings). Review draft, submitted, approved, and rejected states where available.
- [ ] **My Sales** - [Live](https://modelcarcenter.com/account?view=sales) · [Local](http://127.0.0.1:5173/account?view=sales). Use a collector seller with orders; review fulfillment and payout information.
- [ ] **Account Profile** - [Live](https://modelcarcenter.com/account?view=profile) · [Local](http://127.0.0.1:5173/account?view=profile). Review account settings and the delete-account confirmation flow with a disposable test account.
- [ ] **New-account welcome** - [Live](https://modelcarcenter.com/account?new=1) · [Local](http://127.0.0.1:5173/account?new=1). Use an account that has not completed onboarding.

### Seller Dashboard - approved store required

Use Maya's account for local beta inventory. Empty sales, payout, and order screens still need review; the beta fixture does not supply completed purchases.

- [ ] **Overview and setup** - [Live](https://modelcarcenter.com/store?view=overview) · [Local](http://127.0.0.1:5173/store?view=overview). Check saved setup progress and next-step links.
- [ ] **Orders** - [Live](https://modelcarcenter.com/store?view=orders) · [Local](http://127.0.0.1:5173/store?view=orders). Check Orders to ship, Shipped, Returns, All orders, and Preorders. Open an order to review fulfillment, tracking, and labels.
- [ ] **Inventory** - [Live](https://modelcarcenter.com/store?view=inventory) · [Local](http://127.0.0.1:5173/store?view=inventory). Check All inventory, Slow inventory, Low stock, Out of stock, Needs attention, and Preorders; also search and status filters.
- [ ] **Add product** - [Live](https://modelcarcenter.com/store?view=inventory&edit=new) · [Local](http://127.0.0.1:5173/store?view=inventory&edit=new). Review both in-stock and preorder forms.
- [ ] **Edit product** - [Local example, sign in as Maya](http://127.0.0.1:5173/store?view=inventory&edit=beta-v1-listing-0). On live, choose a product in your store's Inventory.
- [ ] **Spreadsheet import and batch updates** - open [Inventory live](https://modelcarcenter.com/store?view=inventory) or [locally](http://127.0.0.1:5173/store?view=inventory). Review template download, preview, errors, repeated SKUs, and price/stock updates.
- [ ] **Preorder inventory management** - [Live](https://modelcarcenter.com/store?view=inventory&filter=preorders) · [Local](http://127.0.0.1:5173/store?view=inventory&filter=preorders). On a preorder listing, open **Manage preorder** for stock, dates, and refund controls.
- [ ] **Preorder orders** - [Live](https://modelcarcenter.com/store?view=orders&filter=preorders) · [Local](http://127.0.0.1:5173/store?view=orders&filter=preorders).
- [ ] **Payments** - [Live](https://modelcarcenter.com/store?view=payments) · [Local](http://127.0.0.1:5173/store?view=payments). Review payment connection, held proceeds, releases, and bank-payout explanations.
- [ ] **Sales and performance** - [Live](https://modelcarcenter.com/store?view=analytics) · [Local](http://127.0.0.1:5173/store?view=analytics).
- [ ] **Store settings** - [Live](https://modelcarcenter.com/store?view=settings) · [Local](http://127.0.0.1:5173/store?view=settings). Review public details, private shipping address, package defaults, and shipping/return policies.
- [ ] **Seller help** - [Live](https://modelcarcenter.com/store?view=help) · [Local](http://127.0.0.1:5173/store?view=help).
- [ ] **Buyer demand** - [Live](https://modelcarcenter.com/store?view=demand) · [Local](http://127.0.0.1:5173/store?view=demand). Check Buyer interest, Buyer searches, Want List demand, Models trending, and Unfulfilled demand, including unavailable-feature explanations.
- [ ] **Opportunities** - [Live](https://modelcarcenter.com/store?view=opportunities) · [Local](http://127.0.0.1:5173/store?view=opportunities).
- [ ] **Marketing** - [Live](https://modelcarcenter.com/store?view=marketing) · [Local](http://127.0.0.1:5173/store?view=marketing). Check Offers, Discounts, and Followers; confirm unavailable tools are described clearly.
- [ ] **Promoted listings** - [Live](https://modelcarcenter.com/store?view=marketing&filter=promoted) · [Local](http://127.0.0.1:5173/store?view=marketing&filter=promoted). Review eligible listings, pricing, and campaign states; a payment flow needs a configured test environment.

### Founder dashboard internal sections - admin required

These are button-selected sections inside [Admin live](https://modelcarcenter.com/admin) or [Admin local](http://127.0.0.1:5173/admin). They do not have separate deep links; open the dashboard and select each named section.

- [ ] **Overview** - counts, demand, and summary information.
- [ ] **Sellers** - applications, approval, store details, onboarding, and status.
- [ ] **Products** - inventory, listing review, product editing, and publication status.
- [ ] **Import** - template, CSV preview, validation, and import results.
- [ ] **Model Hunts** - requests, possible matches, and match confirmation.
- [ ] **Community** - dashboard community information; also review the separate moderation route above.
- [ ] **Orders** - order details, payment information, fulfillment, and refunds.
- [ ] **Tax & compliance** - calendar, tasks, and reporting information.
- [ ] **Resolution** - customer cases, status, and available actions.
- [ ] **Production** - readiness checks and configuration explanations.

## Special screens and shared elements

- [ ] **Local beta review hub** - [Open locally](http://127.0.0.1:5173/beta-review). Only served by `npm run dev:beta`; review the three persona links. It is not a hosted page.
- [ ] **404 / unavailable page** - [Live example](https://modelcarcenter.com/review-page-does-not-exist) · [Local example](http://127.0.0.1:5173/review-page-does-not-exist). Also open an unavailable listing or private piece as a visitor; check the recovery link.
- [ ] **Expired sign-in link message** - [Live](https://modelcarcenter.com/sign-in?error=expired) · [Local](http://127.0.0.1:5173/sign-in?error=expired). Review while signed out.
- [ ] **Save a guest order sign-in prompt** - [Live](https://modelcarcenter.com/sign-in?intent=save-order) · [Local](http://127.0.0.1:5173/sign-in?intent=save-order). Review while signed out.
- [ ] **Header, mobile menu, and footer** - review on [Home live](https://modelcarcenter.com/) or [locally](http://127.0.0.1:5173/), plus inner pages and dashboards. Check active links, cart/saved indicators, account menus, and keyboard navigation.
- [ ] **Cookie notice and settings** - reopen **Cookie settings** from the footer; check choices, dismissal, and persistence after refresh.
- [ ] **Contextual help** - open, dismiss, and reopen help on shopping, collection, and seller screens; check its saved state after refresh.
- [ ] **Forms and feedback** - check labels, required fields, errors, loading, success messages, keyboard focus, and phone layout across the forms above.
- [ ] **End-to-end purchase and seller onboarding screens** - follow the cart/payment and seller payment-connection flows in a configured test environment. Stripe-hosted checkout/onboarding URLs are generated for each session and cannot be supplied as permanent page links.

API endpoints, media/file responses, sitemap/robots/manifest files, and authentication callbacks are not standalone review pages. Exercise them through their associated screens.

## Review notes

| Page / view | Live or local | Account / role | Desktop / phone | Finding or requested change | Priority |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
| | | | | | |
| | | | | | |
