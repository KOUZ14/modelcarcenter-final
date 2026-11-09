# Protection window decision - proposal only

Prepared September 18, 2026. **The active delivered-order claim window remains three calendar days. No longer window has been activated.**

## Decision for the owner

Consider seven calendar days after confirmed delivery for reporting damage, material listing inaccuracies and other covered delivered-order problems. This gives buyers more time to inspect fragile models and included parts. Fourteen days is an alternative if a longer inspection period is worth the additional delay in seller proceeds. Neither option changes the existing non-delivery limits, case-response deadlines, or seller-specific change-of-mind eligibility without a separate decision.

| Window | Buyer inspection period | Earliest release eligibility, compared with today |
| --- | --- | --- |
| Current: 3 calendar days | Delivery timestamp + 3 days | Unchanged |
| Proposed: 7 calendar days | Delivery timestamp + 7 days | 4 days later |
| Alternative: 14 calendar days | Delivery timestamp + 14 days | 11 days later |

These are eligibility dates, not promises of bank arrival. Release also requires final processing fees, an eligible payment account and no case, dispute or other payment hold. Bank payout follows Stripe's schedule. For example, delivery at September 18, 2026, 12:00 UTC gives a September 21 deadline today, September 25 under seven days, or October 2 under fourteen days.

The current platform request window for change-of-mind returns is also three days. The owner must explicitly decide whether to extend that request window with protection. Seller policy still determines whether a change-of-mind return is accepted; buyers normally pay that return postage. Covered order problems use reasonable authorized seller-paid return shipping. Do not advertise a universal change-of-mind entitlement.

## Support already implemented

- `lib/protection.ts` holds immutable named policies and the active policy. Only `delivery-3-v1` is currently registered and active. Unknown versions fail closed for review.
- Checkout reservations snapshot the active version when the buyer accepts the checkout terms. Paid orders copy that version. A checkout already started before a future change keeps its accepted terms.
- Migration `0035_marketplace_usability.sql` assigns the legacy version to existing orders and reservations. It does not rewrite delivery timestamps, claim deadlines, payout dates or open cases.
- Delivery processing calculates deadlines using each order's policy, including mixed-order shipments. Existing stored claim and payout deadlines are preserved on repeated delivery updates. A late in-transit event does not revert a delivered order to shipped.
- Listings and prepayment explanations use the active policy; order pages use the policy sold with the order and show an exact UTC deadline. Existing case workflow and payout checks continue using saved deadlines and holds.

## Open cases and existing purchases

Keep all existing purchases on their original terms, including orders delivered after a new policy starts. Do not reopen expired claims automatically. Already-open cases retain their saved deadlines: seller response, buyer evidence, escalation and authorized-return dispatch. These case deadlines are separate from the initial period for opening a claim. Open cases continue to hold payouts through resolution.

If the owner wants a goodwill exception for an older order, handle it explicitly through the case process with a recorded reason. Do not bulk-extend old payout eligibility dates or silently amend accepted terms.

## Before activating any new version

1. Owner records the chosen duration, whether it also changes change-of-mind request deadlines, and the effective date/time in UTC.
2. Confirm seller communication, support staffing and cash-flow impact. Review the final terms and notice process with the business's policy adviser as appropriate.
3. Add a new immutable policy identifier and update the active identifier and accepted policy version together. Keep the old registry entry and legacy database defaults permanently available.
4. Update any policy copy that describes the chosen scope, then verify new and old checkout reservations, unpaid preorders moving to payment, delivered orders, mixed shipments, open cases, reminders, refunds and payout holds.
5. Test the boundary just before and after the UTC deadline and the activation time. Confirm that retries cannot extend a stored deadline or duplicate a release.
6. Publish only the explicitly approved policy change. Monitor support volume, late reports, seller payout delay and refunds; use a new version for any later change.

Approval record: **pending**. Chosen duration: **pending**. Effective date: **pending**.
