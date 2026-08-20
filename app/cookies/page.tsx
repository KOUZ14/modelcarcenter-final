import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Cookie & Local Storage Policy",
  description: "How Model Car Center uses necessary cookies and browser local storage.",
};

export default function CookiesPage() {
  return <PolicyPage title="Cookie & Local Storage Policy" intro="Model Car Center uses a small amount of browser storage to keep accounts secure and remember guest shopping choices. We do not currently use advertising or analytics cookies.">
    <h2>1. What browser storage is</h2>
    <p>Cookies are small text records a website asks a browser to store and return with later requests. Local storage is information kept by the browser on a device and available to the website that stored it. Similar technologies can perform related functions.</p>

    <h2>2. What we use</h2>
    <div className="policy-table-wrap"><table><thead><tr><th>Technology</th><th>Purpose</th><th>Typical duration</th></tr></thead><tbody>
      <tr><td>Authentication and security cookies</td><td>Keep a signed-in account session, apply secure session controls, and protect account requests.</td><td>Session cookies or up to the account session period, currently 30 days; refreshed sessions may extend that period.</td></tr>
      <tr><td>Guest cart local storage</td><td>Remember products and quantities placed in a guest cart on that browser.</td><td>Until cleared by the user, replaced by account data, or removed through browser settings.</td></tr>
      <tr><td>Guest wishlist local storage</td><td>Remember products saved by a guest on that browser.</td><td>Until cleared by the user, merged into an account, or removed through browser settings.</td></tr>
      <tr><td>Infrastructure and security data</td><td>Our hosting and security providers may process request identifiers and short-lived technical data needed to deliver and protect the Service.</td><td>As set by the provider for security and service delivery.</td></tr>
    </tbody></table></div>

    <h2>3. No advertising or analytics cookies</h2>
    <p>We do not currently use cookies for behavioral advertising, cross-site tracking, or audience analytics. Stripe may use cookies and similar technology on its hosted checkout and onboarding pages under Stripe’s own policy.</p>

    <h2>4. Your controls</h2>
    <p>You can delete cookies and local storage through browser settings. Blocking strictly necessary cookies may prevent sign-in or other secure account features. Clearing local storage removes the guest cart and wishlist from that device. Signed-in account carts and wishlists are stored with the account and can be changed through the Service.</p>

    <h2>5. Changes and contact</h2>
    <p>If we add non-essential cookies, we will update this policy and provide any notice or choice required by law before using them. For more about personal information, read our <Link href="/privacy">Privacy Policy</Link>. Questions may be sent to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.</p>
  </PolicyPage>;
}
