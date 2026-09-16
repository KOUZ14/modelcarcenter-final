import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Contact" };

export default function Page() {
  return (
    <main>
      <SiteHeader />
      <div className="inner-page shell contact-page">
        <p className="eyebrow">Support</p>
        <h1>How can we help?</h1>
        <p>Guest orders are welcome. You don&apos;t need to sign in or create an account for order tracking or support.</p>
        <h2>Track a guest order</h2>
        <p>Check the email you used at checkout for your order confirmation. We&apos;ll send carrier tracking to the same address when it&apos;s available. Use those tracking details to follow your delivery without signing in.</p>
        <h2>Get order help</h2>
        <p>Email us from the address you used at checkout and include your Model Car Center order number from the confirmation email. If the email is missing, check spam first, then contact us with your checkout email and purchase date so we can help locate the order.</p>
        <p>For a Model Hunt, include its reference code.</p>
        <a className="button dark" href={`mailto:${config.supportEmail}`}>Email {config.supportEmail}</a>
      </div>
      <SiteFooter />
    </main>
  );
}
