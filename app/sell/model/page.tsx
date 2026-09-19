import type { Metadata } from "next";
import { CollectorListingForm } from "@/components/collector-listing-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import {
  getCollectorShipFromAddresses,
  getGarageData,
  getOwnedProduct,
} from "@/lib/collector-store";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { getPiece } from "@/lib/community";
import { getCatalogProduct } from "@/lib/catalog-products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell a Model", robots: { index: false, follow: false } };

export default async function SellModelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const collector = await requireCollector(`/sell/model?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string,string] => typeof entry[1] === "string"))}`);
  const piece = query.collectionItem ? await getPiece(query.collectionItem, collector.user.id) : null;
  if (query.collectionItem && (!piece || piece.ownerId !== collector.user.id)) notFound();
  const model = piece?.catalogId ? await getCatalogProduct(piece.catalogId) : null;
  const collectionCatalog = model ? { catalogProductId:model.id,modelManufacturer:model.modelManufacturer,vehicleMake:model.vehicleMake,vehicleModel:model.vehicleModel,scale:model.scale,color:model.color,productNumber:model.manufacturerSku } : undefined;
  const collectionReturnTo = piece ? `/collection?${new URLSearchParams({edit:piece.id,selling:query.selling === 'open_to_offers' ? 'open_to_offers' : 'for_sale',minimum:String(Math.max(0,Number(query.minimum)||0))})}` : undefined;
  const initial = query.id ? await getOwnedProduct(collector.user.id, query.id) : null;
  if (query.id && !initial) notFound();
  const [garage, shipFromAddresses] = await Promise.all([
    getGarageData(collector.user.id),
    getCollectorShipFromAddresses(collector.user.id),
  ]);
  const prefill = {
    make: String(query.make ?? "").slice(0, 100),
    model: String(query.model ?? "").slice(0, 120),
    scale: String(query.scale ?? "").slice(0, 30),
    manufacturer: String(query.manufacturer ?? "").slice(0, 100),
  };
  return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell"><CollectorListingForm initial={initial ? { product: initial.product, images: initial.images } : null} seller={garage.seller} shipFromAddresses={shipFromAddresses} displayName={collector.profile.displayName} prefill={prefill} marketplaceFeeBps={config.collectorMarketplaceFeeBps} collectionCatalog={collectionCatalog} collectionReturnTo={collectionReturnTo}/></div><SiteFooter/></main>;
}
