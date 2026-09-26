import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { hasDisclosedDetail } from "@/lib/listing-evidence";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { ProductPurchaseInfo, ProductSellerLine } from "./product-purchase-info";
import { ProductShippingEstimate } from "./product-shipping-estimate";
import { ProductSpecifications } from "./product-specifications";
import { ListingReportButton } from "./listing-report-button";
import "./product-detail.css";

/** The listing itself, shared by the public product route and unsaved draft preview. */
export function ProductListingView({ product, preview = false }: { product: ProductDetail; preview?: boolean }) {
  const hasIssues = [product.defects, product.missingParts, product.restorationCustomization].some(hasDisclosedDetail);
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {preview ? <span>Shop</span> : <Link href="/marketplace">Shop</Link>}
      <span aria-hidden="true">/</span><span aria-current="page" title={product.title}>{product.title}</span>
    </nav>
    <div className="product-detail">
      <ProductGallery images={product.images} productName={`${product.modelManufacturer} ${product.title}`} />
      <aside className="product-summary">
        <p className="eyebrow">{product.scale} · {product.modelManufacturer}</p>
        <h1>{product.title}</h1>
        {product.availabilityType !== "preorder" ? <ProductShippingEstimate key={product.id} product={product} preview={preview} /> : <p className="detail-price">{product.priceCents ? formatMoney(product.priceCents, product.currency) : "Price to be announced"}</p>}
        <p className="listing-condition-summary"><strong>Model condition: {formatCondition(product.modelCondition) || "Not specified"}</strong><br />Original box: {formatCondition(product.originalBoxStatus) || "Not specified"}</p>
        {hasIssues && <a className="listing-issues-link" href="#listing-condition-details">Disclosed defects, missing parts or repairs — see condition details</a>}
        <p className="stock-line">{product.availabilityType === "preorder" ? "Upcoming release · See preorder terms below" : product.availableQuantity < 1 ? "Sold out" : product.availableQuantity === 1 ? "Only 1 available" : `${product.availableQuantity} available`}</p>
        <ProductPurchase key={product.id} product={product} preview={preview} />
        <ProductSellerLine product={product} preview={preview} />
        <ProductPurchaseInfo product={product} />
        <ListingReportButton productId={product.id} preview={preview} />
      </aside>
    </div>
    <ProductSpecifications product={product} preview={preview} />
  </>;
}
