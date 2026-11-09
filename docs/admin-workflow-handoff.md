# Admin workflow changes

Implemented locally on September 23, 2026. These checks describe the local application, not the deployed site.

## Editing and order evidence

- The product API now supplies `catalogProductId` and `conditionNotes`. Existing editors render the saved listing immediately, preserve the shared model association, and remount when selecting a different record. Product and seller editors move into focus. Currency inputs use USD amounts.
- Migration `0036_admin_workflows.sql` restores wholly missing order-item sets only from an unambiguous completed checkout with matching seller, currency, and subtotal. Existing or partially populated item sets are not overwritten. Unrecoverable and inconsistent records have explicit reconciliation warnings; shipment and inventory-restock actions are blocked until their items reconcile.
- The migration identifies Stripe `cs_test_` checkouts as test orders. New checkout orders persist this distinction too. The three local orders now have their original item snapshots and are excluded from tax reports. A local database backup was saved to `.sites-runtime/backups/before-admin-workflows-0036.sqlite` before applying the migration.
- Orders have a searchable queue, payment/fulfillment/test filters, sorting, shipment deadlines, overdue indicators, dates and age. Details retain item photos, SKUs, quantities, shipping, financial records and refunds. Empty payment-alert panels are collapsed below the queue. Awaiting shipment includes processing orders.

## Navigation and phone layouts

- Main sections use durable `/admin?section=...` URLs. Tax views use `&view=readiness`, `reporting`, `setup`, `calendar`, `bookkeeping`, `sellers`, or `activity`.
- Preorders, Promotions and Community moderation share the admin frame, environment badge and accessible current-page links. A collapsible phone menu replaces the horizontal destination strip.
- Product and seller tables become record cards on phones. Remaining wide tables are contained in keyboard-focusable scroll regions. Forms and Tax grids no longer force the whole document wider.
- The dashboard labels the subscriber section **Subscribers**; the separate moderation route remains **Community moderation**.

## Operational context and traceability

- Overview links to application, shipment, overdue, dispute, payment-exception, item-reconciliation, notification and listing-review queues. Activity totals have explicit reporting periods.
- Seller applications show submission dates, details, terms evidence, decision notes and recorded review history. Seller search and status filters, payment readiness, verification time, requirements from the last admin Stripe refresh, and shipment workload links are available. Identifiers are secondary details.
- Product management adds thumbnails, status/photo filters, sorting and missing-photo warnings.
- Import explains required columns, size/row limits, overwrite and blank-cell behavior, draft status, and photo handling before file selection. Validation errors are downloadable. New completed imports appear in activity history; old imports are not backfilled.
- Tax readiness wording reflects the recorded state and identifies owner records versus configuration evidence. The displayed account-verification date is an owner record, not a live provider check.
- Promotions use dollar amounts and explicit seller audience selection. A preview presents the proposed settings and current active paid campaign/seller counts before confirmation. Existing purchase prices are preserved; stale settings previews are rejected. No promotion settings were saved during browser QA.
- Preorder maintenance has a read-only scope preview covering expiry, notices, refunds, deposit reconciliation, retained-deposit settlements and allocation checks. It retains the existing combined maintenance pass, with separate expiry, delivery and financial-recovery results and a recorded completion/failure trail. Remaining exceptions are not reported as successful refunds or deliveries. No maintenance operation was executed during browser QA.
- Model Hunts show preferences, request date, match/notification history and inventory lookup. Resolution explains case creation and links to order lookup and guidance. Production readiness shows the check time, remediation and the distinction between configuration and operational evidence.

## Verification and deployment

- Full local test suite: 347 passing tests, including new recovery, admin payload, existing-product save/editor, decision-history and maintenance-preview regressions.
- TypeScript and lint checks passed for the changed code. The production build and Worker artifact validation also passed.
- Browser checks at a 390px viewport: Sellers, Products/editor, Orders, Tax/readiness/reporting, Preorders and Promotions fit the document width (375px content plus scrollbar). Navigation retains Orders after refresh. DEMO-002 opens with $119.00 and inventory 2; the three local orders display restored items and test labels; Tax reports show all three excluded.
- Queue displays still load the latest 250 orders/listings; the interface states this limit. Provider delivery, populated preorder exceptions and live payment processing require separate operational evidence.
- Apply migration 0036 to the target database before deploying this build. Nothing was deployed or migrated remotely as part of this work.
