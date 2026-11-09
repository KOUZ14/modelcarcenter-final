# MCC refund rules and recovery plan

Proposed launch policy and implementation plan. Prepared November 8, 2026 for the US marketplace. This does not activate new fees, change accepted orders, or publish new customer terms.

MCC should refund buyers correctly, return its commission on refunded merchandise, and recover actual seller obligations through a visible seller balance. Sellers should bear ordinary processing and fulfillment costs, while MCC pays for its own mistakes. Recovery must be recorded separately from the buyer refund: money a seller owes is not money MCC has collected.

The existing 7% commission remains the reference rate here. The earlier 8% economics scenario is a separate pricing decision.

## Recommended responsibility rules

These rules apply prospectively after seller acceptance. Existing purchases, checkout sessions, preorder reservations, and founding-store grants keep their accepted terms.

| Situation | Buyer remedy | Who ultimately bears the cost |
| --- | --- | --- |
| Seller sends the wrong item, omits promised parts, materially misdescribes condition, or cannot fulfill | Full refund of the affected purchase, including applicable original shipping and tax; seller-funded return if appropriate. A partial refund requires buyer agreement. | Seller bears actual retained processing and reasonable authorized shipping costs. MCC credits its commission on refunded merchandise. |
| Buyer changes their mind | Only available under the seller's disclosed policy. Buyer normally pays return postage. Original shipping may remain nonrefundable if clearly disclosed and lawful. | Seller bears retained processing as a selling cost. No MCC cancellation or restocking penalty. |
| Buyer requests cancellation before shipment and the seller can stop fulfillment | Full refund when accepted; also preserve mandatory cancellation rights and the existing refundable preorder policy. | Seller bears retained processing. Request refunds for eligible unused labels. A small discretionary MCC processing credit may apply. |
| Carrier loses or damages the shipment | Resolve the buyer's covered claim promptly; do not make the buyer wait for insurance payment. A delivery scan alone does not settle every claim. | Recover from the carrier or insurer where covered. Seller bears the remaining fulfillment loss, unless MCC caused the shipping or coverage failure. No unlimited MCC shipping guarantee at launch. |
| MCC causes a duplicate charge, incorrect label, or other verified platform error | Correct the error and provide the required refund. | MCC bears the incremental loss caused by its error, including applicable processing and shipping costs. Reverse any provisional seller charge. |
| Buyer damages, swaps, or returns an incomplete item | Review evidence. A discretionary return can be reduced or denied for proven buyer-caused loss where permitted. | Do not charge the seller automatically. Do not turn damage that existed on arrival into a buyer deduction. |
| A bank dispute or suspected fraud occurs | Use the payment dispute process and avoid a duplicate refund. A bank allegation is not proof of seller fault. | Recover principal attributable to the seller under the case decision. Budget processor dispute fees as an MCC launch expense. Review payment fraud separately; do not assign it to a seller merely because MCC accepted a fraudulent payment. |

For a multi-item order, refund the affected items and their properly allocated shipping and tax. Refund the whole purchase when the problem makes the entire purchase unusable or the applicable remedy requires it. Never charge an unrelated seller for another seller's case.

For new discretionary-return policies, prohibit flat restocking penalties. Allow only disclosed original shipping treatment and evidence-based deductions for buyer-caused loss, where lawful. Required refunds must not be reduced by processing fees, return postage for seller fault, or collection costs. Honor existing disclosed promises.

## Fee rules that make the accounting work

1. **Credit MCC commission on the merchandise actually refunded.** Use each item's recorded fee, including any founding-store exemption. A shipping-only or tax-only refund does not automatically earn an item commission credit. Never credit more commission than was charged.
2. **Retain the seller's original processing deduction on ordinary refunds.** Charge the actual provider cost, without markup. This replaces the current promise that MCC absorbs the refunded portion. Do not charge processing a second time: retain the original deduction and collect only any resulting shortfall. Credit any fee amount actually returned by the provider.
3. **Keep shipping costs visible.** A used label, authorized return label, or insurance premium does not disappear because the item was refunded. Recover only the seller's net responsibility after carrier refunds, insurance proceeds, and MCC credits. Seller-purchased external postage must not also become an MCC receivable.
4. **Keep taxes separate.** Return the appropriate sales tax to the buyer and record the tax adjustment. Tax is neither MCC revenue nor a seller penalty. Follow through on tax reporting rather than treating the gross refund as a seller-only obligation.
5. **MCC continues to pay its own Connect, tax-service, support, and platform costs.** No surprise administrative or collection surcharge at launch.

Stripe generally retains original processing fees on refunds under standard pricing. Use the actual balance transactions and MCC's applicable contract for settlement, rather than an estimated flat rate. [Stripe pricing](https://stripe.com/pricing)

## What the money looks like

Illustration: a $100 item, no shipping or tax charged to the buyer, a 7% MCC fee, and an assumed $3.20 actual processing fee. Inventory and fulfillment costs are excluded from this first example.

| Outcome | Buyer ultimately pays | Seller's net cash from the transaction | MCC commission retained | Processing loss borne by MCC |
| --- | ---: | ---: | ---: | ---: |
| Completed sale | $100.00 | $89.80 | $7.00 | $0.00 |
| Full refund under current terms | $0.00 | $0.00 | $0.00 | $3.20 |
| Full refund under proposed ordinary-refund terms | $0.00 | -$3.20 | $0.00 | $0.00 if recovered |
| $50 item refund under proposed terms | $50.00 | $43.30 | $3.50 | $0.00 if recovered |

On the proposed full refund, MCC returns its $7 commission and the seller funds $93. If $89.80 was already transferred, reversing it still leaves **$3.20 to collect**. A transfer reversal alone cannot collect more than the amount originally transferred. If that additional collection fails, MCC still loses $3.20.

If MCC also bought a $12 outbound label and a $12 authorized return label, the seller's final net cash becomes **-$27.20**, after all proceeds are unwound and all costs are recovered. The seller receives the returned item where a return is appropriate. This is an example of actual costs, not a $27.20 penalty; credit any subsequently refunded label or insured cost once.

At 1,000 orders per month and a 2% full-refund rate, shifting a $3.20 retained processing cost on all 20 refunds would save **at most $64 per month**, before goodwill and failed recovery. The larger protection is preventing an already-paid seller from leaving MCC with the entire refund principal. MCC still loses the commission on refunded sales and incurs support, Connect, and tax-service costs.

## Case handling and fair deadlines

Keep the current standard of **14 calendar days after confirmed delivery** for new delivered-order reports. Keep existing non-delivery fallback windows, longer seller promises, and individual review for later-discovered problems and legal rights. The reporting window is not a universal expiration of a buyer's rights.

| Step | Launch rule |
| --- | --- |
| Buyer opens a case | Record the requested remedy, listing snapshot, photos, tracking, and affected items. Hold the affected order's unreleased proceeds while an on-time case is open. |
| Seller responds | Keep the existing 3 calendar days. Missed responses escalate to MCC review; they do not automatically prove wrongdoing. |
| Additional evidence | Keep the existing 5-day buyer evidence step and 3-day escalation step. Display exact deadlines and allow documented reasonable extensions. |
| Return authorization | Provide the address, instructions, and tracking method. For a covered seller problem, provide a prepaid label. Keep 7 calendar days to obtain the first carrier scan after usable instructions and label are supplied. |
| Returned item arrives | Proposed: seller has 2 business days to inspect and raise a specific discrepancy with evidence. Otherwise initiate the approved refund. MCC reviews a discrepancy within a target of 3 business days. |
| Refund without return | Initiate once approved. Do not require a return when it has no reasonable recovery value; seller agreement or a reasoned MCC decision is recorded. Handle counterfeit or unsafe goods according to appropriate instructions. |
| Appeal | Proposed: either party has 14 calendar days after a decision to submit an appeal. Have someone other than the original reviewer handle it where staffing permits. Keep required buyer refunds on schedule. |

The proposed inspection and review deadlines require someone to monitor the queue each business day. Provider posting times are separate from MCC's deadline to initiate a refund. Shipping-delay cancellations may require a prompt full refund; the case timetable must not delay that obligation. [FTC merchandise-order guidance](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule)

For collectible models, compare model condition and box condition separately. Use the saved defect, accessory, certificate, and provenance disclosures. Ask for ordinary photos and reasonable evidence; do not make an unboxing video mandatory. A buyer who agrees to keep an imperfect model can accept a partial refund, but must not be forced into one to avoid a justified return.

For a return lost in transit, distinguish a buyer who followed the authorized packing and tracking instructions from a buyer who used an unauthorized method or never dispatched it. Do not automatically deny the former a refund. Open the carrier claim through the label purchaser and allocate the residual loss under the case's responsibility rules. A buyer-supplied wrong address also needs its own finding; a seller who shipped correctly should not be classified as having shipped to the wrong address.

## Recovery sequence

The buyer refund and seller recovery have separate statuses. An approved refund must not wait indefinitely for seller money or an insurance claim. Stripe debits MCC for indirect-charge refunds and disputes, so contractual seller liability does not remove MCC's funding exposure. [Stripe marketplace refunds and disputes](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes)

1. **Use this order's held proceeds.** Reduce the amount still owed to the seller and credit the proper MCC commission. Calculate any remaining seller obligation separately.
2. **Reverse related released transfers where possible.** Limit the reversal to the related transfer's remaining reversible amount. Track failures and retry through the existing reconciliation process. A refund does not automatically reverse a separate transfer, and reversals depend on available connected balance or enabled reserves. [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
3. **Record the unpaid amount in a seller ledger.** Show the order, reason, decision, original costs, credits, recoveries, and remaining amount. Never erase a real obligation merely because the next transfer cannot be negative.
4. **Offset that seller's future eligible proceeds.** Apply only a valid, disclosed obligation. Do not take another seller's money, sales tax, or a buyer's unfulfilled preorder deposit. Do not count the same offset as both a payment and a second cost recovery.
5. **Use authorized repayment or an invoice for the rest.** Send the itemized decision and a 14-day appeal opportunity before new external collection, unless the seller explicitly agrees to earlier payment. Then give 7 calendar days to pay the invoice. Pause contested external collection during review. A saved payout bank account is not blanket permission for MCC to debit it.
6. **Restrict new exposure if repayment fails.** After the due date, pause new selling for an unpaid confirmed balance while keeping access to existing fulfillment, cases, statements, and appeals. Allow a recorded payment plan where sensible. Suspected deliberate fraud can require an immediate, documented review restriction.
7. **Resolve aged balances.** Review at 30 days. At 60 days, consider writing off balances below $25 when collection would cost more; larger balances receive individual review. These are internal pilot thresholds, not a promise to forgive debt. Record an accounting write-off separately from any legal forgiveness and selling eligibility.

Stripe Account Debits are a separate, potentially chargeable collection method with consent and balance restrictions. Do not assume they provide unrestricted bank withdrawals. Configure any provider-managed negative-balance recovery deliberately and reconcile it against MCC's ledger so the seller cannot be collected from twice. [Stripe Account Debits](https://docs.stripe.com/connect/account-debits)

When an appeal succeeds, release excess holds and credit or repay amounts already collected. When an insurer pays later, apply the proceeds to the covered loss and reimburse the party that bore it. Do not retain both seller repayment and insurance recovery for the same loss.

Reconcile bank-dispute outcomes too: a successful defense can require restoring seller funds previously reversed. Failed or pending buyer refunds remain in an operations queue until confirmed successful or resolved through the appropriate payment process; a case must not appear refunded solely because MCC requested a refund.

## Payouts and exposure limits

Keep the existing release eligibility at 14 calendar days after confirmed delivery for new orders. Bank arrival still follows Stripe's schedule. Timely cases already pause release; late cases need an individually justified hold.

Do not add a blanket 30- or 90-day hold to every seller. A seller-specific additional hold must state its reason, amount, next review date, and release condition. Cap it at documented exposure, release the excess, and review at least weekly. Prefer limiting new order intake to increasing an indefinite reserve. Provider-imposed restrictions may operate separately.

Require tracking to the checkout address. Keep the configured high-value shipping controls: the repository defaults are insurance at $250 and signature at $750, applied to the combined shipment value. Verify deployed settings separately. Show lower-value sellers when carrier coverage is insufficient and offer insurance; do not imply MCC will cover an uninsured loss. Confirm the actual policy covers the item and loss type, including any collectible-box limitation, before promising recovery.

Request eligible unused-label refunds promptly and track credits to completion. Used labels are not refundable merely because the buyer returned the item. [Shippo label refunds](https://support.goshippo.com/hc/en-us/articles/201772785-Refund-a-Label-Created-in-Shippo)

## MCC cash and goodwill budget

Maintain MCC-owned refund liquidity separately from operating spending, taxes payable, and seller liabilities. Do not call an ordinary Stripe balance escrow or assume that bookkeeping segregation creates legally protected custody.

Start with a weekly cash stress test: **all approved but unfunded refunds, plus one simultaneous failure of the largest seller exposure after payout, plus expected processing, shipping, and dispute costs**. Avoid double-counting refunds already in that seller exposure. Count only funds immediately usable for the relevant obligation; an uncollected seller invoice or pending insurance claim is not cash. Fund the resulting buffer or reduce the exposure before accepting it. This is a starting stress scenario, not a guarantee against correlated fraud or multiple seller failures.

Use a proposed **$50 per month discretionary goodwill pilot**, with at most $5 of actual processing reimbursement per case and one credit per seller per 90 days. Reserve it for a cooperative seller facing a buyer-requested cancellation or verified carrier problem. Show the credit explicitly. Do not advertise it as automatic coverage; reassess after 60 days. The budget never caps legally required buyer refunds or MCC's responsibility for its own errors.

Monitor monthly dollar amounts for net commission after every refund, retained processing borne by MCC, unrecovered principal, shipping losses, dispute fees, goodwill, and support. Also track open-case age and seller recovery by age. Assess dollars as well as percentages: one expensive model can matter more than several small claims.

## Implementation priorities

The code already has delivery holds, case and dispute checks, transfer reversals, refund allocation, and retry reconciliation. Extend those controls rather than replacing them.

| Priority | Concrete work | Existing locations |
| --- | --- | --- |
| 1 | Add an auditable seller obligation and recovery ledger, with immutable entries and reversing credits. Keep a signed economic balance separate from nonnegative transfer amounts. | `db/schema.ts`, new migration, `lib/seller-proceeds.ts`, `lib/seller-transfers.ts` |
| 1 | Snapshot the new refund fee policy and seller acceptance. Preserve all historical processing credits, fee exemptions, return promises, and preorder terms. | `lib/legal.ts`, `lib/fees.ts`, checkout and preorder creation, `app/seller-terms/page.tsx` |
| 1 | Allocate refunds by item, shipping, tax, and seller. Credit recorded item commission and retain actual processing once. Make all settlement events idempotent. | `lib/checkout-refunds.ts`, `lib/orders.ts`, `lib/preorder-order-refunds.ts`, `lib/stripe.ts` |
| 1 | Connect failed reversals, label shortfalls, provider bank recoveries, offsets, invoices, and credits to the same obligation. Keep customer refund status independent. | `lib/seller-transfers.ts`, `lib/stripe.ts`, shipping and resolution workflows |
| 2 | Add responsibility decisions, return inspection deadlines, appeal records, and a seller-visible statement with a collection notice. | `lib/resolution.ts`, `lib/resolution-notifications.ts`, seller and admin dashboards |
| 2 | Correct net commission reporting for partial refunds. The current `platformFeesAfterFullRefundsCents` leaves original commission in place on a partial refund; it should not drive this plan's profit reporting. Track partial tax adjustments separately as well. | `lib/tax-admin.ts`, `components/admin-dashboard.tsx` |
| 3 | Publish matching buyer and seller rules, notice existing sellers, require acceptance for future sales, and pilot with daily review. | `app/returns/page.tsx`, `app/protection/page.tsx`, `app/seller-terms/page.tsx`, policy archive |

Before activation, verify full and successive partial refunds; shipping-only and tax-only refunds; exempt founding units; mixed sellers; deposit plus balance payments; legacy terms; used and refunded labels; refund-versus-transfer races; duplicate and out-of-order webhooks; failed reversals; external collection arriving after an offset; appeal credits; and insurance arriving after seller repayment. Each obligation must settle at most once, and a failed collection must remain visible.

For bank disputes, use actual Payments dispute charges under MCC's agreement. The no-pass-through footnote on Stripe's public pricing page is in its **Issuing** section; it should not be treated as a blanket statement about ordinary marketplace payment disputes. The proposed launch choice here is to budget those fees at MCC while enforcing seller principal obligations according to the evidence.

Activate the new rules only alongside the working ledger and recovery controls. Changing the seller terms alone would move liability on paper while leaving the cash shortfall in MCC's account.
