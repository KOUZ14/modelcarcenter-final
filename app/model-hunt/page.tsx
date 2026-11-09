import Link from "next/link";
import { ModelHuntForm } from "@/components/model-hunt-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { modelHuntPrefill, marketplaceHref, readMarketplaceFilters } from "@/lib/discovery";
import { modelHuntEmailEnabled } from "@/lib/model-hunt-capabilities";
import "@/components/discovery.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start a Model Hunt" };

export default async function ModelHuntPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const params = { get: (name: string) => Array.isArray(values[name]) ? values[name][0] ?? "" : values[name] ?? "" };
  const prefill = modelHuntPrefill(params);
  return <><SiteHeader /><main id="main-content" tabIndex={-1} className="hunt-page shell">
    <Link className="text-link" href={marketplaceHref(readMarketplaceFilters(params))}>← Back to your search</Link>
    <h1>Start a Model Hunt</h1>
    <p>{prefill.vehicleModel || prefill.preferredScale || prefill.modelManufacturer ? "We've carried over your search and filters. Review them below; add only the details that matter to you." : "Save the model you're looking for, even if no seller has it available yet."}</p>
    <ModelHuntForm initial={prefill} emailAlertsEnabled={modelHuntEmailEnabled()} />
  </main><SiteFooter /></>;
}
