import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy & data deletion requests" };

export default function PrivacyRequestPage() {
  const email = `mailto:${config.supportEmail}?subject=${encodeURIComponent("Privacy Request - data deletion")}&body=${encodeURIComponent("Please delete my personal information associated with this email address.\n\nRelevant order or Model Hunt reference (optional):\n\nPlease confirm receipt and explain any records that must be retained.")}`;
  return <PolicyPage title="Privacy & data deletion requests" intro="Request access, correction, a copy of your data, or deletion without creating an account.">
    <h2>Delete a collector account</h2><p>In <Link href="/account?view=profile">My Garage → Profile</Link>, open Delete account and follow the confirmation. This removes your profile, sessions, cart, wishlist, Model Hunts, and optional email subscriptions, and deactivates your listings. Professional stores should contact support to close or transfer the store.</p>
    <h2>Guest data and other privacy requests</h2><p>Email us from the address you used on the site. Include an order or Model Hunt reference if relevant and say what you want us to do. Do not send passwords, card numbers, bank details, or identity documents. We may ask for limited verification before releasing or deleting information.</p><p><a className="text-link" href={email}>Email a data deletion request</a></p><p>You can also send an access, correction, or other privacy request directly to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with the subject “Privacy Request”. The link opens your email app; your request is sent only when you send that email.</p>
    <h2>Records we may need to retain</h2><p>Order, payment, seller, shipping, support-case, and dispute records may be retained for fulfillment, accounting, fraud prevention, and legal obligations. We will explain applicable exceptions when handling your request. See the <Link href="/privacy">Privacy Policy</Link> for retention details.</p>
    <h2>Children’s information</h2><p>Accounts, purchases, selling, and email signups are for adults 18 and over. If a child has submitted information, a parent or guardian can use the same contact route to request its removal.</p>
  </PolicyPage>;
}
