import type { Metadata } from "next";
import { ModelCommunity } from "@/components/model-community";
import { notFound } from "next/navigation";
import { getCatalogListings, getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { TrackEvent } from "@/components/track-event";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SellerReputation } from "@/components/seller-reputation";
import { getSellerReputation } from "@/lib/reputation";
import { ProductListingView } from "@/components/product-listing-view";
import { ProductOtherOffers } from "@/components/product-other-offers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const product = await getProductBySlug((await params).slug);
    if (!product) return { title: "Model not found" };
    const title = `${product.title} ${product.scale} by ${product.modelManufacturer}`;
    return {
      title,
      description:
        product.description ||
        `${product.scale} ${product.vehicleMake} ${product.vehicleModel} available from ${product.sellerName}.`,
      alternates: { canonical: `/products/${product.slug}` },
      openGraph: {
        title,
        description: product.description,
        images: product.primaryImageUrl ? [product.primaryImageUrl] : undefined,
      },
    };
  } catch {
    return { title: "Model car" };
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const [related, reputation, catalogOffers] = await Promise.all([
    getRelatedProducts(product),
    getSellerReputation(product.sellerId),
    product.catalogProductId ? getCatalogListings(product.catalogProductId) : Promise.resolve(null),
  ]);
  const otherOffers = catalogOffers?.listings.filter(offer => offer.id !== product.id) ?? [];
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images.map((image) => image.url),
    description: product.description,
    sku: product.sellerSku,
    brand: { "@type": "Brand", name: product.modelManufacturer },
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency.toUpperCase(),
      price: (product.priceCents / 100).toFixed(2),
      availability: product.availabilityType === "preorder" ? "https://schema.org/PreOrder" : product.availableQuantity < 1 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: product.sellerName },
    },
  };
  return (
    <main className="product-detail-page">
      <TrackEvent name="listing_viewed" />
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="inner-page product-page shell">
        <ProductListingView product={product} />
        {product.catalogProductId && <ProductOtherOffers catalogId={product.catalogProductId} offers={otherOffers} totalOffers={catalogOffers?.listings.length ?? 0} />}
        {reputation && (
          <SellerReputation
            reputation={reputation}
            sellerSlug={product.sellerSlug}
            compact
          />
        )}
        {related.length > 0 && (
          <section className="related-section">
            <div className="section-heading">
              <p className="eyebrow">Keep browsing</p>
              <h2>Similar models</h2>
            </div>
            <div className="product-grid">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
        {product.catalogProductId && <ModelCommunity catalogId={product.catalogProductId} preview />}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replaceAll("<", "\\u003c"),
        }}
      />
      <SiteFooter />
    </main>
  );
}
