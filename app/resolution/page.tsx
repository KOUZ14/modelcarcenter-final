import type { Metadata } from "next";
import { ResolutionCenter } from "@/components/resolution-center";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getResolutionCenterData } from "@/lib/resolution";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Customer Support",
  description: "Report and resolve Model Car Center order problems.",
  robots: { index: false, follow: false },
};

export default async function ResolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; case?: string }>;
}) {
  const collector = await requireCollector("/resolution");
  const query = await searchParams;
  const data = await getResolutionCenterData(collector.user.id);
  return (
    <main className="resolution-page">
      <SiteHeader />
      <div id="main-content" tabIndex={-1}><ResolutionCenter
        data={data}
        initialOrderId={query.order}
        initialCaseId={query.case}
      /></div>
      <SiteFooter />
    </main>
  );
}
