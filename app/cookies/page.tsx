import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Cookie & Local Storage Policy",
  description: "How Model Car Center uses necessary cookies and browser local storage.",
};

export default function CookiesPage() {
  return <PolicyPage effectiveDate="September 18, 2026" title="Cookie & Local Storage Policy" intro="Model Car Center uses a small amount of browser storage to keep accounts secure and remember guest shopping choices. Optional usage measurement is off unless you allow it. We do not use advertising tracking.">
    <h2>1. What browser storage is</h2>
    <p>Cookies are small text records a website asks a browser to store and return with later requests. Local storage is information kept by the browser on a device and available to the website that stored it. Similar technologies can perform related functions.</p>

    <h2>2. What we use</h2>
    <div className="policy-table-wrap"><table><thead><tr><th>Technology</th><th>Purpose</th><th>Typical duration</th></tr></thead><tbody>
      <tr><td>Authentication and security cookies</td><td>Keep a signed-in account session, apply secure session controls, and protect account requests.</td><td>Session cookies or up to the account session period, currently 30 days; refreshed sessions may extend that period.</td></tr>
      <tr><td>Guest cart local storage</td><td>Remember products and quantities placed in a guest cart on that browser.</td><td>Until cleared by the user, replaced by account data, or removed through browser settings.</td></tr>
      <tr><td>Guest wishlist local storage</td><td>Remember products saved by a guest on that browser.</td><td>Until cleared by the user, merged into an account, or removed through browser settings.</td></tr>
      <tr><td>Infrastructure and security data</td><td>Our hosting and security providers may process request identifiers and short-lived technical data needed to deliver and protect the Service.</td><td>As set by the provider for security and service delivery.</td></tr>
      <tr><td>Checkout-return cookies (<code>mcc-checkout-return-*</code>)</td><td>Verify and resume or close a previous Stripe checkout.</td><td>Up to 24 hours.</td></tr>
      <tr><td>Checkout and shipping session storage</td><td>Remember a shipping ZIP code, delivery-address draft, seller shipping choices, and checkout progress in this tab.</td><td>Until the tab is closed or storage is cleared; browser session restoration may restore it.</td></tr>
      <tr><td>Checkout completion markers in local storage</td><td>Prevent purchased items from being removed from a cart more than once.</td><td>Until browser storage is cleared.</td></tr>
      <tr><td>Notice preference (<code>mcc-storage-notice-v1</code>)</td><td>Remember that you dismissed the necessary-storage notice. This does not enable optional tracking.</td><td>Until browser storage is cleared or the notice version changes.</td></tr>
    </tbody></table></div>

    <h2>3. Optional usage measurement</h2>
    <p>Usage measurement is off unless you choose “Allow usage measurement.” The <code>mcc_analytics</code> cookie remembers this choice for up to a year. The <code>mcc-analytics-consent-v1</code> local preference remains until you change it or clear browser storage; an expired cookie stops server-side collection. Completion markers prevent repeat counts within a tab, and device-local setup markers remember setup progress and elapsed time for measurement. These markers stay until browser storage is cleared. We count task steps, results, quantities and elapsed time without recording search text, private form contents, messages, addresses or payment information. Individual event records expire after 90 days. Test activity and identified staff accounts are excluded. Global Privacy Control and Do Not Track disable this optional measurement.</p>
    <p>We measure sponsored listing impressions and clicks with temporary page-view identifiers held in page memory. This measurement does not add advertising cookies, local-storage identifiers, or cross-site tracking. See the <Link href="/privacy">Privacy Policy</Link> for measurement and retention details.</p>
    <p>We do not use behavioral advertising or cross-site tracking. Stripe may use cookies and similar technology on its hosted checkout and onboarding pages under Stripe’s own policy.</p>

    <h2>4. Your controls</h2>
    <p>Choose &ldquo;Continue with necessary only&rdquo; to keep optional measurement off. Reopen Cookie settings in the footer to allow measurement or withdraw your choice. Dismissed help tips are stored on this device and can always be reopened beside the task or in Help.</p>
    <p>You can delete cookies and local storage through browser settings. Blocking strictly necessary cookies may prevent sign-in or other secure account features. Clearing local storage removes the guest cart and wishlist from that device. Signed-in account carts and wishlists are stored with the account and can be changed through the Service.</p>

    <h2>5. Changes and contact</h2>
    <p>If we add non-essential cookies, we will update this policy and provide any notice or choice required by law before using them. For more about personal information, read our <Link href="/privacy">Privacy Policy</Link>. Questions may be sent to <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.</p>
  </PolicyPage>;
}
