import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductDetail } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { hasDisclosedDetail, isFactorySealed, listingPhotoEvidence } from "@/lib/listing-evidence";
import { additionalShippingPolicy } from "@/lib/shipping-display";
import { ProductPurchaseInfo } from "./product-purchase-info";

export function ProductSpecifications({ product, preview = false, sellerHistory }: { product: ProductDetail; preview?: boolean; sellerHistory?: ReactNode }) {
  const evidence = listingPhotoEvidence(product, product.images);
  const shippingNote = additionalShippingPolicy(product.shippingPolicySummary, product.handlingTimeBusinessDays);
  const disclosures = [["Missing parts", product.missingParts], ["Defects and wear", product.defects], ["Restoration / customization", product.restorationCustomization]];
  const needsAttention = disclosures.filter(([, value]) => !value?.trim() || value.toLowerCase() === "not sure" || hasDisclosedDetail(value));
  const clear = disclosures.filter(([, value]) => value?.trim() && value.toLowerCase() !== "not sure" && !hasDisclosedDetail(value));
  const included = [
    ["Manufacturer reference", product.productNumber], ["Edition / serial", product.editionSerial],
    ["Certificate of authenticity", product.coaStatus === "included" ? "Included" : ""],
    ["Included accessories", hasDisclosedDetail(product.accessories) ? product.accessories : ""],
  ].filter(([, value]) => value?.trim());
  const minor = [
    product.coaStatus && product.coaStatus !== "included" ? `Certificate of authenticity: ${formatCondition(product.coaStatus)}` : "",
    product.accessories && !hasDisclosedDetail(product.accessories) ? `Accessories: ${product.accessories}` : "",
  ].filter(Boolean);
  return <>
    <section className="product-model-details" aria-labelledby="listing-model-title">
      <h2 id="listing-model-title">Model details &amp; condition</h2>
      {product.description && <p className="product-description">{product.description}</p>}
      <div className="product-condition-details" id="listing-condition-details" aria-labelledby="listing-condition-title">
      <h3 id="listing-condition-title">Condition of this model</h3>
      {product.modelCondition === "new" && <p>{isFactorySealed(product.packagingCondition) ? "New and factory sealed. Hidden contents have not been inspected." : "New: unused and never displayed. May have been opened for inspection or photos."} Review the seller’s disclosures below.</p>}
      <dl className="listing-specs condition-grades">
        {[["Model condition", product.modelCondition], ["Packaging condition", product.packagingCondition], ["Original box", product.originalBoxStatus]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCondition(value) || "Not specified"}</dd></div>)}
      </dl>
      {product.modelCondition !== "new" && isFactorySealed(product.packagingCondition) && <p>Factory sealed; hidden contents cannot be inspected.</p>}
      {needsAttention.length > 0 && <div className="condition-disclosures">{needsAttention.map(([label, value]) => <article key={label}><h3>{label}</h3><p>{value?.trim() || "Not disclosed by the seller. Ask before buying; unspecified does not mean defect-free."}</p></article>)}</div>}
      {clear.length > 0 && <p className="condition-clear"><strong>Seller reports:</strong> {clear.map(([label, value]) => `${label}: ${value}`).join(" · ")}</p>}
      {product.conditionNotes && <div className="condition-additional"><h3>Seller condition notes</h3><p>{product.conditionNotes}</p></div>}
      <details className="condition-photo-coverage"><summary>Photo coverage</summary><p>{product.availabilityType === "preorder" ? "Upcoming release: images may be manufacturer previews. Seller dispatch and refund terms are shown in the preorder offer." : evidence.complete ? "Required views are labeled. View labels indicate coverage, not an independent condition inspection." : `Required views not labeled: ${evidence.missing.join(", ")}. View labels indicate coverage, not an independent condition inspection.`}</p></details>
    </div>
    <div className="product-information" aria-labelledby="product-information-title">
      <div className="product-information-intro"><h3 id="product-information-title">About this model</h3>
        <p className="vehicle-line">{[product.vehicleYear, product.vehicleMake, product.vehicleModel, product.color].filter(Boolean).join(" · ")}</p>
        {product.provenance && <><h3>Ownership history</h3><p>{product.provenance}</p></>}
      </div>
      <div className="product-specifications"><h3>Specifications &amp; included items</h3>
        <dl className="listing-specs">{[["Scale", product.scale], ["Model brand", product.modelManufacturer], ...(product.material ? [["Material", formatCondition(product.material)]] : []), ...included].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not specified"}</dd></div>)}</dl>
        {minor.length > 0 && <p className="listing-minor-details">{minor.join(" · ")}</p>}
      </div>
    </div>
    </section>
    <section className="product-delivery-details" id="listing-shipping" aria-labelledby="listing-shipping-title">
      <h2 id="listing-shipping-title">{product.availabilityType === "preorder" ? "Shipping, returns & preorder terms" : "Shipping & returns"}</h2>
      {(product.shippingOriginRegion || product.shippingOriginCountry) && <p>Ships from {[product.shippingOriginRegion, product.shippingOriginCountry].filter(Boolean).join(", ")}.</p>}
      <p>{product.sellerType === "collector" || product.shippingMode === "calculated" ? product.availabilityType === "preorder" ? "Shipping is calculated for your delivery address before balance payment." : "Shipping is calculated for your delivery address before payment." : product.shippingMode === "free" ? "Free shipping under the seller’s shipping terms." : `${formatMoney(product.defaultShippingCents, product.currency)} flat-rate shipping per order from this seller.`} Dispatches within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. Carrier transit time is additional.</p>
      {shippingNote && <p>{shippingNote}</p>}
      {product.availabilityType === "preorder" && <p>The expected ship date, payment schedule and cancellation terms are shown in the <a href="#listing-preorder">preorder offer</a>.</p>}
      <ProductPurchaseInfo product={product} full/>
    </section>
    <section className="product-seller-details" aria-labelledby="listing-seller-title">
      <h2 id="listing-seller-title">Seller information</h2>
      <div className="product-seller-grid">
        <article><h3>{preview ? product.sellerName : <Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link>}</h3>
          <p>{product.sellerDescription || "Seller introduction not provided."}</p>
          {product.sellerSpecialty && <p><strong>Specialties:</strong> {product.sellerSpecialty}</p>}
        </article>
        <article><h3>How your model is packed</h3><p>{product.sellerPackingApproach || "The seller has not added packing details."}</p></article>
      </div>
      {sellerHistory}
    </section>
  </>;
}
