# Pay-when-ready preorders

Approved professional stores can publish seller-specific incoming offers against the shared model catalog. Buyers reserve without paying and pay through MCC only after the store records inspected sellable units. Deposits, upfront payment, saved-card charging, backorders, cross-channel inventory synchronization and combined preorder payments are disabled.

## Screens and launch controls

- `/store/preorders`: select or create an exact catalog model, describe the sale unit and contents, document the supplier allocation, request evidence review, open/close reservations, record cumulative receipts, allocate by priority, update estimates, identify shortages, invite waitlisted buyers, and cancel affected commitments.
- `/preorders`: accepted terms, original/current estimates, outstanding merchandise commitments, waitlist invitations, partial-allocation decisions, contact changes, cancellation, shipping quotes and authenticated payment checkout. Addresses are entered and requoted before payment. Paid orders continue in `/account?view=orders`.
- `/admin/preorders`: policy review and activation, separate seller supply-source eligibility, private allocation-evidence review, refund exceptions, undelivered transactional notices and a maintenance retry action. Overrides require a recorded reason.
- `/marketplace?availability=preorder`: upcoming offers; `availability=in_stock` excludes them. Incoming capacity is never presented as physical inventory.

No preorder policy is enabled by the migrations. An administrator must record the reviewed policy and its delay-response deadline, approve each store's supply source, and review batch allocation evidence before the store opens reservations. Policy review is an operational requirement from the feature brief; the application does not assert that a legal review has occurred. Existing live payment, tax, email and shipping configuration continues to apply. The scheduled Worker handler must run hourly (declared in `vite.config.ts`).

## Records and invariants

The existing `products` table remains seller listings. Each incoming wave uses a separate linked listing and `incoming_batches` record; another seller or in-stock listing for the same catalog model remains independent. Supplier references/evidence are private to the seller and administrators. Reviewed evidence is not a guarantee of supply.

Migrations `0024`–`0027` add policies, seller eligibility, incoming batches, reservations, immutable checkout attempts, a payment-recovery ledger, waitlists and an audit/transactional-email outbox. They also add manufacturer announcement metadata and precise collectible edition, packaging, regular/chase and set-content identity. The old globally unique manufacturer/SKU index becomes a full collectible-identity uniqueness constraint. Reused assortment SKUs no longer silently select a different variant. Inspect the hand-corrected expression index in `0026`; drizzle-kit incorrectly splits comma-containing SQLite index expressions.

Every quantity uses the listing's sale unit. Case-to-individual conversion requires a separate inventory operation; it is not performed automatically. Requested quantity, supplier allocation, MCC capacity, safety buffer, received, damaged and inspected sellable quantities remain separate.

Before receipt, available capacity is `max(0, capacity - buffer - committed - live holds)`. Converted orders continue to count as commitments. A short review hold expires after ten minutes; SQLite triggers enforce capacity, buyer limits, eligibility and current terms at insertion and confirmation. A server-assigned acceptance sequence is immutable. Reductions preserve priority; additions require a new reservation. Capacity reductions close new reservations and identify affected quantities in queue order, with a separate shortage value instead of silently hiding a deficit.

Receipt totals are cumulative and guarded against concurrent updates. Retrying an unchanged receipt does not add stock twice. Only inspected units can be allocated, and stock holds are maintained by database triggers. Partial allocations require acceptance of the available quantity, waiting for a revised estimate, or cancellation. The missing portion is cancelled on partial acceptance; it is never charged or substituted.

Waitlists contain interest only. Sellers manually invite the next waiting buyer when a supported incoming offer has capacity; the invitation holds its quantity for up to 48 hours, bounded by the reservation cutoff. The buyer must explicitly accept the current terms. Public watches never become reservations. Maintenance sends optional availability alerts when supported reservations open, honoring unsubscribe choices. Automated waitlist promotion and combined ready-item shipping remain follow-up work. After receipt, released allocations are assigned to the next eligible existing reservation.

## Dates, notices and consent

Day, month, quarter and unknown precision are stored with both machine ranges and displayed wording. Manufacturer release metadata does not modify seller windows. A blank price, undocumented allocation or unknown dispatch window permits alerts/waitlists only.

The original reservation terms JSON is immutable. Batch revisions retain old/new values in audit records and create consent notices; SQL triggers cover buyers confirmed between the seller's preview and the update. Payment checks the current batch revision and consent. A material delay requires an affirmative response by the deadline in the accepted policy. An overdue estimate closes reservations and requests a revised estimate; no date is invented. Missing responses expire unpaid commitments. Expiry rechecks current state and deadlines atomically so a concurrent buyer response is not undone.

Notices are persisted in-app and delivered through the existing transactional email service, independently of marketing opt-out. Delivery uses a database lease, stable provider idempotency keys and retries with backoff. The same outbox carries confirmations, partial allocations, payment invitations, reminders, expiry, cancellation and refund states. Existing order email and tracking services carry shipment updates. Failed delivery remains visible to operations.

## Checkout and refunds

Each fully accepted allocation has a seven-calendar-day payment deadline. The payment form accepts an address and shipping quote using existing shipping services; Stripe Checkout presents tax and the final total for explicit payment. Each attempt stores its quote and policy acceptance separately. The locked merchandise price, exact model, packaging and handling days come from the reservation snapshot even if the listing changes.

The existing integration uses platform charges with **separate charges and transfers**. Final payment creates ordinary orders with MCC's configured commission, actual processing fee treatment, transfer records, shipping and resolution support. Reserving has no charge or commission. The new checkout skips a second inventory hold; successful verified payment consumes the existing allocation once. Failed or abandoned checkout leaves it held until the disclosed allocation deadline. A new Stripe Checkout cannot begin in the last 31 minutes because it cannot extend the buyer's allocation deadline to satisfy Stripe's minimum session lifetime.

Payment success and cancellation/expiry compete through an atomic state guard. A late or mismatched payment creates a durable refund obligation and no order or inventory promise. Cancelled paid, unshipped batch orders use `createOrderRefund`, including the existing transfer-reversal behavior. Pending/failed refunds remain pending/failed in buyer and admin views. Submission/transfer errors are retried by maintenance; provider-declared refund failures require operations review and remain visible. Refund recovery reconciles all provider refunds on the charge, so a concurrent partial refund cannot satisfy a full-cancellation obligation. Notices retain paid, returned, pending and outstanding amounts. Refund and charge webhooks fetch current provider evidence to resist out-of-order delivery. Normal returns and disputes remain in the Resolution Center once an order has shipped.

New-sales suspension preserves access to existing order fulfillment and refund work. Account deletion cancels unpaid reservations and waitlists before unlinking the user; commercial snapshots and financial history are retained.

## Compatibility and checks

Existing preorder listings without incoming batches become interest-only. Previously paid orders remain ordinary orders; no historical sale details or ship-by deadlines are rewritten. Legacy inventory editors and CSV imports cannot create or overwrite preorder promises. Standard and consolidated carts reject preorder listings on the server.

`tests/preorders.test.mjs` runs real services and all migrations against SQLite with a mocked payment provider. Coverage includes competing buyers, idempotent holds/confirmations, independent seller offers, variant identity, unsupported promises, sale units, shortages, partial receipts, repeat receipt operations, price locks, payment conversion, cancellation/expiry, late payments, refund failure, immutable history, waitlist consent/expiry and notice retries. Existing catalog, checkout, privacy, fee, security and shipping tests remain regression checks.

Operational reference sources: [FTC shipment-rule business guidance](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule), [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), and [Stripe refunds](https://docs.stripe.com/refunds). These explain why the reviewed notice policy and platform refund obligations must remain explicit.
