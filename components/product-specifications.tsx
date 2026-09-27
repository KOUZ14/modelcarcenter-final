import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { hasDisclosedDetail, isFactorySealed, listingPhotoEvidence } from "@/lib/listing-evidence";
import { additionalShippingPolicy } from "@/lib/shipping-display";

export function ProductSpecifications({ product, preview = false }: { product: ProductDetail; preview?: boolean }) {
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
    <section className="product-condition-details" id="listing-condition-details" aria-labelledby="listing-condition-title">
      <h2 id="listing-condition-title">Condition of this model</h2>
      <dl className="listing-specs condition-grades">
        {[["Model condition", product.modelCondition], ["Packaging condition", product.packagingCondition], ["Original box", product.originalBoxStatus]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCondition(value) || "Not specified"}</dd></div>)}
      </dl>
      {isFactorySealed(product.packagingCondition) && <p>Factory sealed; hidden contents cannot be inspected.</p>}
      {needsAttention.length > 0 && <div className="condition-disclosures">{needsAttention.map(([label, value]) => <article key={label}><h3>{label}</h3><p>{value?.trim() || "Not disclosed by the seller. Ask before buying; unspecified does not mean defect-free."}</p></article>)}</div>}
      {clear.length > 0 && <p className="condition-clear"><strong>Seller reports:</strong> {clear.map(([label, value]) => `${label}: ${value}`).join(" · ")}</p>}
      {product.conditionNotes && <div className="condition-additional"><h3>Seller condition notes</h3><p>{product.conditionNotes}</p></div>}
      <details className="condition-photo-coverage"><summary>Photo coverage</summary><p>{product.availabilityType === "preorder" ? "Upcoming release: images may be manufacturer previews. Seller dispatch and refund terms are shown in the preorder offer." : evidence.complete ? "Required views are labeled. View labels indicate coverage, not an independent condition inspection." : `Required views not labeled: ${evidence.missing.join(", ")}. View labels indicate coverage, not an independent condition inspection.`}</p></details>
    </section>
    <section className="product-information" aria-labelledby="product-information-title">
      <div className="product-information-intro"><h2 id="product-information-title">About this model</h2>
        {product.description && <p>{product.description}</p>}
        <p className="vehicle-line">{[product.vehicleYear, product.vehicleMake, product.vehicleModel, product.color].filter(Boolean).join(" · ")}</p>
        {product.provenance && <><h3>Ownership history</h3><p>{product.provenance}</p></>}
      </div>
      <div className="product-specifications"><h3>Specifications &amp; included items</h3>
        <dl className="listing-specs">{[["Scale", product.scale], ["Model brand", product.modelManufacturer], ...(product.material ? [["Material", formatCondition(product.material)]] : []), ...included].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not specified"}</dd></div>)}</dl>
        {minor.length > 0 && <p className="listing-minor-details">{minor.join(" · ")}</p>}
      </div>
    </section>
    <section className="product-seller-details" aria-labelledby="listing-seller-title">
      <h2 id="listing-seller-title">About the seller</h2>
      <div className="product-seller-grid">
        <article><h3>{preview ? product.sellerName : <Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link>}</h3>
          <p>{product.sellerDescription || "Seller introduction not provided."}</p>
          {product.sellerSpecialty && <p><strong>Specialties:</strong> {product.sellerSpecialty}</p>}
        </article>
        <article><h3>How your model is packed</h3><p>{product.sellerPackingApproach || "The seller has not added packing details."}</p></article>
      </div>
      <div className="product-shipping-details"><h3>Shipping &amp; dispatch</h3>
        {(product.shippingOriginRegion || product.shippingOriginCountry) && <p>Ships from {[product.shippingOriginRegion, product.shippingOriginCountry].filter(Boolean).join(", ")}.</p>}
        <p>{product.sellerType === "collector" || product.shippingMode === "calculated" ? "Shipping is calculated for your delivery address before payment." : product.shippingMode === "free" ? "Free shipping under the seller’s shipping terms." : `${formatMoney(product.defaultShippingCents, product.currency)} flat-rate shipping per order from this seller.`} Dispatches within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. Carrier transit time is additional.</p>
        {shippingNote && <p>{shippingNote}</p>}
      </div>
    </section>
  </>;
}
