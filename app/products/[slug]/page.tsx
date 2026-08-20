import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchase } from "@/components/product-purchase";
import { ProductCard } from "@/components/product-card";
import { formatCondition, formatMoney } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

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
  const related = await getRelatedProducts(product);
  const photoChecklistComplete = [
    product.photoFrontChecked,
    product.photoRearChecked,
    product.photoSidesChecked,
    product.photoBaseChecked,
    product.photoPackagingChecked,
    product.photoIssuesChecked,
  ].every(Boolean);
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
      availability:
        product.availableQuantity > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.sellerName },
    },
  };
  return (
    <main>
      <SiteHeader />
      <div className="inner-page product-page shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/marketplace">Marketplace</Link>
          <span>/</span>
          <span>{product.title}</span>
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
            <p className="detail-price">
              {formatMoney(product.priceCents, product.currency)}
            </p>
            <p className="stock-line">
              {product.availableQuantity === 1
                ? "Only 1 available"
                : `${product.availableQuantity} available`}{" "}
              · Model: {formatCondition(product.modelCondition)}
            </p>
            <ProductPurchase product={product} />
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
                <dt>Included</dt>
                <dd>{product.accessories || "Not specified"}</dd>
              </div>
              <div>
                <dt>Disclosures</dt>
                <dd>
                  <b>Missing parts:</b> {product.missingParts || "Not specified"}
                  <br />
                  <b>Defects:</b> {product.defects || "Not specified"}
                  <br />
                  <b>Restoration / customization:</b>{" "}
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
                  {photoChecklistComplete
                    ? "Required collector inspection views confirmed"
                    : "Legacy listing; ask for any additional inspection view you need"}
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
                  {product.defaultShippingCents
                    ? `${formatMoney(product.defaultShippingCents, product.currency)} flat shipping`
                    : "Free seller shipping"}
                  <br />
                  {product.shippingPolicySummary}
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
            <div className="product-description">
              <h2>About this model</h2>
              <p>
                {product.description ||
                  "The seller has not added a longer description for this model."}
              </p>
            </div>
          </aside>
        </div>
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
