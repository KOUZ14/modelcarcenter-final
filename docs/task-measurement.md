# Optional task measurement

Usage measurement is opt-in in Cookie settings. Necessary-only is the default and existing notice dismissals do not enable measurement. The browser and API honor Global Privacy Control and Do Not Track. `MARKETPLACE_MODE` must be `live`; test mode is excluded. Known test email patterns and accounts in `ADMIN_EMAILS` are excluded, including administrator identities from the hosting sign-in headers. Staff or study browsers can also set `mcc-exclude-measurement=yes` in local storage. Confirm those exclusions before an owner study; unrecognized guest staff cannot be identified automatically.

Events contain only an opaque event ID, a fixed event name, UTC day, an allowed step/result, numeric count and elapsed milliseconds. They do not contain search terms, paths, seller/account IDs, email, addresses, private form values, payment details, or messages. Storage is first-party D1. Writes and scheduled maintenance remove events older than 90 days. The daily reporting API also limits reads to 90 days.

## Event definitions

| Event | Trigger and interpretation |
| --- | --- |
| `buyer_search` | Successful Shop inventory response, once per changed query/filter state in that mounted view. Includes result count, no search text. |
| `buyer_empty_results` | The same response has zero matching listings; errors are excluded. |
| `listing_viewed` | A listing detail page mounts or changes. Repeated development effects are suppressed. |
| `add_to_cart` | A successful add to the existing cart flow. |
| `shipping_completed` | The buyer submits checkout with a valid address and selected shipping for every included seller. This is a payment-handoff milestone, not every rate calculation. |
| `checkout_started` | Validated checkout is requested. A request may subsequently fail; it is not a payment. |
| `purchase_completed` | The confirmation endpoint finds a real paid order for a checkout session, with current consent. The server hashes the session into an opaque unique ID and ignores duplicate inserts. Test sessions, client-asserted purchase events, and purchases older than 89 days are excluded. |
| `seller_setup_started` | Seller setup first observed on the consenting device. |
| `seller_setup_step_completed` | A saved profile, bank connection, shipping configuration or inventory task is observed complete. The server derives checklist status from saved records. |
| `inventory_import` | Spreadsheet preview or commit result, with valid/error counts and allowed status. |
| `first_listing_published` | A successful publish action when the loaded store has no live/sold-out listing or order. Includes elapsed time when setup began on this consenting device. |
| `seller_tool_used` | A successful named dashboard action, such as saving inventory, changing stock, importing, or adding tracking. Repeated actions remain measurable. |
| `task_abandoned` | Leaving an edited checkout, inventory form or import without that component recording success. It is a signal of unfinished work, not proof of confusion. |

## Reporting and limits

An administrator can read `GET /api/measurement` through the normal admin sign-in. It returns daily event totals grouped by event, step and result, summed quantities, timed-event counts and average elapsed milliseconds. It does not return opaque IDs or user identities. Responses are private and not cached. There is no public report.

Use these as aggregate task counts, not unique visitors, conversion rates per person, or proof of causality. There is deliberately no persistent cross-device identity. Setup completion markers and the setup timer are device-local; clearing storage, switching devices, an archived former listing or an already-established store can affect the observed first-publication metric. Time values are capped at 30 days. This is not an authoritative lifetime seller-onboarding ledger.

Successful-purchase measurement is a **consented confirmation-return sample**. A buyer who does not return to confirmation is not included. The order/payment records remain the source of truth for total sales, taxes, refunds and accounting. Purchase event deduplication applies to the checkout session, including multiple seller orders in one checkout, and survives retries within retention.

The cookie lasts up to one year. The local consent choice and setup completion markers last until changed or cleared; session markers end with the browser tab/session. An expired consent cookie stops collection even if the local preference remains. Optional measurement failures never block buying or selling.

## Turning observations into changes

Review aggregate import failures and unfinished tasks alongside actual owner-study notes. Record the step, generic problem, frequency and proposed fix in the study log, without copying private field contents. Measure repeated successful tool actions as usage volume; do not label them repeat users. A true cross-device onboarding cohort or visitor conversion funnel would require a separate privacy-reviewed design and disclosure update.
