# Seller Hub

The professional seller workspace remains at `/store`. Orders, Inventory and Payments are the primary tasks. Overview, Sales and performance, Store settings and Help remain available, alongside Demand, Opportunities, Marketing and buyer messages. Existing `view`, `filter`, and `edit` query parameters remain valid, including `view=analytics`. Existing inventory editing, shipping labels, tracking, promotions and preorder tools are retained.

The four setup tasks derive their status from saved store details, the payment connection, shipping configuration and inventory. Drafts can be added before all setup is complete. Application approval, listing review and publication readiness are separate. Public store profiles require an introduction, specialty, general country/region and packing approach; street addresses remain private. Payment setup cannot approve an applicant store.

Spreadsheet uploads provide a template, editable CSV preview, row-level errors and create/update labels. Repeated uploads reuse stable seller SKUs case-insensitively while retaining their saved spelling. Existing reservations cannot be removed by lowering stock. New items stay drafts; existing items retain their status. Batch price and stock updates are available for in-stock listings. External stock synchronization is not implemented; sellers must update stock after selling elsewhere.

Page and section headings use straightforward task names, such as Orders to ship, Inventory, Payments and Sales and performance. Supporting descriptions explain what the page shows or lets the user do. See [the usability handoff](marketplace-usability-handoff.md), [task measurement](task-measurement.md), and [owner study protocol](store-owner-study.md).

## Data and definitions

- Overview sales are lifetime gross item sales for paid and partially refunded orders. Fully refunded and unpaid orders are excluded. These are not accounting revenue or profit.
- Inventory queues distinguish slow, low, out-of-stock, and preorder listings. Low stock means 1–2 available units on active in-stock listings. Reservations reduce available stock.
- Slow inventory means active in-stock listings created at least 90 days ago, with stock remaining and no paid sale in the last 90 days. Editing a listing does not reset its age.
- Inventory value is available non-preorder inventory at current list price, excluding rejected listings. It is not inventory cost.
- Sell-through estimates 90-day units sold divided by those units plus currently available stock, using the same current non-preorder catalog. Refunded units are not reconciled; fully refunded orders are excluded. It is not a historical inventory turnover ratio.
- Payouts separate recorded releases to Stripe, less reversals, from held proceeds adjusted for refunds. Processing transfers are not treated as released. Unfinalized fee amounts and legacy destination payouts are excluded from the amounts where appropriate. Bank deposits are not tracked.
- Demand uses seller-scoped wishlist saves, active restock subscriptions, and grouped open or possible-match Model Hunts across the marketplace. Owner saves are excluded. No collector contacts or private hunt notes are sent to the browser.
- Trending means at least three current saves created in the last 30 days, exceeding the preceding 30 days. This measures wishlist interest, not market price growth. Unsaved items do not remain in the trend history.
- Want List matching respects model, scale, requested maker/color/condition, and maximum budget. Unfulfilled demand means demand the current store cannot fulfill from active in-stock inventory.
- Returns show orders with a return-and-refund resolution request, including historical requests, and link to the Resolution Center.
- Repeat buyers are normalized buyer emails with more than one paid or partially refunded order. Product performance uses paid dates where available and groups by product ID.

## Capability boundaries

Optional aggregate buyer-search and task counts are now available to administrators under the site's privacy choices; they contain no search terms or collector identities and do not provide seller-level demand attribution. Targeted offers and coupon/scheduled discount campaigns remain separate work. Pricing opportunities are not offer eligibility or buyer consent. Community followers remain distinct from verified purchase history.

Promoted listings are managed under Marketing > Promoted listings. The panel shows searchable seller inventory with photos, prices, available quantities and a **Promote** action on each eligible listing. Pay $2.99 in Stripe for seven days, then pause, resume or end the promotion from the same row. Sponsored cards appear above marketplace results without duplicating the listing below. New installations enable purchases using Stripe automatic tax and its Website Advertising classification; explicit administrator settings remain authoritative. `/admin/promotions` controls pricing, availability and refunds. See [Promoted listings operations](promoted-listings.md).

Profit estimation uses user-entered aggregate costs against lifetime item sales after commission. Inputs are temporary planning assumptions and are not saved as accounting records. Inventory turnover awaits cost-of-goods and historical inventory-cost data.

Preorders are created directly in the listing form by selecting **Preorder · 10% deposit**. Sellers enter the expected ship date, incoming quantity and buyer limit. Buyers pay 10% upfront, then the remaining balance when stock is ready. Deposits are non-refundable for a change of mind unless the seller approves a refund; inability to fulfill and qualifying delays require refunds. **Inventory → Manage preorder** opens stock, date and refund controls on the selected listing. **Orders → Preorders** shows customer deposits and remaining balances using the existing order layout. Buyers manage preorders in **My Orders**. The former standalone pages redirect into these screens. See [Preorders](preorders.md) for the complete flow and migrations `0032`–`0034`.
