import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentCollector } from "@/lib/collector-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/account";
  if (await getCurrentCollector()) redirect(returnTo);
  const error = query.error ? "This sign-in link is invalid or expired. Request a new one." : "";
  return <main><SiteHeader/><div className="inner-page shell auth-page"><SignInForm returnTo={returnTo} initialError={error}/></div><SiteFooter/></main>;
}
