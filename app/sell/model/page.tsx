import type { Metadata } from "next";
import { CollectorListingForm } from "@/components/collector-listing-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getGarageData, getOwnedProduct } from "@/lib/collector-store";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell a Model", robots: { index: false, follow: false } };

export default async function SellModelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const collector = await requireCollector("/sell/model");
  const query = await searchParams;
  const initial = query.id ? await getOwnedProduct(collector.user.id, query.id) : null;
  if (query.id && !initial) notFound();
  const garage = await getGarageData(collector.user.id);
  const prefill = {
    make: String(query.make ?? "").slice(0, 100),
    model: String(query.model ?? "").slice(0, 120),
    scale: String(query.scale ?? "").slice(0, 30),
    manufacturer: String(query.manufacturer ?? "").slice(0, 100),
  };
  return <main><SiteHeader/><div className="inner-page shell"><CollectorListingForm initial={initial ? { product: initial.product, images: initial.images } : null} seller={garage.seller} displayName={collector.profile.displayName} prefill={prefill} marketplaceFeeBps={config.collectorMarketplaceFeeBps}/></div><SiteFooter/></main>;
}
