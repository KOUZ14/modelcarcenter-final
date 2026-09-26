import Link from "next/link";
import { formatCondition, formatMoney } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";

export function ProductOtherOffers({ catalogId, offers, totalOffers }: { catalogId: string; offers: ProductSummary[]; totalOffers: number }) {
  if (!offers.length) return null;
  return <section className="product-other-offers" aria-labelledby="other-offers-title">
    <div className="other-offers-heading">
      <div><h2 id="other-offers-title">Other offers for this model</h2><p>Same release. Compare condition, seller and shipping.</p></div>
      <Link className="text-link" href={`/models/${catalogId}#catalog-offers-heading`}>{totalOffers > 1 ? `Compare all ${totalOffers} offers` : "View available offer"}</Link>
    </div>
    <ul className="listing-offer-preview">{offers.slice(0, 3).map(offer => <li key={offer.id}>
      <div className="offer-preview-title"><Link href={`/sellers/${offer.sellerSlug}`}><strong>{offer.sellerName}</strong></Link><strong>{offer.availabilityType === "preorder" && !offer.priceCents ? "Price TBA" : formatMoney(offer.priceCents, offer.currency)}</strong></div>
      <p>{offer.availabilityType === "preorder" ? "Preorder" : "In stock"} · Model: {formatCondition(offer.modelCondition)} · Packaging: {formatCondition(offer.packagingCondition)} · Original box: {formatCondition(offer.originalBoxStatus)}</p>
      <p>{offer.sellerType === "collector" || offer.shippingMode === "calculated" ? "Shipping calculated for your address" : offer.shippingMode === "free" ? "Free shipping" : `${formatMoney(offer.defaultShippingCents, offer.currency)} shipping per seller order`}{offer.availabilityType === "preorder" ? " · See release and dispatch terms" : ` · Dispatch in ${offer.handlingTimeBusinessDays} business day${offer.handlingTimeBusinessDays === 1 ? "" : "s"}`}</p>
      <Link className="offer-preview-link" href={`/products/${offer.slug}`} aria-label={`View offer from ${offer.sellerName}`}>View offer <span aria-hidden="true">→</span></Link>
    </li>)}</ul>
  </section>;
}
