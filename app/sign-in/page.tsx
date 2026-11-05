import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentCollector } from "@/lib/collector-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string; intent?: string; reauth?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/account";
  if (query.reauth !== "1" && await getCurrentCollector()) redirect(returnTo);
  const error = query.error ? "This sign-in link is invalid or expired. Request a new one." : "";
  return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell auth-page">{query.reauth === "1" && <p>{returnTo.startsWith("/admin") ? "For admin access, request a new sign-in link using your authorized admin email." : "Request a new sign-in link using your checkout email to view your receipt."}</p>}<SignInForm returnTo={returnTo} initialError={error} saveOrder={query.intent === "save-order"}/></div><SiteFooter/></main>;
}
