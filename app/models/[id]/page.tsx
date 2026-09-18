import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getCatalogListings } from "@/lib/catalog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { formatCondition, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CatalogModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCatalogListings(id);
  if (!result) notFound();
  const { model, listings } = result;
  if (id !== model.id) permanentRedirect(`/models/${model.id}`);
  return <main><SiteHeader /><div id="main-content" tabIndex={-1} className="inner-page shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/marketplace">Marketplace</Link><span>/</span><span>Model catalog</span></nav>
    <p className="eyebrow">{model.modelManufacturer} · {model.scale}</p>
    <h1>{model.title}</h1>
    <dl className="catalog-model-details">
      <div><dt>Manufacturer SKU</dt><dd>{model.manufacturerSku || "Unknown"}</dd></div>
      {([['Color', model.color], ['Variant', model.vehicleVariant], ['Livery', model.livery], ['Vehicle year', model.vehicleYear], ['Release year', model.releaseYear], ['Material', model.material]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {model.description && <p>{model.description}</p>}
    {model.manufacturerRelease && <p>Manufacturer release window: {JSON.parse(model.manufacturerRelease).label}. Each seller has separate allocation and dispatch terms.</p>}
    {model.releaseSource && <p>Release source: {model.releaseSource} · Last checked {model.releaseCheckedAt?.slice(0,10)}</p>}
    <section aria-labelledby="catalog-offers-heading" className="catalog-offers">
      <h2 id="catalog-offers-heading">Available from</h2>
      <p>{new Set(listings.map((listing) => listing.sellerId)).size} sellers · {listings.length} available listings</p>
      {!listings.length ? <p>This model is in the MCC catalog. No sellers currently have it available.</p> : <ul className="catalog-model-results">{listings.map((listing) => <li key={listing.id}>
        <div><Link href={`/sellers/${listing.sellerSlug}`}><strong>{listing.sellerName}</strong></Link><p>{formatCondition(listing.condition)} · Model: {formatCondition(listing.modelCondition)} · {listing.availabilityType === "preorder" ? "Upcoming release · pay when ready" : `${listing.availableQuantity} in stock`}</p>{listing.conditionNotes && <p>{listing.conditionNotes}</p>}</div>
        <div><strong>{listing.availabilityType === "preorder" && !listing.priceCents ? "Price to be announced" : formatMoney(listing.priceCents, listing.currency)}</strong><p>{listing.shippingMode === "calculated" ? "Shipping calculated for your address" : listing.shippingMode === "free" || listing.defaultShippingCents === 0 ? "Free shipping" : `Shipping ${formatMoney(listing.defaultShippingCents, listing.currency)}`}</p><Link className="button dark small" href={`/products/${listing.slug}`}>View seller listing</Link></div>
      </li>)}</ul>}
    </section>
  </div><SiteFooter /></main>;
}
