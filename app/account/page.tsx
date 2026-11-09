import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getGarageData } from "@/lib/collector-store";
import { refreshCollectorStripe } from "@/lib/listings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Garage",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string; stripe?: string }>;
}) {
  const query = await searchParams;
  const collector = await requireCollector(query.view ? `/account?${new URLSearchParams({view:query.view})}` : "/account");
  let paymentSetup: string | undefined;
  if (query.view === "payments" && collector.seller?.sellerType === "collector" && ["returned", "refresh"].includes(query.stripe ?? "")) {
    paymentSetup = query.stripe;
    try { await refreshCollectorStripe(collector.user.id); }
    catch { paymentSetup = "unavailable"; }
  }
  const data = await getGarageData(collector.user.id);
  return (
    <>
      <SiteHeader searchDisplay="compact" />
      <main id="main-content" tabIndex={-1} className="inner-page shell account-page">
        <AccountDashboard
          initialView={
            query.view ?? (query.new === "1" ? "profile" : "overview")
          }
          data={data}
          profile={collector.profile}
          email={collector.user.email}
          isNew={query.new === "1"}
          paymentSetup={paymentSetup}
        />
      </main>
      <SiteFooter />
    </>
  );
}
