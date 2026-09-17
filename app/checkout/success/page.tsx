import type { Metadata } from "next";
import { CheckoutSuccess } from "@/components/checkout-success";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };
export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) { const sessionId = (await searchParams).session_id ?? ""; return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell"><CheckoutSuccess sessionId={sessionId}/></div><SiteFooter/></main>; }
