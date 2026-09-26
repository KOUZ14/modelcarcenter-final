import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSellerStorefront } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontInventory } from "@/components/storefront-inventory";
import { getSellerReputation, type SellerReputation } from "@/lib/reputation";
import { additionalShippingPolicy } from "@/lib/shipping-display";
import { activeProtectionPolicy } from "@/lib/protection";
import { publicProfileText, readStorefrontFilters, sellerBioExcerpt, sellerSinceLabel } from "@/lib/storefront";
import "@/components/storefront.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const data = await getSellerStorefront((await params).slug);
    return data ? { title: data.seller.storeName, description: publicProfileText(data.seller.description, "description"), alternates: { canonical: `/sellers/${data.seller.slug}` } } : { title: "Seller not found" };
  } catch { return { title: "Seller" }; }
}

export default async function SellerPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const filters = readStorefrontFilters({ get: key => typeof values[key] === "string" ? values[key] : null });
  const data = await getSellerStorefront((await params).slug, filters);
  if (!data) notFound();
  const { seller, catalog, scales } = data;
  const reputation = await getSellerReputation(seller.id);
  const bio = publicProfileText(seller.description, "description");
  const shortBio = sellerBioExcerpt(bio);
  const specialty = publicProfileText(seller.specialty, "specialty");
  const packing = publicProfileText(seller.packingApproach, "packing_approach");
  const location = [publicProfileText(seller.shippingOriginRegion, "shipping_origin_region"), publicProfileText(seller.shippingOriginCountry, "shipping_origin_country")].filter(Boolean).join(", ");
  const shippingMode = seller.sellerType === "collector" ? "calculated" : seller.shippingMode;
  const shipping = shippingMode === "calculated" ? "Shipping calculated at checkout" : shippingMode === "free" || seller.defaultShippingCents === 0 ? "Free shipping" : `${formatMoney(seller.defaultShippingCents)} per order`;
  const dispatch = `dispatch within ${seller.handlingTimeBusinessDays} business day${seller.handlingTimeBusinessDays === 1 ? "" : "s"}`;
  const shippingNote = additionalShippingPolicy(publicProfileText(seller.shippingPolicySummary, "shipping_policy_summary"), seller.handlingTimeBusinessDays);
  const returns = publicProfileText(seller.returnPolicySummary, "return_policy_summary");
  const since = reputation ? sellerSinceLabel(reputation.sellerSince) : "";

  return <main className="storefront-route"><SiteHeader/>
    <div id="main-content" tabIndex={-1} className="inner-page shell storefront-shell">
      <nav className="breadcrumbs storefront-breadcrumbs" aria-label="Breadcrumb"><Link href="/marketplace">Shop</Link><span>/</span><span>{seller.storeName}</span></nav>
      <header className="storefront-intro">
        <div className="storefront-identity">
          {seller.logoUrl && <Image src={seller.logoUrl} alt="" width={56} height={56} unoptimized/>}
          <div><p className="storefront-type">{seller.sellerType === "collector" ? "Collector seller" : "Approved professional seller"}</p><h1>{seller.storeName}</h1>
            {location && <p className="storefront-location">Ships from {location}</p>}
          </div>
        </div>
        {shortBio && <p className="storefront-bio">{shortBio}</p>}
        <div className="storefront-actions"><Link className="button dark" href="#seller-inventory">Shop this seller</Link><Link className="button outline" href={`/messages?seller=${encodeURIComponent(seller.id)}`}>Message seller</Link></div>
        {reputation && <p className="storefront-history-summary">{since && <span>{since}</span>}<span>{reputation.feedbackCount && reputation.averageRating != null ? `${reputation.averageRating.toFixed(1)} / 5 · ${reputation.feedbackCount} verified purchase review${reputation.feedbackCount === 1 ? "" : "s"}` : "No verified purchase reviews yet"}</span></p>}
        <details className="storefront-disclosure storefront-about" id="reputation">
          <summary>Seller details &amp; marketplace history</summary>
          <div className="storefront-disclosure-body">
            {bio !== shortBio && <p>{bio}</p>}
            {(specialty || packing) && <dl className="storefront-profile-facts">
              {specialty && <div><dt>Specialty</dt><dd>{specialty}</dd></div>}
              {packing && <div><dt>Packing approach</dt><dd>{packing}</dd></div>}
            </dl>}
            {seller.sellerType === "professional" && seller.websiteUrl && <p><a href={seller.websiteUrl} rel="noreferrer">Visit seller website</a></p>}
            <p>{seller.sellerType === "collector" ? "Collectors publish their own listings. Report a problem from the listing page." : "Approval means the seller’s application was accepted."} Approval does not guarantee a model’s authenticity or condition.</p>
            <p>Buyer reputation comes from completed MCC orders and verified purchase feedback. Community likes and followers are separate. Stripe handles payment-account checks.</p>
            {reputation ? <StoreHistory reputation={reputation}/> : <p>Marketplace history is temporarily unavailable.</p>}
          </div>
        </details>
      </header>
      <section className="storefront-inventory" id="seller-inventory" aria-labelledby="storefront-inventory-heading" tabIndex={-1}>
        <h2 id="storefront-inventory-heading">Models from {seller.storeName}</h2>
        <details className="storefront-disclosure storefront-shipping">
          <summary><strong>{shipping} · {dispatch}</strong><span>Shipping &amp; returns</span></summary>
          <div className="storefront-disclosure-body">
            <h3>Shipping</h3><p>{shipping}. Dispatches within {seller.handlingTimeBusinessDays} business day{seller.handlingTimeBusinessDays === 1 ? "" : "s"} after payment for in-stock models. Carrier transit time is additional. Preorders dispatch after release and balance payment.</p>
            {shippingNote && <p>{shippingNote}</p>}
            <h3>Seller’s return policy</h3>
            {returns ? <blockquote>{returns}</blockquote> : <p>The seller has not provided a return policy. Ask before buying; do not assume change-of-mind returns are accepted.</p>}
            <p>Open a return or refund request in <Link href="/resolution">MCC Customer Support</Link> within <strong>{activeProtectionPolicy.deliveredDays} calendar days after carrier-confirmed delivery</strong>. Messaging the seller alone does not open a platform request.</p>
            <p>Follow the seller’s separate contact requirements above as well. A longer seller window does not extend the {activeProtectionPolicy.deliveredDays}-calendar-day MCC request deadline. Wait for return authorization before sending the model back.</p>
            <p><Link href="/shipping">Shipping details</Link> · <Link href="/returns">Return rules</Link> · <Link href="/protection">Buyer protection</Link></p>
          </div>
        </details>
        <StorefrontInventory key={JSON.stringify([seller.id, filters])} slug={seller.slug} filters={filters} catalog={catalog} scales={scales}/>
      </section>
    </div><SiteFooter/>
  </main>;
}

function StoreHistory({ reputation }: { reputation: SellerReputation }) {
  return <div className="storefront-history">
    <h3>Marketplace record</h3>
    <dl className="storefront-profile-facts">
      <div><dt>Completed transactions</dt><dd>{reputation.completedTransactions.toLocaleString("en-US")} paid orders shipped to buyers</dd></div>
      <div><dt>On-time shipment</dt><dd>{reputation.trackedShipments ? `${reputation.onTimeShipmentRate}% · ${reputation.onTimeShipments} of ${reputation.trackedShipments} deadline-tracked shipments` : "No deadline-tracked shipments yet"}</dd></div>
      <div><dt>Seller reviews</dt><dd>{reputation.feedbackCount && reputation.averageRating != null ? `${reputation.averageRating.toFixed(1)} / 5 · ${reputation.feedbackCount.toLocaleString("en-US")} verified purchase review${reputation.feedbackCount === 1 ? "" : "s"}` : "No verified purchase reviews yet"}</dd></div>
    </dl>
    {reputation.recentFeedback.length > 0 && <div className="storefront-feedback"><h3>Verified purchase reviews</h3>{reputation.recentFeedback.map(feedback => <article key={feedback.id}><p><strong>{feedback.buyerName}</strong> · {feedback.rating.toFixed(1)} / 5</p><p>{feedback.comment}</p></article>)}</div>}
  </div>;
}
