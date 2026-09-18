# Preorders

Preorders are an availability option in **Seller Hub → Inventory → Create listing**. Select **Preorder · 10% deposit**, enter the full item price, expected ship date, quantity available to preorder, and maximum quantity per buyer. An optional closing date stops new orders before shipment. Save the draft, add a product photo or clearly described preview, and publish it normally. An active professional store with current seller terms and completed Stripe setup can use this flow; there is no additional supplier-evidence or preorder-approval step.

## Buyer and seller flow

1. The buyer chooses a quantity on the listing, accepts the ship estimate and cancellation terms, and pays a **10% merchandise deposit** in Stripe Checkout. Applicable tax is shown before payment. The deposit is rounded to the nearest cent per unit; the minimum item price is $5.
2. The preorder appears in `/preorders`, with the deposit paid, expected ship date and remaining balance. A successful, verified deposit confirms the reservation. Abandoned checkout does not reserve stock indefinitely.
3. The seller opens `/store/preorders` and chooses **Mark stock ready**, entering the number of inspected, available units. Receipt totals are cumulative, so submitting the same receipt twice does not add stock twice.
4. The buyer receives a notice and has **seven calendar days** to pay the remaining **90%**, plus shipping and applicable tax. The merchandise deposit is deducted from the item price. The buyer selects shipping and explicitly pays in Stripe; no automatic later charge is made.
5. Payment creates an ordinary order containing the complete item price and both payments. Shipping, tracking, disputes and returns continue through the existing Orders and Resolution Center screens.

For example, a $100 item requires a $10 merchandise deposit and a $90 merchandise balance. Shipping is collected with the balance; any tax on each payment is shown separately at checkout.

## Cancellations and refunds

- **Buyer changes their mind or misses the ready-stock balance deadline:** the deposit is retained. The seller can still choose **Refund deposit** in the customer list.
- **Seller or manufacturer cannot fulfill:** cancel the preorder listing to request a full refund. Any paid, unshipped order has both its deposit and balance refunded.
- **Shipping estimate changes materially:** the buyer can accept the revised date or cancel for a deposit refund. No response by the disclosed seven-day response deadline requests a refund. An overdue estimate closes new preorders and requests a seller update.
- **Insufficient stock after the final delivery:** unavailable deposit preorders are cancelled and refunded in reservation order. A deposit preorder is not silently reduced to fewer units or substituted with another model.

Refund obligations are recorded before recovery and remain visible until Stripe confirms completion. Pending or failed refunds are never presented as money returned. Provider failures require review in `/admin/preorders`; transient failures retry during maintenance. Mandatory consumer rights are preserved. The delay/cancellation behavior follows the [FTC's merchandise-order guidance](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule).

## Payment and inventory integrity

Incoming quantity is separate from physical inventory. Database guards enforce capacity, buyer limits, accepted terms and allocation ownership. New deposit checkout holds last up to 35 minutes and cannot extend beyond the listing cutoff. Current seller eligibility is rechecked at payment confirmation. Accepted prices and descriptions are immutable; subsequent shipping-date changes use the notice workflow. Standard carts and CSV imports cannot overwrite preorder commitments.

Deposits use the existing platform Stripe credentials and card Checkout. The saved request body and idempotency key keep retries on the accepted price. Webhooks and scheduled recovery verify Stripe payment evidence. Late or mismatched payments are refunded rather than resurrecting cancelled reservations.

Fulfilled orders combine the deposit and balance, including actual processing fees and taxes from each payment. Their seller transfer follows the existing delivery hold. It uses the combined platform balance because the proceeds come from two separate charges, consistent with [Stripe's separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers). Full and partial refunds reconcile both charges and the associated transfer; concurrent refund requests are serialized per order.

A deposit retained after voluntary cancellation or a missed balance deadline can settle to the seller after seven days, less applicable tax, processing fees and marketplace commission. Refunds and disputes block settlement. A later seller-approved refund reverses any associated deposit transfer. Deposits awaiting fulfillment stay held.

Migrations `0032`–`0034` extend the existing preorder tables with deposit checkouts, payment components, combined-order refund requests and transactional guards. Migration `0033` enables the versioned deposit terms for new listings. Existing free reservations retain their original `pay_when_ready` terms and are never retroactively charged; their older admin controls appear only when legacy offers exist.

The existing Stripe, email, tax and shipping runtime configuration remains in use. Scheduled maintenance runs hourly for payment recovery, expiry, reminders, refunds and eligible deposit settlements. No live payment has been exercised by the automated test suite.

## Verification

`tests/preorders.test.mjs` and `tests/preorder-deposit-scenarios.mjs` run the real listing, reservation and payment services against all SQLite migrations with mocked Stripe calls. They cover normal listing creation, eligibility, unpaid-confirmation rejection, 10%/90% charging, immutable prices, idempotency, late payment refunds, stock shortages, seller refunds, retained deposits, transfer reversals and disputes. The rest of the marketplace tests cover ordinary checkout, shipping, returns and seller payouts.
