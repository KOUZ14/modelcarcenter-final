import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";
import { BusinessDetails, BusinessIdentity } from "@/components/business-details";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Model Car Center collects, uses, discloses, and protects personal information.",
};

export default function PrivacyPage() {
  return <PolicyPage effectiveDate="September 17, 2026" title="Privacy Policy" intro="This Policy explains the personal information Model Car Center collects, why we use it, when we disclose it, and the choices available to you.">
    <h2>1. Scope and who we are</h2>
    <BusinessIdentity/>
    <p>This Privacy Policy applies to the Model Car Center website, marketplace, accounts, seller tools, Model Hunt, support, and related communications (the <b>“Service”</b>). Model Car Center is responsible for the information described here. Independent sellers are separately responsible for information they receive to fulfill orders and must use it only for that purpose and as law permits. Stripe and other services may separately control information you provide directly to them.</p>

    <h2>2. Information we collect</h2>
    <div className="policy-table-wrap"><table><thead><tr><th>Category</th><th>Examples</th><th>Why we use it</th></tr></thead><tbody>
      <tr><td>Identifiers and account data</td><td>Name, email, display name, handle, avatar, authentication and session records</td><td>Create and secure accounts, sign you in, communicate, and provide support</td></tr>
      <tr><td>Order and commercial data</td><td>Cart, wishlist, purchases, Model Hunts, order number, seller, item, price, shipping status, returns and refunds</td><td>Process transactions, fulfill orders, maintain records, personalize account features, and prevent fraud</td></tr>
      <tr><td>Contact and delivery data</td><td>Recipient name, email, shipping address, carrier, tracking number, support messages</td><td>Deliver orders, provide updates, resolve issues, and comply with law</td></tr>
      <tr><td>Seller and listing data</td><td>Business/contact information, selling channels, inventory, payout status, tax or verification status, listings, descriptions, photographs and policies</td><td>Review and onboard sellers, publish listings, route payouts, moderate the marketplace, and meet marketplace obligations</td></tr>
      <tr><td>Payment and payout data</td><td>Stripe customer/session/account identifiers, payment status, transaction amounts, refund and payout readiness</td><td>Route payments and payouts, reconcile transactions, and manage refunds and disputes</td></tr>
      <tr><td>Communications and submissions</td><td>Model Hunt details, application answers, profile biography, newsletter signup, feedback and messages</td><td>Respond to requests, provide requested notices, review applications, and operate community features</td></tr>
      <tr><td>Device, usage and security data</td><td>IP address, browser/device information, request logs, cookie/session identifiers, and security events</td><td>Deliver and secure the Service, diagnose errors, prevent abuse, and maintain availability</td></tr>
      <tr><td>Sponsored placement measurement</td><td>Campaign and listing identifiers, a temporary page-view identifier, recorded impressions and product clicks</td><td>Report campaign delivery to the store and prevent duplicate counts. Stores receive aggregate counts, without collector identities.</td></tr>
    </tbody></table></div>
    <p>We do not receive your full card number, bank account credentials, or identity-verification documents from Stripe. Stripe collects and processes those details under its own privacy notice. Shipping addresses may be considered sensitive personal information in some jurisdictions; we use them only for fulfillment, support, security, and legal compliance.</p>

    <h2>3. Sources of information</h2>
    <p>Sponsored cards send first-party impression and click events. Their temporary identifiers are not stored in cookies or local storage and are not used to follow you across websites. Individual measurement records are scheduled for deletion after seven days; campaign totals and financial records remain. Signed-in store owners are excluded from their own campaign counts. Our normal security request processing also applies to these requests.</p>
    <p>If you use optional address autocomplete, the street address you type is sent to Google Maps to suggest and complete your address. Google&apos;s <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> applies to that processing. Choose manual entry to enter an address without using this service.</p>
    <p>We collect information directly from you; automatically from your browser and device; from sellers and buyers involved in a transaction; from Stripe about checkout, payments, refunds, verification, and payout status; from authentication and email-delivery providers; and from public sources when reasonably needed to review a professional seller application or protect the marketplace.</p>

    <h2>4. How we use information</h2>
    <p>We use personal information to provide and improve the Service; authenticate users; maintain carts, wishlists, accounts, listings, and Model Hunts; process orders, payments, payouts, shipping, returns, and refunds; send transactional and requested messages; review sellers and listings; provide support; detect fraud and security incidents; enforce our terms; keep required business records; comply with legal obligations; and establish, exercise, or defend legal claims. Where consent is the legal basis, you may withdraw it without affecting earlier processing.</p>

    <h2>5. When we disclose information</h2>
    <p>We disclose information only as reasonably necessary to the following recipients:</p>
    <ul>
      <li><b>Sellers and buyers.</b> Sellers receive the buyer and delivery information needed to fulfill and support an order. We may provide buyers with seller identity or contact information when required by law or needed to resolve an issue.</li>
      <li><b>Service providers.</b> OpenAI Sites and Cloudflare support hosting, storage, security, and delivery; Stripe supports checkout, payments, connected accounts, verification, payouts, and refunds; Resend supports email delivery; Shippo and carriers support address validation, shipping labels, insurance, and tracking; Google Maps supplies optional address suggestions when you enable them.</li>
      <li><b>Legal and safety recipients.</b> We may disclose information when we reasonably believe it is required by law, legal process, or a valid government request, or necessary to protect rights, safety, property, users, or the integrity of the Service.</li>
      <li><b>Business transfers.</b> Information may be disclosed in a financing, reorganization, merger, acquisition, or sale, subject to appropriate safeguards and notice where required.</li>
      <li><b>At your direction.</b> We may disclose information when you ask us to or give valid consent.</li>
    </ul>
    <p>We do not sell personal information for money. We do not share personal information for cross-context behavioral advertising, use targeted advertising, or knowingly sell or share personal information of anyone under 18.</p>

    <h2>6. Cookies and local storage</h2>
    <p>We use strictly necessary authentication and security cookies. For guests, local storage keeps cart and wishlist choices on that device. Session storage remembers shipping ZIP, delivery-address drafts, and checkout progress in the current tab; local storage also remembers the necessary-storage notice preference. We do not currently use advertising or analytics cookies. Learn more in our <Link href="/cookies">Cookie &amp; Local Storage Policy</Link>. Because we do not track users across unaffiliated services for advertising, the Service does not currently respond to “Do Not Track” signals. We will honor legally recognized opt-out preference signals if our practices change in a way that requires it.</p>

    <h2>7. Retention</h2>
    <p>We keep personal information only for as long as reasonably necessary for the purposes described above. Account profile, wishlist, cart, and active Model Hunt data are generally kept while the account or request remains active. Seller applications and listing records are kept while needed for review, marketplace integrity, and dispute history. Transaction, payment, tax, refund, and fulfillment records are generally retained for up to seven years after the transaction, or longer when reasonably necessary for a legal hold, dispute, fraud prevention, or applicable law. Security logs, sessions, and failed checkout reservations are retained for shorter periods based on security and operational needs. When retention ends, we delete, de-identify, or aggregate the information.</p>

    <h2>8. Your choices and privacy rights</h2>
    <p>You may update profile and seller information through your account or contact support. You may unsubscribe from marketing email using the link in the message or by contacting us; essential order, security, and account messages will continue when needed. Depending on where you live and subject to legal exceptions, you may have the right to request access, correction, deletion, portability, restriction, objection, or information about our collection and disclosure; withdraw consent; appeal a denied request; or lodge a complaint with a regulator.</p>
    <p>To make a request, email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with the subject “Privacy Request” and describe the request. We will verify your identity using information associated with your account or transactions. An authorized agent may submit a request where permitted, but we may ask for proof of authority and direct identity verification. We will not discriminate against you for exercising a privacy right.</p>

    <p>Collector accounts can be deleted in <Link href="/account?view=profile">My Garage / Profile</Link>. Guests, professional stores, and other requesters can use our <Link href="/privacy/request">data deletion request instructions</Link>. You do not need an account to make a privacy request.</p>

    <h2>9. California disclosures</h2>
    <p>For California residents, the table above describes the categories of personal information collected in the preceding 12 months, the business purposes, and the categories of recipients. Those categories correspond to identifiers, customer records, commercial information, internet or electronic network activity, approximate inferences from preferences and activity, and sensitive information limited to account access and delivery information. We collect these categories from the sources described in Section 3 and retain them under Section 7. We have not sold or shared these categories for cross-context behavioral advertising in the preceding 12 months. If the California Consumer Privacy Act applies to us, California residents may exercise the rights described in Section 8.</p>

    <h2>10. Security</h2>
    <p>We use reasonable administrative, technical, and organizational safeguards designed to protect personal information, including encrypted transport, secure session settings, access controls, server-side authorization, limited collection, and payment handling by Stripe. No storage or transmission system is completely secure. Use a secure email account and tell us promptly if you suspect unauthorized activity.</p>

    <h2>11. Children</h2>
    <p>Accounts, purchases, seller applications, Model Hunts, and email subscriptions are restricted to adults 18 and over. We ask for an adult confirmation without collecting a date of birth. The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has submitted personal information, contact us so we can investigate and delete it as appropriate.</p>

    <h2>12. U.S. processing and changes</h2>
    <p>The Service is operated for the United States, and information may be processed in the United States and other locations where our providers operate. We may update this Policy to reflect changes in law, technology, or the Service. We will post the revised version with a new effective date and provide additional notice or seek consent when required.</p>

    <h2>13. Contact</h2>
    <p>Questions, privacy requests, and complaints may be sent to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.</p>
    <BusinessDetails/>
  </PolicyPage>;
}
