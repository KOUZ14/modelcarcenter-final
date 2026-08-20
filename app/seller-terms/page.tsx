import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";
import { formatFeePercent } from "@/lib/fees";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seller Terms",
  description: "Terms for professional and individual sellers on Model Car Center.",
};

export default function SellerTermsPage() {
  return <PolicyPage title="Seller Terms" intro="These Seller Terms apply to professional stores and individual collectors who apply, create listings, or sell through Model Car Center.">
    <h2>1. Agreement and relationship to other terms</h2>
    <p>These Seller Terms are a binding agreement between each seller (<b>“Seller”</b> or <b>“you”</b>) and Model Car Center. By applying to sell, starting payout onboarding, or submitting a listing for review, you accept these Seller Terms. The <Link href="/terms">Marketplace Terms</Link>, <Link href="/shipping">Shipping Policy</Link>, <Link href="/returns">Returns &amp; Refunds Policy</Link>, and <Link href="/privacy">Privacy Policy</Link> also apply. If a separate signed seller agreement conflicts with these Seller Terms, the signed agreement controls for that conflict.</p>

    <h2>2. Eligibility and authority</h2>
    <p>You must be at least 18, legally able to contract, located and able to receive payouts in a supported U.S. jurisdiction, and authorized to act for any business you identify. You must provide accurate, complete, current information and maintain a monitored email address. Approval is discretionary and may be conditioned on verification, marketplace fit, inventory quality, or operational readiness.</p>

    <h2>3. Independent seller</h2>
    <p>You are an independent seller, not an employee, agent, partner, franchisee, or representative of Model Car Center. You own or control your inventory, set lawful prices and seller-specific policies, and supply and fulfill the item sold through the marketplace. Model Car Center is the merchant of record for marketplace checkout and is responsible to the buyer for payment support, refunds, and disputes associated with the charge. You remain responsible for your items, listings, fulfillment, expenses, personnel, insurance, permits, licenses, registrations, and taxes. You may not bind Model Car Center or make promises on our behalf.</p>

    <h2>4. Verification and Stripe Connect</h2>
    <p>You must complete Stripe-hosted connected-account onboarding and keep charges and payouts enabled. Stripe may collect identity, business, tax, bank, and compliance information under its own terms. Model Car Center receives account identifiers, capability and payout status, and related transaction data, not your full bank credentials or identity documents. You authorize us and Stripe to route charges, fees, transfers, refunds, reversals, reserves, and dispute adjustments consistent with these Seller Terms.</p>
    <p>You must provide information and certifications reasonably requested to comply with the INFORM Consumers Act, tax reporting, sanctions, anti-fraud, product-safety, or other legal obligations. Where law requires, we may verify and disclose seller identity and contact information and provide a mechanism for consumers to report suspicious activity. Failure to provide or annually certify required information may result in suspension.</p>

    <h2>5. Listings and inventory</h2>
    <p>Each listing must be for a model-car collectible you lawfully own or are authorized to sell and have available for shipment. Listing text, photographs, price, quantity, scale, manufacturer, condition, packaging condition, provenance claims, and material flaws must be accurate and not misleading. Photographs must be your own or properly licensed and should depict the actual item when condition varies. You must promptly update inventory and must not sell an item elsewhere after it is reserved or sold through Model Car Center.</p>

    <h2>6. Prohibited items and conduct</h2>
    <p>You may not list counterfeit, stolen, recalled, illegally imported, unsafe, infringing, or unlawfully modified items; weapons, controlled substances, hazardous materials, or products outside approved marketplace categories; items you do not possess or cannot timely fulfill; undisclosed reproductions; or content that violates privacy, publicity, or intellectual-property rights. You may not manipulate orders, direct buyers off-platform to avoid fees, misuse buyer information, interfere with another seller, or misrepresent affiliation, scarcity, condition, authenticity, or value.</p>

    <h2>7. Review and moderation</h2>
    <p>Listings may remain draft or pending until approved. We may edit formatting, request substantiation, reject or remove a listing, limit visibility, correct an obvious error, or suspend sales to protect users, maintain marketplace quality, or comply with law. Review does not transfer responsibility for the listing to Model Car Center and is not an authentication, appraisal, or legal approval.</p>

    <h2>8. Orders and fulfillment</h2>
    <p>A paid order is a binding sale that you must fulfill at the confirmed price. Unless a longer time is clearly disclosed, you must package the collectible appropriately, tender it to the carrier within five business days, use valid tracking, and ship only to the address in the order record. Do not substitute an item or redirect delivery without documented buyer consent. Contact support immediately if inventory is unavailable, an address issue arises, or shipment will be late. You must comply with the <Link href="/shipping">Shipping Policy</Link> and all shipping-delay, consent, cancellation, and refund requirements.</p>

    <h2>9. Customer service, returns, and refunds</h2>
    <p>You must maintain a clear return-policy summary and honor the policy disclosed before purchase, our <Link href="/returns">Returns &amp; Refunds Policy</Link>, and non-waivable consumer law. You must respond reasonably promptly to support requests and cooperate in investigating loss, damage, authenticity, wrong-item, and material-description claims. You authorize Model Car Center to issue a full refund through marketplace tools when required by your policy, these Seller Terms, law, or a reasonable resolution of a supported claim, and to reverse the related transfer and platform fee. We will consult you when reasonably practicable, but urgent legal, fraud, safety, or payment-network action may occur first.</p>

    <h2>10. Fees and payouts</h2>
    <p>The Model Car Center marketplace fee is <b>{formatFeePercent(config.collectorMarketplaceFeeBps)} of the item subtotal for collector sellers</b> and <b>{formatFeePercent(config.professionalMarketplaceFeeBps)} of the item subtotal for professional stores</b>, excluding separately stated shipping and tax. An eligible professional store that Model Car Center explicitly designates as a founding seller receives a <b>{formatFeePercent(config.foundingSellerMarketplaceFeeBps)} marketplace fee for its first six months</b>; the standard professional rate applies automatically after the recorded promotional end date. Collector sellers are not eligible for the founding-store rate.</p>
    <p><b>Payment processing is charged separately and is not part of the marketplace fee percentages above.</b> Under the current Stripe destination-charge setup, Model Car Center pays Stripe processing fees. Completed order records distinguish the marketplace fee, actual Stripe processing cost when available, and seller proceeds. There are no listing fees, monthly seller fees, marketplace subscription fees, or account-opening fees for V1.</p>
    <p>The marketplace fee is earned when the order is paid. Stripe controls payout availability and timing. Amounts transferred or paid out may be reduced by the marketplace fee, refunds, reversals, disputes, negative balances, legally required withholding, and other adjustments attributable to your transactions. You are responsible for reviewing transaction records and reporting an error promptly.</p>

    <h2>11. Taxes and records</h2>
    <p>You are responsible for determining and meeting your tax, registration, invoicing, product, and reporting obligations, except to the extent applicable law expressly assigns an obligation to Model Car Center or a payment provider. You must provide accurate tax information and keep records required for your business and sales. We may collect, remit, withhold, or report amounts when legally required and may issue tax forms through Stripe or another provider. Nothing we provide is tax advice.</p>

    <h2>12. Buyer information and privacy</h2>
    <p>Buyer names, addresses, emails, order details, and support communications may be used only to fulfill and support the relevant marketplace order, prevent fraud, comply with law, and keep required records. You may not add buyers to marketing lists, contact them for unrelated purposes, sell or share their information, or use it to move future transactions off-platform without separate lawful consent. You must use reasonable security, restrict access, report a suspected breach promptly, and delete buyer information when no longer needed, subject to legal retention duties.</p>

    <h2>13. Seller content license and intellectual property</h2>
    <p>You retain ownership of content you submit and grant Model Car Center a worldwide, non-exclusive, royalty-free license to host, reproduce, crop, format, display, distribute, and promote that content for operating and marketing the Service. The license continues for transaction records and materials already used in marketplace promotion, but otherwise ends within a reasonable time after content removal. You represent that you own or have all necessary rights to the content and that its use will not violate another person’s rights. You must promptly cooperate with legitimate intellectual-property complaints.</p>

    <h2>14. Seller warranties and indemnity</h2>
    <p>You represent and warrant that you will comply with these Seller Terms and applicable law; your information and listings are accurate; items are authentic, lawfully owned, safe to ship, and conform to their descriptions; and your content and sales do not infringe third-party rights. To the fullest extent permitted by law, you will defend, indemnify, and hold harmless Model Car Center and its owners and personnel from third-party claims, losses, penalties, chargebacks, costs, and reasonable legal fees arising from your items, listings, fulfillment, taxes, legal violations, buyer-data misuse, breach of these Seller Terms, or infringement, except to the extent caused by Model Car Center’s own negligence or misconduct.</p>

    <h2>15. Suspension and termination</h2>
    <p>You may stop creating listings and request account closure, but open orders, returns, disputes, fees, and recordkeeping duties survive. We may suspend listings, payouts where legally permitted, or seller access for risk, non-fulfillment, repeated complaints, inaccurate inventory, expired verification, prohibited conduct, legal process, or breach. We may terminate participation on reasonable notice when circumstances permit. Suspension does not eliminate obligations for prior transactions. Provisions that by nature should survive—including fees, records, privacy, warranties, indemnity, limitations, and disputes—remain effective.</p>

    <h2>16. Disclaimers, liability, and disputes</h2>
    <p>The disclaimers, limitation of liability, pre-dispute notice process, governing-law rule, and general provisions in the <Link href="/terms">Marketplace Terms</Link> apply to sellers and are incorporated here. To the fullest extent permitted by law, our aggregate liability arising from seller participation will not exceed the greater of the marketplace fees we retained from your transactions during the 12 months before the event giving rise to the claim or $100. This limit does not apply where liability cannot lawfully be limited.</p>

    <h2>17. Changes and contact</h2>
    <p>We may update these Seller Terms prospectively by posting a new effective date and providing additional notice or renewed consent when required. Material fee changes will not apply retroactively to completed orders. Questions or notices may be sent to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.</p>
  </PolicyPage>;
}
