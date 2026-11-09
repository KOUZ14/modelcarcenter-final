# Model catalog and seller listings

The canonical model lives in `catalog_products`. The existing `products` table is
the seller listing table; its name and IDs are retained to preserve checkout,
orders, reservations, photos, saved items and message references. Every listing
must reference `products.catalog_product_id`.

`catalog_products` contains manufacturer, manufacturer SKU, normalized lookup
keys, scale, vehicle identity, variant, color, livery, years, material, optional
UPC/EAN, general description/image, creator and review status. Price, stock,
seller SKU, condition/disclosures, serial number, photos and listing status remain
seller-specific. Existing identity columns on `products` are compatibility
snapshots populated from the selected catalog record; sellers cannot use them to
edit the shared model.

## Seller flow

Collector, store and admin listing forms start with **Find your model**. Select a
search result, or enter a missing model and check for matches before continuing.
Manufacturer SKU is strongly encouraged; unknown numbers can be left blank.
New records start as `unverified` and can immediately be reused. Existing seller
approval, condition disclosure and original-photo publication rules still apply
to the listing independently of catalog verification.

All writes use `prepareListingCatalog` and `persistCatalogListing`:

- Exact normalized manufacturer + SKU and collectible identity reuse the catalog
  record. A shared assortment SKU alone does not merge different colors, liveries,
  editions, packaging, regular/chase versions or set contents. SKU punctuation is
  preserved to avoid merging distinct manufacturer part numbers.
- Valid UPC/EAN identifiers share a padded GTIN lookup key. Conflicting strong
  identifiers return an error instead of choosing one silently.
- Similar attributes prompt for a choice; confirmation creates a distinct model.
  Similarity alone never merges records.
- New catalog and listing records commit in one D1 batch. Database uniqueness
  constraints arbitrate concurrent exact matches, with a retry using the winner.
- Editing an existing listing keeps its catalog relationship. It cannot mutate
  shared identity or silently move sales history to another model.

`GET /api/catalog-products?q=...` searches models independently of inventory.
`POST /api/catalog-products` is a read-only match check. Writes remain in the
existing authenticated collector/store/admin APIs.

`GET /api/catalog-products/:id/listings` returns the catalog model and all active,
available listings from eligible sellers. `/models/:id` renders seller comparison;
individual listing pages link to it. Checkout continues to use listing IDs.
The existing marketplace grid and saved-item behavior remain listing-based for
this MVP; grouped browsing and catalog wishlists are follow-on work.

## Migration and rollout

Apply `drizzle/0023_catalog_products.sql` after migration 0022, before serving the
new application version. This additive migration preserves every listing ID and
dependent record. It backfills exact manufacturer/product-number matches together
and keeps models with unknown manufacturer numbers separate. It never interprets
seller SKU as manufacturer SKU and does not promote seller photos or descriptions
to shared catalog content.

SQLite cannot add a required foreign-key column to an already populated table.
The migration adds the FK, backfills it, then installs insert/update triggers that
reject null catalog links. This avoids rebuilding the inventory table or cascading
through existing transactional records. Drizzle's nullable column declaration
reflects SQLite's physical column metadata; the triggers enforce the required
relationship.

The preorder rollout adds migrations `0024`–`0027`, including the collectible
identity index that replaces manufacturer/SKU-only uniqueness. Shared catalog
records also retain manufacturer release precision, source, last-checked date,
release status and preview-media provenance. These announcements do not override
seller dispatch promises. See [the preorder workflow](preorders.md).

The current CSV import path also links every listing and reuses manufacturer
product numbers (`product_number`). Ambiguous new rows stop before committing;
add/select those models through the listing form first. No new CSV import workflow
or external catalog integration is included.

Future duplicate merges can retarget listing FKs, set `merged_into_id` on the
archived source model, and preserve the source record. Model lookups already follow
that redirect. Existing orders retain their listing IDs and purchase snapshots.
Future catalog-level wishlists and price history should reference the catalog ID,
with transaction records also retaining the purchased listing ID.

## Verification

`tests/catalog-products.test.mjs` runs actual matching services, seller writes,
catalog endpoints, CSV import and migrations against isolated SQLite databases.
It covers normalization, conservative backfill, independent seller inventory,
ownership, creator attribution, rollback, concurrent creation, barcode conflicts,
SKU-less confirmation and active-offer filtering.
