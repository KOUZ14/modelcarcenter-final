# Collector community

For a populated, unpublished local review environment, see [Beta seed and review accounts](beta-seed.md).

## Design handoff

The existing catalog, account, seller onboarding, listing, order, shipping and payment services remain authoritative. A collection item represents one physical piece; catalog models and wishlist entries do not represent ownership. No existing account or purchase is published by migration.

Desktop navigation links to Shop, Community, Collection, Inbox and Profile. On mobile, the bottom bar links to Shop, Community, Collection, Inbox and Explore. Explore groups discovery, account, selling and support destinations, including Profile, Wishlist, Notifications, upcoming releases and Seller Hub for store owners. Search and cart stay in the mobile header. Shop URLs continue to open Shop directly.

Community opens on For You or the previously selected Following feed. A narrow desktop navigation and one photo feed sit beside the current editorial theme and collector suggestions. Mobile uses one column. Create post accepts photos or a text-only question, with optional catalog/item tags. Save post and Wishlist are separate actions. Following contains only followed authors, with a clear empty/caught-up state. Detail links preserve the feed URL, topic and loaded page count.

Profiles open on Collection, with Posts, For Sale and About tabs. Only explicitly published profiles and public pieces are discoverable. Public counts exclude previously owned pieces. Shelves are memberships of existing physical pieces. Owners can preview the public projection with View as visitor.

My Collection opens on an image grid. Add model searches exact catalog releases, showing scale, maker, color and code. An unmatched personal piece is permitted without creating a catalog entry. The add/edit form starts with Not for sale, Open to offers and For sale; Not for sale remains the default. Selecting a selling option shows the exact catalog, public profile/piece, seller eligibility and single-piece listing requirements inline. A ready collector can activate availability while saving. Otherwise, Save model and continue setup retains the piece and carries the selected availability and minimum offer through profile/listing setup. Collector listing setup starts with the exact catalog identity and provides a return link; professional sellers use Seller Hub in another tab and refresh eligibility on return. Until setup is complete, new pieces remain Not for sale. Failed availability updates retain the saved piece identity and show the remaining error instead of duplicating the piece on retry. Reserved and sold pieces keep their committed state. Visibility is shown before saving. Purchase records remain in an owner-only expandable area. Publishing a previously private piece requires confirmation.

Item pages show owner photography and story, identity, shelves and availability. Not for sale has Wishlist and a secondary catalog link; Open to offers has Make an offer; For sale links to the marketplace listing; Reserved shows a deadline; Previously owned is historical. Privacy and comments remain independent.

Inbox keeps existing marketplace conversations and adds collector message requests and structured offer records. Profile/item contact enters Requests unless the recipient's settings permit it. Blocking applies across social and marketplace entry points; the existing order Resolution Center remains available.

Offers require an eligible seller and a resolved catalog identity linked to a single-unit marketplace listing. Agreement reserves that listing's inventory using the existing inventory authority. The checkout uses the agreed price, quantity one, existing shipping, fees, tax and payment-confirmation process. A counter requires explicit acceptance. Proposal lifetime is 48 hours and reservation lifetime is 24 hours. Auctions are excluded from this release.

Buying journey: photo → tagged catalog model → owner's public piece/collection → Follow → Make an offer → counteroffer → explicit acceptance → existing checkout → payment-confirmed order.

Non-buying journey: photo → Save post → owner's profile → message request/question → reply → notification → saved post or Following feed. Collection changes never create posts automatically.

## Release gates

Verify private URLs, media, tags, search and counts; explicit publication; duplicates and historical pieces; block enforcement; offer/listing contention; checkout retries and delayed payment; and returning to browsing context. Invite approximately 20–30 collectors before broad release. Assign an operator for reports and manual theme/spotlight curation. Do not promise immediate review. True auctions, digest delivery and recommendation experiments are later work.

Analytics payloads may contain event names and opaque public entity IDs, never message bodies, addresses, purchase costs or private notes. Paid-order reporting remains payment-confirmation based. Retention and community-assisted sales describe behavior and do not establish causality.

## Implementation and operations

Migrations `0029`–`0031` add the community records and shared-inventory guards. The first two were generated from the Drizzle schema; the third contains inspected SQLite triggers. No public profiles, posts, themes or showcases are seeded. Existing collections and purchases remain unpublished. An operator curates the theme and handles reports at `/admin/community`; ordinary account access cannot read the moderation queue.

The existing `/api/community` mailing-list endpoint is retained. New community operations use `/api/collectors`. Both public pages and private APIs bypass shared caches. Community images use authenticated, uncached routes rather than the marketplace's immutable image CDN path. Uploads are resized in the client and JPEG metadata is stripped again on the server. Uploaded-but-unattached images remain owner-only.

New listing conversations also enter the collector request flow. Existing marketplace conversations and order support remain available. Offer messages are structured records rather than prices extracted from chat. Turning offers off withdraws proposals while preserving the accepted reservation. Account deletion withdraws unpaid agreements, removes personal records, and preserves paid commercial snapshots without requiring the deleted collection item or conversation to remain.

Offer pilot constants live in `lib/collection-offers.ts`: 48 hours for a proposal and 24 hours after agreement. Existing payment-provider minimum checkout duration is respected; checkout cannot extend that deadline. Shipping and tax use existing marketplace services. Proposal terms, item-price amounts, destination and versions are immutable. Listing/shipping edits invalidate proposals, and accepted material terms cannot be edited during the reservation. Existing product stock remains the single inventory authority for collection offers and normal listing checkouts.

Late or inconsistent payment success creates a durable entry in `community_payment_exceptions` and cannot create an order. The operator must reconcile the provider payment and refund or otherwise resolve it before fulfillment; this release does not automatically refund these exceptions. Refunds on completed orders stay in the existing marketplace workflow and do not automatically reintroduce a sold piece into the owner's collection.

The Following feed is chronological. For You uses explicit interests, follows, wishlist matches, recency, replies and saves, with an author-repeat penalty. Feed snapshot time, topic, tab and batch size live in the URL. New content arrives behind an explicit refresh control. Shelves and collection filters also use URL state. Navigation/back behavior still needs the requested collector usability sessions across actual devices.

Delivered orders offer a populated collection form with private visibility. Saving that form remains an explicit buyer action and never creates a post automatically.

## Validation and remaining rollout work

`tests/community.test.mjs` runs real services and every migration against isolated SQLite, with a mocked payment provider. It covers publication, private fields and tags, empty Following feeds, message requests, blocking, concurrent acceptance, competing listing checkout, counters, immutable terms, checkout retries, duplicate callbacks, expiry, cancellation, late-payment reconciliation, account deletion and photo metadata. Existing marketplace regression tests remain required.

The invited beta, human usability sessions, moderation staffing and a real configured shipping/payment test are release gates. They are not claimed by a successful build or isolated tests. No invitations are sent automatically. No automated weekly digest, import/export, paid feed placement or auction flow is included. Saved-post and wishlist data are separate. Public wishlists and additional recommendation experiments can follow observed beta use.

Use these event contracts when connecting the analytics destination: `collection_published` (public piece ID), `collector_followed` (public profile ID), `post_impression`/`post_opened` (public post ID, feed tab), `comment_created` (public target ID), `model_opened`/`model_wishlisted` (catalog ID, entry point), `offer_state_changed` (opaque offer ID, from/to state) and existing payment-confirmed purchase events. Do not emit message bodies, private note/cost fields, addresses or idle-time engagement. Analytics destination wiring and cohort reporting are not enabled by this migration.
