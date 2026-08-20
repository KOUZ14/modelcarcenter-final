import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSellerStorefront } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { formatMoney } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SellerReputation } from "@/components/seller-reputation";
import { getSellerReputation } from "@/lib/reputation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try { const data = await getSellerStorefront((await params).slug); return data ? { title: data.seller.storeName, description: data.seller.description, alternates: { canonical: `/sellers/${data.seller.slug}` } } : { title: "Seller not found" }; } catch { return { title: "Seller" }; }
}

export default async function SellerPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getSellerStorefront((await params).slug);
  if (!data) notFound();
  const reputation = await getSellerReputation(data.seller.id);
  return <main><SiteHeader/><div className="inner-page shell"><nav className="breadcrumbs"><Link href="/marketplace">Marketplace</Link><span>/</span><span>{data.seller.storeName}</span></nav><section className="seller-hero">{data.seller.logoUrl && <Image src={data.seller.logoUrl} alt={`${data.seller.storeName} logo`} width={120} height={120} unoptimized/>}<div><p className="eyebrow">{data.seller.sellerType === "collector" ? "Collector Seller" : "Approved independent seller"}</p><h1>{data.seller.storeName}</h1><p>{data.seller.description}</p>{data.seller.sellerType === "professional" && data.seller.websiteUrl && <a className="text-link" href={data.seller.websiteUrl} rel="noreferrer">Visit seller website</a>}</div></section>{reputation && <SellerReputation reputation={reputation} sellerSlug={data.seller.slug}/>}<section className="policy-grid"><article><h2>Shipping</h2><p>{data.seller.defaultShippingCents ? `${formatMoney(data.seller.defaultShippingCents)} flat shipping per order. ` : "Free seller shipping. "}Ships within {data.seller.handlingTimeBusinessDays} business day{data.seller.handlingTimeBusinessDays === 1 ? "" : "s"}. {data.seller.shippingPolicySummary}</p></article><article><h2>Returns</h2><p>{data.seller.returnPolicySummary || "Contact Model Car Center before returning an order."}</p></article></section><section className="seller-products"><div className="section-heading"><p className="eyebrow">Available now</p><h2>Models from {data.seller.storeName}</h2></div>{data.products.length ? <div className="product-grid">{data.products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="catalog-status">No models are currently available from this seller.</div>}</section></div><SiteFooter/></main>;
}
