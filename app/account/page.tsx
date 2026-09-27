import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getGarageData } from "@/lib/collector-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Garage",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string }>;
}) {
  const query = await searchParams;
  const collector = await requireCollector(query.view ? `/account?${new URLSearchParams({view:query.view})}` : "/account");
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
        />
      </main>
      <SiteFooter />
    </>
  );
}
