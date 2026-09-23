import Image from "next/image";
import Link from "next/link";
import { ModelCommunity } from "@/components/model-community";
import { notFound, permanentRedirect } from "next/navigation";
import { getCatalogListings } from "@/lib/catalog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { formatCondition, formatMoney } from "@/lib/format";
import { modelHuntHref, releaseWindowLabel } from "@/lib/discovery";
import "@/components/discovery.css";

export const dynamic = "force-dynamic";

export default async function CatalogModelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const discussionLimit = Math.min(100, Math.max(20, Math.floor(Number(query.discussionLimit) || 20)));
  const before = Number(query.before);
  const result = await getCatalogListings(id);
  if (!result) notFound();
  const { model, listings } = result;
  if (id !== model.id) permanentRedirect(`/models/${model.id}`);
  const imageListing = listings.find(listing => listing.primaryImageUrl);
  const image = model.primaryImageUrl || imageListing?.primaryImageUrl;
  const release = releaseWindowLabel(model.manufacturerRelease);
  const sellers = new Set(listings.map(listing => listing.sellerId)).size;
  return <main><SiteHeader /><div id="main-content" tabIndex={-1} className="inner-page shell">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/marketplace">Shop</Link><span>/</span><span>{listings.length > 1 ? "Compare offers" : "Model details"}</span></nav>
    <div className="model-overview">
      <div><div className="model-overview-image">{image ? <Image src={image} alt={`${model.modelManufacturer} ${model.title}`} fill sizes="(max-width: 700px) 100vw, 40vw" unoptimized /> : <div className="image-placeholder">No model photo available yet</div>}</div>{image && <p className="model-photo-caption">{model.primaryImageUrl ? model.previewMedia ? "Manufacturer preview. Check each listing for item photos." : "Model reference photo. Check each listing for the actual item's photos." : `Photo from ${imageListing?.sellerName}'s listing. Check each offer's photos before buying.`}</p>}</div>
      <div><p className="eyebrow">{model.modelManufacturer} · {model.scale}</p><h1>{model.title}</h1>
        <dl className="catalog-model-details">
          {([['Product code', model.manufacturerSku], ['Color', model.color], ['Variant', model.vehicleVariant], ['Livery', model.livery], ['Vehicle year', model.vehicleYear], ['Release year', model.releaseYear], ['Edition', model.edition], ['Packaging variant', model.packagingVariant], ['Material', model.material]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          {model.versionKind === "chase" && <div><dt>Version</dt><dd>Chase edition</dd></div>}
        </dl>
        {model.description && <p>{model.description}</p>}
        {release && <p>Manufacturer release window: {release}. This is not a delivery estimate; each seller has separate dispatch terms.</p>}
        {model.releaseSource && <p>Release source: {model.releaseSource}{model.releaseCheckedAt ? ` · Last checked ${model.releaseCheckedAt.slice(0, 10)}` : ""}</p>}
      </div>
    </div>
    <section aria-labelledby="catalog-offers-heading" className="catalog-offers">
      <h2 id="catalog-offers-heading">{listings.length > 1 ? `Compare ${listings.length} available offers` : listings.length === 1 ? "One available offer" : "Currently unavailable"}</h2>
      {listings.length > 0 && <p>{listings.length} offer{listings.length === 1 ? "" : "s"} from {sellers} seller{sellers === 1 ? "" : "s"}. Offers are linked to this model release; condition, packaging and dispatch terms can differ.</p>}
      {!listings.length ? <div className="no-results"><p>No seller currently has an available listing for this release.</p><Link className="button dark" href={modelHuntHref({ q: `${model.vehicleMake} ${model.vehicleModel}`, scale: model.scale, manufacturer: model.modelManufacturer })}>Can&apos;t find it? Start a Model Hunt</Link><Link className="text-link" href={`/marketplace?q=${encodeURIComponent(model.vehicleModel)}`}>Browse similar models</Link></div> : <ul className="model-offer-list">{listings.map(listing => <li className="model-offer" key={listing.id}>
        <div><Link href={`/sellers/${listing.sellerSlug}`}><strong>{listing.sellerName}</strong></Link><p>{listing.sellerType === "professional" ? "Professional seller" : "Collector seller"} · {listing.availabilityType === "preorder" ? "Upcoming release · Preorder" : `${listing.availableQuantity} in stock`}</p>
          <dl><div><dt>Model condition</dt><dd>{formatCondition(listing.modelCondition)}</dd></div><div><dt>Original box</dt><dd>{formatCondition(listing.originalBoxStatus)}</dd></div><div><dt>Packaging condition</dt><dd>{formatCondition(listing.packagingCondition)}</dd></div></dl>
          {listing.conditionNotes && <p>{listing.conditionNotes}</p>}{listing.defects && <p>Disclosed defects: {listing.defects}</p>}
        </div>
        <div><strong className="model-offer-price">{listing.availabilityType === "preorder" && !listing.priceCents ? "Price to be announced" : formatMoney(listing.priceCents, listing.currency)}</strong>{listing.saleUnit && <p>Per {listing.saleUnit}{(listing.unitsPerPack ?? 1) > 1 ? ` · ${listing.unitsPerPack} models` : ""}</p>}
          <p>{listing.shippingMode === "calculated" ? "Shipping estimate available with your ZIP code on the listing." : listing.shippingMode === "free" || listing.defaultShippingCents === 0 ? "Free shipping under this seller's shipping terms." : `Estimated shipping: ${formatMoney(listing.defaultShippingCents, listing.currency)}; confirm for your address.`}</p>
          <p>{listing.availabilityType === "preorder" ? "See listing for the seller's release and dispatch terms." : `Dispatches within ${listing.handlingTimeBusinessDays} business day${listing.handlingTimeBusinessDays === 1 ? "" : "s"}. Carrier delivery time is additional.`}</p>
          <p className="field-note">Item price excludes applicable tax. Final shipping and total are shown before payment.</p>
          <Link className="button dark small" href={`/products/${listing.slug}`}>View listing and purchase details</Link>
        </div>
      </li>)}</ul>}
    </section>
    <ModelCommunity catalogId={model.id} limit={discussionLimit} before={Number.isFinite(before) && before > 0 ? before : undefined} beforeId={typeof query.beforePost === "string" ? query.beforePost : undefined}/>
  </div><SiteFooter /></main>;
}
