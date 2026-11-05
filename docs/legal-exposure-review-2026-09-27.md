# Legal exposure review — California operator, U.S. customers

Reviewed September 27, 2026. This is an adversarial engineering and policy review, not a California lawyer's opinion. The user confirmed California operations and U.S.-only customers. Findings concern the current local working tree, including uncommitted changes; the public site could not be fetched through the research tool, so deployment and actual customer harm are unverified. Personal liability, business formation, insurance coverage, and off-platform operating procedures were not established.

The strongest issues are undisclosed deposit consequences on account deletion, blanket deposit forfeiture, and the gap between the advertised protection process and the available claim workflow. The public terms expressly make MCC the merchant of record and responsible for payment support, refunds, and charge disputes. Seller indemnities do not demonstrate that MCC has satisfied those promises.

1. **High — Deleting an account can cancel a paid preorder and make the deposit eligible for forfeiture. Confirmed implementation and disclosure mismatch.**

   A claimant's account: “I asked you to delete my profile. You cancelled my purchase and kept my money without telling me.”

   [Account deletion](../lib/collector-store.ts#L589) directly cancels active preorder reservations with `reason='account_deleted'`. [Deposit settlement](../lib/preorder-deposits.ts#L172) expressly includes that reason when selecting cancelled reservations for retained-deposit transfers after seven days. The [deletion confirmation](../components/account-dashboard.tsx#L783) describes profile, session, shopping-data, and listing changes, but does not disclose preorder cancellation or deposit loss. The [public deletion instructions](../app/privacy/request/page.tsx#L11) omit those consequences too.

   **Verification:** Applied every SQL migration to an isolated, in-memory SQLite database. Created a synthetic $1,000 preorder with a $100 paid deposit and a future dispatch date. Executed the actual cancellation SQL extracted from `deleteCollectorAccount`, then advanced the synthetic cancellation's age and executed the actual settlement-selection query. Result: `status=cancelled`, `reason=account_deleted`, `refund_status=not_required`, and selected for retained-deposit settlement. No customer records or payment services were accessed, and no transfer was made.

   Qualification: migration `0034` already requires deposit refunds for specified seller failures and delay conditions. This finding does **not** claim that deletion bypasses those existing safeguards. It concerns an otherwise current, paid reservation.

   **Remedy:** Separate profile deletion from commercial cancellation. Preserve a minimal route to service existing purchases; if cancellation is requested, show the affected reservations, amounts, and lawful refund treatment before the decision. Have counsel assess misleading omission and contract exposure under [California Civil Code §1770](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1770.).

2. **High — Automatic 10% deposit forfeiture needs a California enforceability review. Confirmed behavior; legal outcome depends on facts.**

   A claimant's account: “You kept a fixed percentage even though you resold the model and never established a lawful cancellation loss.”

   [Preorder terms](../lib/preorder-rules.ts#L5) make the deposit non-refundable for a change of mind or missed balance deadline, subject to stated exceptions. [Settlement](../lib/preorder-deposits.ts#L172) calculates seller proceeds from the retained payment, fees, and commission; it does not determine a lawful damages amount for the cancellation. No supporting damages analysis was found in the reviewed materials.

   California treats consumer liquidated-damages clauses differently from ordinary commercial clauses; §1671(c)–(d) makes the difficulty of determining actual damages relevant. Goods contracts also require analysis of §2718 restitution and offsets. **A 10% deposit is not automatically unlawful, and cancellation does not automatically require a full refund in every case.** Calling a payment “non-refundable” does not settle that analysis. [Civil Code §1671](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1671.), [Commercial Code §2718](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?article=&chapter=7.&division=2.&lawCode=COM&part=&title=).

   **Remedy:** Obtain a reviewed deposit/cancellation policy with a documented basis for any retention, appropriate restitution and offsets, and an exception workflow. A refundable deposit or payment only when ready is an alternative business choice. Do not silently rewrite existing accepted terms.

3. **High — The three-day case cutoff has no statutory-rights exception in the case-opening code. Confirmed workflow limitation.**

   A claimant's account: “The model was counterfeit or defective, but your support system rejected my claim because I discovered it on day four.”

   [Protection rules](../lib/protection.ts#L5) allow three days after recorded delivery. [Case creation](../lib/resolution.ts#L231) rejects an expired window before considering the claim's merits. The same cutoff applies to authenticity and defect complaints. Meanwhile, the [public policy](../app/protection/page.tsx#L21) describes an exception when applicable law requires otherwise. [Product copy](../components/product-purchase-info.tsx#L24) says even a longer seller return window does not extend the platform deadline.

   General email support and an [administrator refund action](../app/api/admin/route.ts#L1188) exist. Therefore this is not proof MCC refuses all later legal remedies. The problem is that the primary claim workflow presents an absolute rejection without a dedicated late-claim review path.

   **Remedy:** Accept later reports for review with a recorded basis and separate discretionary protection eligibility from statutory and seller-promised remedies. Provide an explicit escalation route on expired orders. Merely extending three days to seven does not resolve statutory claims. Applicable consumer warranty rights cannot be waived contrary to [Civil Code §1790.1](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1790.1.). Applicability depends on the sale and goods; there is no universal unconditional California return right.

4. **High — The purchase record omits important evidence of what was sold and promised. Confirmed evidence gap.**

   A claimant's account: “The listing promised mint condition and a return period. It changed after I paid, and you cannot produce the version I purchased.”

   [Order creation](../lib/orders.ts#L732) snapshots title, SKU, scale, manufacturer, price, quantity, one image URL, availability, and release date. It does not preserve the full description, condition/defect/accessory disclosures, all photographs, or seller return-policy text. `returnPolicySummary` is mutable seller data, not an order snapshot. [Photo removal](../lib/product-images.ts#L125) deletes the underlying stored object without checking historical purchases. A saved URL is not a preserved photo.

   This materially weakens the evidence for both buyer protection and MCC's defense against misdescription, refund, and chargeback claims. It is not proof of deliberate evidence destruction or a completed legal violation. Preorder reservations preserve more terms than ordinary orders; they still do not establish a complete durable archive of listing media.

   **Remedy:** Preserve an immutable purchase-time record of material listing claims, seller policies, accepted terms, and the referenced media. Apply appropriate transaction retention and legal holds. Show the purchased version in receipts and support cases.

5. **High operational priority — Ordinary late orders lack the implemented delay-consent process promised by the shipping policy. Code gap; manual compliance unverified.**

   A claimant's account: “You missed the promised shipping date, kept my payment, and never offered the required cancellation/refund choice.”

   The [shipping policy](../app/shipping/page.tsx#L27) promises delay notice, consent, or refund. Orders record [ship-by dates](../lib/orders.ts#L686), and the dashboards flag overdue fulfillment. The [scheduled worker](../worker/index.ts#L99) contains preorder-specific processing but no equivalent ordinary-order delay-notice/consent job. I found no persisted ordinary-order delay-consent workflow in the reviewed code. Admin refunds and manual email can support a compliant operating process, but their existence does not establish that it runs on time.

   The FTC rule generally requires a reasonable basis for promised shipment timing and timely delay-or-refund handling. Different notice and consent rules apply to initial and subsequent delays; required refunds must be prompt. FTC enforcement and state consumer claims are distinct routes, not an automatic private federal damages action. [FTC business guidance](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule).

   **Remedy:** Implement or document an owned, auditable process covering every paid unshipped order, including preorders after conversion to ordinary orders. Record notice delivery, revised dates, consent, cancellation, refunds, and failures requiring intervention.

6. **Medium–high — The high-value shipping protection claim is broader than its enforcement. Confirmed mismatch.**

   A claimant's account: “You said my expensive model would require insurance and a signature. The seller shipped it without either.”

   The [shipping policy](../app/shipping/page.tsx#L34) says configured thresholds automatically require added carrier insurance and signature confirmation. MCC's [label-quotation flow](../lib/shipping.ts#L39) applies those rules. However, [manual shipment entry](../lib/store.ts#L623) accepts tracking and service information without requiring insurance or signature evidence. Provider tracking registration does not by itself establish either protection was purchased.

   **Remedy:** Require and verify equivalent protection for externally purchased labels, or narrow the promise to its actual scope while setting clear seller obligations. Verify high-value external-label shipments before release. Misrepresented service benefits can create exposure under [Civil Code §1770](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1770.). No uninsured actual shipment was established here.

7. **Conditional high — INFORM Consumers Act obligations are mentioned but not demonstrated by the implementation. Primarily regulatory exposure.**

   [Seller Terms](../app/seller-terms/page.tsx#L29) discuss INFORM, but I found no dedicated rolling-threshold tracking, annual seller certification records, or INFORM-specific disclosure/suspension workflow. The [listing report API](../app/api/listings/report/route.ts#L5) requires sign-in; reviewed public pages provide email but no marketplace telephone reporting channel. Stripe onboarding alone does not establish completion of MCC's separate duties.

   Coverage generally starts at 200 transactions **and** $5,000 of new/unused goods in a continuous 12-month period within the prior 24 months on the marketplace, subject to statutory exclusions. Additional seller disclosures apply at $20,000 annual marketplace revenue. Covered listings need electronic and telephone suspicious-activity reporting; covered sellers require verification and annual certification. FTC and state enforcement apply. [FTC INFORM guidance](https://www.ftc.gov/business-guidance/resources/INFORMAct).

   **Remedy:** Check actual seller volumes and exclusions; establish verification, certification, disclosure, reporting, and suspension procedures before a seller crosses the threshold. Home-business exceptions need appropriate handling; do not publish residential addresses indiscriminately. No seller was shown to have crossed a threshold in this review.

8. **Conditional high — Copyright permissions and DMCA defenses remain unproven.**

   A rights holder's account: “Your site used my photograph without permission, and you cannot show a license or a functioning takedown process.”

   The existing [asset provenance register](asset-provenance.md#L3) records that ownership/licensing evidence was not provided, including for the hero and branding. The site hosts seller and community uploads. I found no public designated-agent notice or explicit repeat-infringer procedure in the reviewed source. Directory registration and any separate operating process are unverified. This does **not** establish that an asset is infringing.

   Qualifying DMCA hosting protection has conditions, including publishing and registering an agent and implementing the applicable process; seller warranties alone are insufficient. It also does not provide blanket protection for MCC's own use of unlicensed artwork. [Copyright Office agent guidance](https://www.copyright.gov/dmca-directory/), [17 U.S.C. §512](https://www.copyright.gov/title17/92chap5.html#512).

   **Remedy:** Resolve the provenance register, retain licenses/creator agreements, and establish counsel-reviewed notices, takedowns, counter-notices, repeat-infringer handling, and agent registration/renewal.

Additional checks that should not be mistaken for confirmed violations:

- **California sales tax:** `STRIPE_AUTOMATIC_TAX` defaults to false; the live-checkout gate does not require the separate tax-readiness checklist to pass. The admin tax checklist does exist. Verify the real permit, marketplace-facilitator treatment, registrations, tax collection, filings, and remittance. California physical presence and facilitator rules matter independently of a simplistic “under $500,000” assumption. [CDTFA guidance](https://cdtfa.ca.gov/industry/MPFAct.htm). Production configuration was not read.
- **Proposition 65:** No dedicated warning fields or workflow were found. Review actual supplier warnings, exposures, roles, and exemptions before concluding a warning is needed. Do not assume every diecast model requires one. When an internet safe-harbor warning is appropriate, a warning only inside the delivered box is insufficient. Businesses with fewer than ten employees have an exemption that requires factual review. [OEHHA business guidance](https://www.p65warnings.ca.gov/business-resources/frequently-asked-questions-businesses).
- **Privacy:** California operations alone do not establish CCPA coverage; assess all applicable thresholds. Optional measurement consent, GPC handling, unsubscribe, and privacy-request instructions are present. Verify actual retention and request fulfillment before alleging broken promises. [CPPA applicability FAQ](https://cppa.ca.gov/faq).
- **Accessibility:** No browser or assistive-technology audit was completed. Source includes numerous accessibility controls; there is no confirmed accessibility violation in this review. Legal applicability and a real shopping/support journey need separate assessment. [DOJ guidance](https://www.ada.gov/resources/web-guidance/).
- **Entity and security operations:** Verify that the displayed operator, “KM Venture Group” by default, matches the actual contracting entity. The security-hardening document says its changes are local and undeployed; that document does not establish production protection or an actual breach.

Recommended sequence: resolve findings 1–3 with California consumer counsel, preserve purchase evidence, then complete shipping enforcement and documented marketplace/IP procedures. This review changed no application behavior, policies, payments, or deployments. Only this report was added. Node was unavailable in this shell, so the JavaScript test suite was not run; the isolated SQLite probe above and source tracing are the verification performed.
