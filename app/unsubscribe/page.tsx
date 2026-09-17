import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  return <PolicyPage title={done === "1" ? "You’re unsubscribed" : "Email preferences"} intro="You control optional emails from Model Car Center.">
    {done === "1" ? <p role="status">Community updates, Model Hunt emails, and restock alerts for this email address have been stopped. You can subscribe again whenever you choose.</p> : token ? <form action="/api/unsubscribe" method="post"><input type="hidden" name="token" value={token.slice(0, 256)}/><p>Stop all community updates, Model Hunt emails, and restock alerts associated with this link. No sign-in is required.</p><button className="button dark" type="submit">Unsubscribe from optional emails</button></form> : <p>Use the unsubscribe link in an email, or email <a href={`mailto:${config.supportEmail}?subject=Unsubscribe`}>{config.supportEmail}</a> from the address you want removed.</p>}
    <p>Necessary sign-in, order, shipping, security, and support messages will still arrive when needed.</p>
  </PolicyPage>;
}
