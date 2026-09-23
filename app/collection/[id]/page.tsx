import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CommentSection } from "@/components/community-ui";
import { CommerceSettings, MakeOffer } from "@/components/collection-offers";
import { CollectionWishlistButton } from "@/components/collection-wishlist-button";
import { ProductGallery } from "@/components/product-gallery";
import { getCurrentCollector } from "@/lib/collector-auth";
import { getPiece, getShelves, one, settings } from "@/lib/community";
import { pieceAvailabilityLabel } from "@/lib/community-presentation";
import { expireCollectionOffers } from "@/lib/collection-offers";
import "@/components/collection-piece.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Collection piece", robots: { index: false, follow: true } };

export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collector = await getCurrentCollector();
  const viewer = collector?.user.id ?? null;
  await expireCollectionOffers();
  const piece = await getPiece(id, viewer);
  if (!piece) notFound();
  const owner = piece.ownerId === viewer;
  const [allShelves, saved, profileSettings] = await Promise.all([
    getShelves(piece.ownerId, viewer),
    viewer && piece.catalogId ? one("SELECT id FROM model_wishlist WHERE owner_id=? AND catalog_id=?", viewer, piece.catalogId) : null,
    viewer ? settings(viewer) : null,
  ]);
  const shelves = allShelves.filter(shelf => shelf.itemId === piece.id);
  const collectionHref = owner ? "/collection" : `/collectors/${piece.handle}`;
  const images = (JSON.parse(piece.photos) as string[]).map((photo, index) => ({
    id: photo,
    url: `/community/media/${encodeURIComponent(photo)}`,
    alt: `${piece.displayName}’s ${piece.title}, photo ${index + 1}`,
  }));

  return <><SiteHeader/><main id="main-content" className="piece-detail shell">
    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      <Link href={collectionHref}>{owner ? "My collection" : `${piece.displayName}’s collection`}</Link><span>/</span><span>{piece.title}</span>
    </nav>
    <div className="piece-detail-layout">
      <ProductGallery images={images} productName={piece.title} context="collection"/>
      <section className="piece-summary" aria-label="Collection piece details">
        <p className="eyebrow">{[piece.scale, piece.maker].filter(Boolean).join(" · ")}</p>
        <h1>{piece.title}</h1>
        <div className="piece-owner-status">
          <Link href={collectionHref}>{piece.availability === "previously_owned" ? "Previously owned by" : "Owned by"} {piece.displayName}</Link>
          <span className="availability">{pieceAvailabilityLabel(piece.availability)}</span>
        </div>
        {owner && <p className="privacy-label">{piece.visibility === "private" ? "Private — only you" : "Public showcase"}</p>}
        {piece.story && <p className="piece-story">{piece.story}</p>}
        {piece.condition && <p><strong>Condition:</strong> {piece.condition}</p>}
        {shelves.length > 0 && <div className="piece-shelves">
          <p>Collection shelves</p>
          <ul>{shelves.map(shelf => <li key={shelf.id}><Link href={`${collectionHref}?${new URLSearchParams({ ...(owner ? {} : { tab: "collection" }), shelf: shelf.id })}#collection-pieces`}>{shelf.name}</Link></li>)}</ul>
        </div>}
        {!piece.catalogId && <p>Personal item · exact model release unconfirmed</p>}
        {!owner && piece.availability === "open_to_offers" && <MakeOffer piece={piece}/>}
        {piece.availability === "reserved" && <p>This piece is pending payment. New offers and purchases are unavailable.</p>}
        {piece.availability === "previously_owned" && <p>Historical showcase. This piece is excluded from the current collection.</p>}
        <div className="piece-actions">
          {!owner && piece.availability === "for_sale" && piece.listingSlug && <Link className="button dark" href={`/products/${piece.listingSlug}`}>View this piece’s listing</Link>}
          {piece.catalogId && <>
            <CollectionWishlistButton key={`${piece.catalogId}:${viewer || "guest"}`} catalogId={piece.catalogId} initialSaved={Boolean(saved)} signedIn={Boolean(viewer)} returnTo={`/collection/${encodeURIComponent(id)}`}/>
            <Link className="button outline" href={`/models/${piece.catalogId}`}>View model details &amp; offers</Link>
          </>}
          {!owner && <Link className="piece-message" href={`/messages?${new URLSearchParams({ collector: piece.ownerId, item: piece.id })}`}>Message about this piece</Link>}
          {owner && <Link className="button outline" href={`/collection?edit=${encodeURIComponent(piece.id)}`}>Edit piece</Link>}
        </div>
        {owner && <><CommerceSettings piece={piece}/><details><summary>Private purchase records</summary><p>{piece.purchaseCost || "No purchase cost recorded"}</p><p>{piece.privateNotes || "No private notes"}</p></details></>}
      </section>
    </div>
    <CommentSection key={id} itemId={id} enabled={Boolean(piece.commentsEnabled)} viewerId={viewer} profilePublished={Boolean(profileSettings?.published)}/>
  </main></>;
}
