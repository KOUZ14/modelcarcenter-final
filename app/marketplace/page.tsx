import type { Metadata } from "next";
import {
  MarketplacePage,
  type MarketplaceInitialState,
} from "@/components/marketplace-page";
import { readMarketplaceFilters } from "@/lib/discovery";
import { modelHuntEmailEnabled } from "@/lib/model-hunt-capabilities";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Browse every live model car listing from independent sellers and collectors.",
  alternates: { canonical: "/marketplace" },
};

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initial: MarketplaceInitialState = readMarketplaceFilters({ get: key => valueOf(params[key]) });
  return <MarketplacePage initial={initial} huntEmailEnabled={modelHuntEmailEnabled()} />;
}
