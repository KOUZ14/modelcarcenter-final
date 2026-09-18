import type { Metadata } from "next";
import {
  MarketplacePage,
  type MarketplaceInitialState,
} from "@/components/marketplace-page";

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
  const sort = valueOf(params.sort);
  const initial: MarketplaceInitialState = {
    q: valueOf(params.q),
    scale: valueOf(params.scale),
    manufacturer: valueOf(params.manufacturer),
    seller: valueOf(params.seller),
    condition: valueOf(params.condition),
    availability: valueOf(params.availability),
    sort:
      sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Math.max(1, Number.parseInt(valueOf(params.page), 10) || 1),
  };
  return <MarketplacePage initial={initial} />;
}
