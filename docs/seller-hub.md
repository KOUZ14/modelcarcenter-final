# Seller Hub

The professional seller workspace remains at `/store`. Its main navigation is Overview, Inventory, Demand, Opportunities, Orders, Marketing, and Analytics, with Settings and buyer messages retained. `view`, `filter`, and `edit` query parameters preserve navigation and support direct links. Existing inventory editing, imports, shipping labels, tracking, and seller settings remain available.

Page and section headings use straightforward names for the feature or content, such as Overview, Opportunities, Analytics, and Payout summary. Avoid slogans, metaphors, motivational copy, and rhetorical questions in headings. Supporting descriptions should explain what the page shows or lets the user do.

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

Buyer-search events, targeted offers, coupon/scheduled discount campaigns, promoted listings, and followers are not yet implemented. Their sections state that explicitly and link to available work. Pricing opportunities are not offer eligibility or buyer consent.

Profit estimation uses user-entered aggregate costs against lifetime item sales after commission. Inputs are temporary planning assumptions and are not saved as accounting records. Inventory turnover awaits cost-of-goods and historical inventory-cost data.

The hub uses existing tables and requires no new migration.
