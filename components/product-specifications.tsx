import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { isFactorySealed, listingPhotoEvidence } from "@/lib/listing-evidence";
import { additionalShippingPolicy } from "@/lib/shipping-display";

export function ProductSpecifications({ product }: { product: ProductDetail }) {
  const evidence = listingPhotoEvidence(product, product.images);
  const shippingNote = additionalShippingPolicy(product.shippingPolicySummary, product.handlingTimeBusinessDays);
  const optional = [
    ["Product number", product.productNumber],
    ["Edition / serial", product.editionSerial],
    ["Certificate of authenticity", product.coaStatus === "not_specified" ? "" : formatCondition(product.coaStatus)],
    ["Accessories included", product.accessories],
    ["Provenance", product.provenance],
  ];
  const unspecified = optional.filter(([, value]) => !value?.trim()).map(([label]) => label);
  const disclosures = [
    ["Missing parts", product.missingParts],
    ["Defects", product.defects],
    ["Restoration / customization", product.restorationCustomization],
  ];
  const undisclosed = disclosures.filter(([, value]) => !value?.trim()).map(([label]) => label);

  return <section className="product-information" aria-labelledby="product-information-title">
    <div className="product-information-intro">
      <p className="eyebrow">Model details</p>
      <h2 id="product-information-title">About this model</h2>
      <p>{product.description || "The seller has not added a longer description for this model."}</p>
      <p className="vehicle-line">{[product.vehicleYear, product.vehicleMake, product.vehicleModel, product.color].filter(Boolean).join(" · ")}</p>
    </div>
    <div className="product-specifications">
      <h3>Specifications</h3>
      <dl className="listing-specs">
        {[
          ["Scale", product.scale], ["Model brand", product.modelManufacturer],
          ["Material", formatCondition(product.material)], ["Model condition", formatCondition(product.modelCondition)],
          ["Packaging", formatCondition(product.packagingCondition)], ["Original box", formatCondition(product.originalBoxStatus)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not specified"}</dd></div>)}
      </dl>
      <div className="listing-disclosures">
        <section aria-labelledby="listing-disclosures-title">
          <h3 id="listing-disclosures-title">Condition disclosures</h3>
          {isFactorySealed(product.packagingCondition) && <p>Factory sealed; hidden contents cannot be inspected.</p>}
          {disclosures.filter(([, value]) => value?.trim()).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
          {undisclosed.length > 0 && <p><strong>Not disclosed by the seller:</strong> {undisclosed.join(", ")}. Unspecified does not mean defect-free. <Link href={`/messages?product=${encodeURIComponent(product.id)}`}>Ask the seller before buying</Link>.</p>}
        </section>
        <section aria-labelledby="listing-included-title">
          <h3 id="listing-included-title">Identity &amp; included items</h3>
          {optional.filter(([, value]) => value?.trim()).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
          {unspecified.length > 0 && <p className="unspecified-details"><strong>Not specified:</strong> {unspecified.join(", ")}.</p>}
        </section>
        <section aria-labelledby="listing-photos-title">
          <h3 id="listing-photos-title">Photo coverage</h3>
          <p>{product.availabilityType === "preorder" ? "Upcoming release: images may be manufacturer previews. Seller dispatch and refund terms are shown in the preorder offer." : evidence.complete
            ? "Required views are labeled. View labels indicate coverage, not an independent condition inspection."
            : <>Required views not labeled: {evidence.missing.join(", ")}. View labels indicate coverage, not an independent condition inspection. <Link href={`/messages?product=${encodeURIComponent(product.id)}`}>Ask the seller for these views</Link>.</>}</p>
        </section>
        <section aria-labelledby="listing-shipping-title">
          <h3 id="listing-shipping-title">Shipping &amp; dispatch</h3>
          <p>{product.sellerType === "collector" || product.shippingMode === "calculated" ? "Shipping is calculated for your delivery address before payment." : product.shippingMode === "free" ? "Free shipping under the seller's shipping terms." : `${formatMoney(product.defaultShippingCents, product.currency)} flat-rate shipping per order from this seller.`} Dispatches within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. Carrier transit time is additional.</p>
          {shippingNote && <p>{shippingNote}</p>}
        </section>
      </div>
    </div>
  </section>;
}
