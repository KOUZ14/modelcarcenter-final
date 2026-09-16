import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Marketplace Terms",
  description: "Terms governing access to and purchases through Model Car Center.",
};

export default function TermsPage() {
  return <PolicyPage title="Marketplace Terms" intro="These Terms govern your access to Model Car Center and purchases made through our U.S. marketplace. Please read them before using the Service.">
    <h2>1. Agreement to these Terms</h2>
    <p>These Marketplace Terms (the <b>“Terms”</b>) are a binding agreement between you and Model Car Center (<b>“Model Car Center,” “we,” “us,”</b> or <b>“our”</b>) governing the Model Car Center website, accounts, Model Hunt, marketplace checkout, and related services (collectively, the <b>“Service”</b>). By creating an account, submitting information, or completing checkout, you agree to these Terms and acknowledge our <Link href="/privacy">Privacy Policy</Link>. Our <Link href="/shipping">Shipping Policy</Link>, <Link href="/returns">Returns &amp; Refunds Policy</Link>, and any seller policy shown before purchase are incorporated into these Terms.</p>

    <h2>2. Eligibility</h2>
    <p>Optional address suggestions use Google Maps. Use of those suggestions is also subject to the <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps Additional Terms of Service</a>. You can choose manual address entry instead.</p>
    <p>You must be at least 18 years old and legally able to enter a contract to open an account, buy, or sell. The Service is not directed to children under 13. A person between 13 and 17 may browse only under a parent or legal guardian’s supervision; the parent or guardian must conduct any transaction.</p>

    <h2>3. Marketplace role</h2>
    <p>Model Car Center operates a marketplace for collectible model cars supplied and fulfilled by independent professional and individual sellers. Model Car Center is the merchant of record for marketplace checkout: your payment transaction is with us, our name may appear on the receipt or payment statement, and we are responsible for payment support, refunds, and disputes associated with the charge. The identified seller owns the item until sale, sets the item price and seller policy, and is responsible for the listing’s accuracy, lawful supply, packaging, shipment, and conformity. We do not ordinarily take possession of listed items.</p>

    <h2>4. Accounts and security</h2>
    <p>You must provide accurate information, keep access to your email secure, and promptly notify us of suspected unauthorized use. Our passwordless sign-in links are personal, single-use credentials and may not be shared. You are responsible for activity through your account unless caused by our failure to use reasonable security. We may restrict or close accounts used unlawfully or in violation of these Terms. Account deletion removes the profile and sessions but does not erase transaction records we must retain for fulfillment, accounting, disputes, fraud prevention, or legal compliance.</p>

    <h2>5. Listings and item condition</h2>
    <p>Product photographs, condition labels, descriptions, scale, manufacturer, edition details, packaging condition, and other listing information are supplied by the seller. Colors and details may vary with screens and photography. Collectibles may show age, shelf wear, manufacturing variation, or packaging wear when disclosed. Ask support about a material detail before buying if it is not clear from the listing. Sellers warrant that listings are accurate in all material respects and that items are authentic, lawfully owned, and safe to ship, but Model Car Center does not independently authenticate every item.</p>

    <h2>6. Orders, availability, and payment</h2>
    <p>Your cart is not a reservation. Inventory, price, seller status, and shipping are rechecked when checkout starts. A submitted payment is an offer to buy. An order is accepted only when payment is confirmed and an order number is issued. We or the seller may cancel before shipment for inventory error, pricing error, suspected fraud, legal restriction, inability to fulfill, or another legitimate reason; any captured payment for a cancelled item will be refunded to the original payment method.</p>
    <p>Checkout supports one payment for multiple sellers and delivery to configured U.S. destinations. Each seller receives a separate order with its own shipping, tracking, and returns. Stripe processes payment and may apply its own terms. You authorize the displayed charge, including item price, shipping, and any tax shown at checkout. Prices are in U.S. dollars unless clearly stated otherwise. You are responsible for taxes or duties that applicable law requires you to pay and that are not collected at checkout.</p>

    <h2>7. Shipping, delivery, and delays</h2>
    <p>The seller fulfills the order under our <Link href="/shipping">Shipping Policy</Link>. Unless a different handling time is clearly disclosed, sellers must ship within five business days after payment confirmation. Carrier estimates are not guarantees. If an order cannot ship within the promised time—or within 30 days when no time was stated—we will facilitate the notice, consent, cancellation, and refund options required by applicable law.</p>

    <h2>8. Returns, refunds, and cancellations</h2>
    <p>Return eligibility is governed by our <Link href="/returns">Returns &amp; Refunds Policy</Link>, the seller-specific policy displayed before purchase, and non-waivable law. Contact Model Car Center before returning an item. Unauthorized returns, returns sent to the wrong address, or items altered after delivery may be ineligible for a discretionary refund. Nothing in these Terms limits rights that cannot lawfully be limited.</p>

    <h2>9. Model Hunt, wishlists, and community updates</h2>
    <p>Model Hunt is a search and notification service, not a promise that an item will be found, reserved, authentic, or available at a requested price. Wishlists and carts do not reserve inventory. If you opt in to community updates, you may unsubscribe from marketing messages at any time; transactional and security messages may still be sent when necessary to provide the Service.</p>

    <h2>10. Acceptable use</h2>
    <p>You may not: violate law or another person’s rights; submit false, deceptive, infringing, unsafe, or unlawful content; list counterfeit, stolen, recalled, prohibited, or hazardous items; scrape or harvest data; interfere with security or operation; introduce malicious code; bypass access controls or fees; manipulate inventory or transactions; impersonate another person; misuse buyer or seller information; or use the Service to arrange an off-platform transaction intended to avoid marketplace fees. We may investigate, remove content, preserve evidence, and cooperate with lawful requests.</p>

    <h2>11. Content and intellectual property</h2>
    <p>The Service, branding, software, and original content are owned by Model Car Center or its licensors and protected by intellectual-property laws. We grant you a limited, revocable, non-exclusive, non-transferable license to use the Service for its intended purpose. You retain ownership of content you submit and grant us a worldwide, non-exclusive, royalty-free license to host, reproduce, format, display, and distribute it as reasonably necessary to operate, secure, market, and improve the Service. You represent that you have the rights needed to grant this license.</p>

    <h2>12. Third-party services and links</h2>
    <p>The Service may link to or rely on independent services such as Stripe, carriers, seller websites, and email providers. Their services are governed by their own terms and privacy notices. We are not responsible for third-party websites, carrier operations, or content we do not control, although we remain responsible for our own obligations under applicable law.</p>

    <h2>13. Disclaimers</h2>
    <p>TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT UNINTERRUPTED OPERATION, THAT EVERY LISTING IS ACCURATE OR AUTHENTIC, THAT A BUYER OR SELLER WILL COMPLETE A TRANSACTION, OR THAT A COLLECTIBLE WILL MAINTAIN OR INCREASE ITS VALUE. THIS DISCLAIMER DOES NOT APPLY TO EXPRESS PROMISES WE MAKE OR WARRANTIES THAT CANNOT LAWFULLY BE DISCLAIMED.</p>

    <h2>14. Limitation of liability</h2>
    <p>TO THE FULLEST EXTENT PERMITTED BY LAW, MODEL CAR CENTER AND ITS OWNERS, PERSONNEL, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, GOODWILL, OR OPPORTUNITY. OUR AGGREGATE LIABILITY ARISING FROM THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID THROUGH THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR (B) $100. THESE LIMITS DO NOT APPLY TO FRAUD, WILLFUL MISCONDUCT, PERSONAL INJURY CAUSED BY NEGLIGENCE, OR LIABILITY THAT CANNOT LAWFULLY BE LIMITED.</p>

    <h2>15. Disputes and governing law</h2>
    <p>Before filing a formal claim, please email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with a description of the issue and requested resolution and allow 30 days for a response. The laws applicable where Model Car Center is principally established govern these Terms, without regard to conflict-of-law rules. Any court proceeding must be brought in a court with lawful jurisdiction over the parties and dispute. Consumers retain any mandatory rights and venue protections provided by the law of their residence. Either party may bring an eligible claim in small-claims court.</p>

    <h2>16. Changes, suspension, and general terms</h2>
    <p>We may update these Terms prospectively. Material changes will be posted with a new effective date and, when required, additional notice or renewed consent. The version accepted at checkout governs that transaction. We may modify or discontinue features and may suspend access to protect users, comply with law, or enforce these Terms. If any provision is unenforceable, the remaining provisions continue in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them in connection with a reorganization, financing, merger, or sale of the Service. These Terms and incorporated policies are the entire agreement about the Service unless a separate written agreement applies.</p>

    <h2>17. Contact</h2>
    <p>Questions about these Terms or an order may be sent to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.</p>
  </PolicyPage>;
}
