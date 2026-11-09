import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductDetail } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { productDisplayTitle } from "@/lib/product-presentation";
import type { PublicPreorderOffers } from "./preorder-offer";
import { hasDisclosedDetail } from "@/lib/listing-evidence";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { ProductPurchaseInfo, ProductSellerLine } from "./product-purchase-info";
import { ProductShippingEstimate } from "./product-shipping-estimate";
import { ProductSpecifications } from "./product-specifications";
import { ListingReportButton } from "./listing-report-button";
import "./product-detail.css";

/** The listing itself, shared by the public product route and unsaved draft preview. */
export function ProductListingView({ product, preview = false, preorderOffers, sellerHistory }: { product: ProductDetail; preview?: boolean; preorderOffers?: PublicPreorderOffers; sellerHistory?: ReactNode }) {
  const hasIssues = [product.defects, product.missingParts, product.restorationCustomization].some(hasDisclosedDetail);
  const title = productDisplayTitle(product);
  const preorder = product.availabilityType === "preorder";
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {preview ? <span>Shop</span> : <Link href="/marketplace">Shop</Link>}
      <span aria-hidden="true">/</span><span aria-current="page" title={product.title}>{title}</span>
    </nav>
    <div className="product-detail">
      <header className="product-heading">
        <p className="eyebrow">{product.modelManufacturer} · {product.scale}{preorder && <span className="listing-preorder-badge">Preorder</span>}</p>
        <h1>{title}</h1>
      </header>
      <ProductGallery images={product.images} productName={`${product.modelManufacturer} ${title}`} />
      <aside className="product-summary">
        {!preorder ? <ProductShippingEstimate key={product.id} product={product} preview={preview} /> : preview && <p className="detail-price">{product.priceCents ? formatMoney(product.priceCents, product.currency) : "Price to be announced"}</p>}
        <p className="listing-condition-summary"><strong>Model condition: {formatCondition(product.modelCondition) || "Not specified"}</strong><span>Original box: {formatCondition(product.originalBoxStatus) || "Not specified"}</span><a href="#listing-condition-details">Condition details</a></p>
        {hasIssues && <a className="listing-issues-link" href="#listing-condition-details">Disclosed defects, missing parts or repairs — see condition details</a>}
        {!preorder && <p className="stock-line">{product.availableQuantity < 1 ? "Sold out" : product.availableQuantity === 1 ? "Only 1 available" : `${product.availableQuantity} available`}</p>}
        <ProductPurchase key={product.id} product={product} preview={preview} preorderOffers={preorderOffers} />
        <ProductSellerLine product={product} preview={preview} />
        <ProductPurchaseInfo product={product} />
      </aside>
    </div>
    <ProductSpecifications product={product} preview={preview} sellerHistory={sellerHistory} />
    <ListingReportButton productId={product.id} preview={preview} />
  </>;
}
