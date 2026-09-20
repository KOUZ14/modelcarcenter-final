import type { Metadata } from "next";
import Link from "next/link";
import { ModelCommunity } from "@/components/model-community";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchase } from "@/components/product-purchase";
import { ProductPurchaseInfo, ProductSellerLine } from "@/components/product-purchase-info";
import { TrackEvent } from "@/components/track-event";
import { listingPhotoEvidence } from "@/lib/listing-evidence";
import { ProductShippingEstimate } from "@/components/product-shipping-estimate";
import { ProductCard } from "@/components/product-card";
import { formatCondition, formatMoney } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SellerReputation } from "@/components/seller-reputation";
import { getSellerReputation } from "@/lib/reputation";
import { additionalShippingPolicy } from "@/lib/shipping-display";

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
  const shippingNote = additionalShippingPolicy(
    product.shippingPolicySummary,
    product.handlingTimeBusinessDays,
  );
  const [related, reputation] = await Promise.all([
    getRelatedProducts(product),
    getSellerReputation(product.sellerId),
  ]);
  const photoEvidence = listingPhotoEvidence(product, product.images);
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
    <main>
      <TrackEvent name="listing_viewed" />
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="inner-page product-page shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/marketplace">Marketplace</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" title={product.title}>{product.title}</span>
        </nav>
        <div className="product-detail">
          <ProductGallery
            images={product.images}
            productName={`${product.modelManufacturer} ${product.title}`}
          />
          <aside className="product-summary">
            <p className="eyebrow">
              {product.scale} · {product.modelManufacturer}
            </p>
            <h1>{product.title}</h1>
            {product.catalogProductId && <p><Link className="text-link" href={`/models/${product.catalogProductId}`}>Compare all sellers of this model</Link></p>}
            {product.conditionNotes && <p><strong>Seller condition notes:</strong> {product.conditionNotes}</p>}
            <p className="vehicle-line">
              {[
                product.vehicleYear,
                product.vehicleMake,
                product.vehicleModel,
                product.color,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {product.availabilityType !== "preorder" && <ProductShippingEstimate key={product.id} product={product} />}
            <p className="stock-line">
              {product.availabilityType === "preorder" ? "Upcoming release · See preorder terms below" : product.availableQuantity < 1 ? "Sold out"
                  : product.availableQuantity === 1
                    ? "Only 1 available"
                    : `${product.availableQuantity} available`}{" "}
              · Model: {formatCondition(product.modelCondition)}
            </p>
            <ProductSellerLine product={product} />
            <ProductPurchase product={product} />
            <ProductPurchaseInfo product={product} />
          </aside>
        </div>
        <section
          className="product-information"
          aria-labelledby="product-information-title"
        >
          <div className="product-information-intro">
            <p className="eyebrow">Model details</p>
            <h2 id="product-information-title">About this model</h2>
            <p>
              {product.description ||
                "The seller has not added a longer description for this model."}
            </p>
          </div>
          <div className="product-specifications">
            <p className="eyebrow">Collector specifications</p>
            <dl className="product-facts">
              <div>
                <dt>Condition</dt>
                <dd>
                  Model: {formatCondition(product.modelCondition)}
                  <br />
                  Packaging: {formatCondition(product.packagingCondition)}
                  <br />
                  Original box: {formatCondition(product.originalBoxStatus)}
                </dd>
              </div>
              <div>
                <dt>Identity</dt>
                <dd>
                  Material: {product.material || "Not specified"}
                  <br />
                  Product no.: {product.productNumber || "Not specified"}
                  <br />
                  Edition / serial: {product.editionSerial || "Not specified"}
                  <br />
                  COA: {formatCondition(product.coaStatus)}
                </dd>
              </div>
              <div>
                <dt>Extras Included</dt>
                <dd>{product.accessories || "Not specified"}</dd>
              </div>
              <div>
                <dt>Disclosures</dt>
                <dd>
                  Missing parts: {product.missingParts || "Not specified"}
                  <br />
                  Defects: {product.defects || "Not specified"}
                  <br />
                  Restoration / customization:{" "}
                  {product.restorationCustomization || "Not specified"}
                </dd>
              </div>
              {product.provenance && (
                <div>
                  <dt>Provenance</dt>
                  <dd>{product.provenance}</dd>
                </div>
              )}
              <div>
                <dt>Photos</dt>
                <dd>
                  {product.availabilityType === "preorder" ? "Preorder photos may show a prototype or manufacturer preview. Read the seller’s description." : photoEvidence.complete
                    ? "Seller-labeled inspection views are available in the photo gallery. Inspect them before buying; labels are supplied by the seller."
                    : <>Additional photo evidence needed: {photoEvidence.missing.join(", ")}. <Link href={`/messages?product=${encodeURIComponent(product.id)}`}>Ask the seller for these views</Link>.</>}
                </dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd>
                  <Link href={`/sellers/${product.sellerSlug}`}>
                    {product.sellerName}
                  </Link>
                  <br />
                  {product.sellerType === "collector"
                    ? "Individual collector"
                    : "Professional seller"}
                </dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>
                  {product.shippingMode === "calculated"
                    ? "Shipping calculated at checkout."
                    : product.shippingMode === "free"
                      ? "Free shipping."
                      : `${formatMoney(product.defaultShippingCents, product.currency)} flat-rate shipping per order.`}
                  <br />
                  Dispatches within {product.handlingTimeBusinessDays} business day
                  {product.handlingTimeBusinessDays === 1 ? "" : "s"}
                  {product.availabilityType === "preorder" ? " after release" : ""}.
                  {shippingNote && (
                    <>
                      <br />
                      {shippingNote}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Returns</dt>
                <dd>
                  {product.returnPolicySummary ||
                    "See the seller's stated return policy before purchase."}
                </dd>
              </div>
            </dl>
          </div>
        </section>
        {reputation && (
          <SellerReputation
            reputation={reputation}
            sellerSlug={product.sellerSlug}
            compact
          />
        )}
        {product.catalogProductId && <ModelCommunity catalogId={product.catalogProductId}/>}
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
