import type { Metadata } from "next";
import Link from "next/link";
import { StoreDashboard } from "@/components/store-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getStoreDashboardData } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Store Console",
  robots: { index: false, follow: false },
};

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; edit?: string }>;
}) {
  const account = await requireCollector("/store");
  const query = await searchParams;
  const data = await getStoreDashboardData(account.user.id);
  if (!data)
    return (
      <main>
        <SiteHeader />
        <div className="inner-page shell store-access-empty">
          <p className="eyebrow">Store Console</p>
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
      initialView={query.view ?? "overview"}
      initialProductId={query.edit}
      email={account.user.email}
    />
  );
}
