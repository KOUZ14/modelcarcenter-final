import type { Metadata } from "next";
import Link from "next/link";
import { StoreDashboard } from "@/components/store-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getStoreDashboardData } from "@/lib/store";
import { SellerMessages } from "@/components/seller-messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seller Hub",
  robots: { index: false, follow: false },
};

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; edit?: string; filter?: string; preorder?: string; conversation?: string; thread?: string; tab?: string }>;
}) {
  const query = await searchParams;
  const returnParams=new URLSearchParams();
  for(const key of ["view","edit","filter","preorder","conversation","thread","tab"] as const)if(query[key])returnParams.set(key,query[key]);
  const account = await requireCollector(returnParams.size ? `/store?${returnParams}` : "/store");
  const data = await getStoreDashboardData(account.user.id);
  if (!data)
    return (
      <main>
        <SiteHeader />
        <div id="main-content" tabIndex={-1} className="inner-page shell store-access-empty">
          <p className="eyebrow">Seller Hub</p>
          <h1>No store is connected to this account.</h1>
          <p>
            Sign in with the verified contact email on an approved professional
            seller record. If your store has not applied yet, start with the
            seller application.
          </p>
          <div className="row-actions">
            <Link className="button dark" href="/sell">
              Apply as a seller
            </Link>
            <Link className="button outline" href="/contact">
              Contact support
            </Link>
          </div>
        </div>
        <SiteFooter />
      </main>
    );
  return (
    <StoreDashboard
      data={data}
      initialView={query.view ?? (query.edit ? "inventory" : "overview")}
      initialProductId={query.edit}
      initialPreorderId={query.preorder}
      initialFilter={query.filter}
      email={account.user.email}
      messages={query.view === "messages" ? <SellerMessages userId={account.user.id} conversation={query.conversation} thread={query.thread} tab={query.tab}/> : undefined}
    />
  );
}
