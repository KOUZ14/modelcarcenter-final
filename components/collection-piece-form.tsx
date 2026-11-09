"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Piece } from "@/lib/community";
import type { CollectionSellingOptions } from "@/lib/collection-offers";
import { availabilityLabel, communityRequest, ModelPicker, PhotoUpload, SubmitForm } from "./community-ui";

type Shelf = { id: string; name: string; itemId: string };
const sellingStates = ["open_to_offers", "for_sale"];

export function CollectionPieceForm({ piece, shelves, visibility, seedCatalogId, selling, requestedAvailability, returnedListingId }: {
  piece: Piece | null;
  shelves: Shelf[];
  visibility: string;
  seedCatalogId?: string;
  selling: CollectionSellingOptions;
  requestedAvailability?: string;
  returnedListingId?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [catalogId, setCatalogId] = useState(piece?.catalogId || seedCatalogId || "");
  const [photos, setPhotos] = useState<string[]>(JSON.parse(piece?.photos || "[]"));
  const [visible, setVisible] = useState(piece?.visibility || (seedCatalogId || !selling.published ? "private" : visibility));
  const [availability, setAvailability] = useState(
    piece?.availability === "reserved" || (piece?.listingId && piece.availability === "previously_owned")
      ? piece.availability
      : sellingStates.includes(requestedAvailability || "") ? requestedAvailability! : piece?.availability || "not_for_sale",
  );
  const [listingId, setListingId] = useState(returnedListingId || piece?.listingId || "");
  const [saved, setSaved] = useState(piece ? { id: piece.id, version: piece.version, visibility: piece.visibility } : null);
  const [minimum, setMinimum] = useState(params.get("minimum") || String((piece?.minimumCents || 0) / 100));
  const [notice, setNotice] = useState(params.get("setupError") || (piece && requestedAvailability ? "Your piece is saved. Complete setup below and save to activate your choice." : ""));
  const wantsSelling = sellingStates.includes(availability);
  const locked = piece?.availability === "reserved" || Boolean(piece?.listingId && piece.availability === "previously_owned");
  const listings = selling.listings.filter(l => l.catalogId === catalogId);
  const selectedListing = listings.find(l => l.id === listingId);
  const ready = Boolean(catalogId && selling.published && visible === "public" && selling.sellerReady && selectedListing);
  const unique = [...new Map(shelves.map(s => [s.id, s])).values()];
  const returnPath = saved ? `/collection?${new URLSearchParams({ edit: saved.id, selling: availability, minimum, ...(listingId ? { listing: listingId } : {}) })}` : "";
  const profileHref = `/profile?edit=1&returnTo=${encodeURIComponent(returnPath)}`;
  const professional = selling.sellerType === "professional";
  const listingHref = saved ? professional ? `/store?${new URLSearchParams({view: "inventory", edit: listingId || "new"})}` : `/sell/model?${new URLSearchParams({ collectionItem: saved.id, selling: availability, minimum, ...(listingId ? { id: listingId } : {}) })}` : "";
  const label = wantsSelling && !ready ? (saved ? "Save changes and continue setup" : "Save model and continue setup")
    : saved ? "Save piece" : "Add to my collection";

  return <SubmitForm label={label} onSubmit={async f => {
    setNotice("");
    const result = await communityRequest({
      action: "piece", id: saved?.id, version: saved?.version, catalogId, photos,
      title: f.get("title"), scale: f.get("scale"), maker: f.get("maker"), carMake: f.get("carMake"), color: f.get("color"),
      story: f.get("story"), condition: f.get("condition"), visibility: visible,
      publishConfirmed: f.get("publishConfirmed") === "on", privateNotes: f.get("privateNotes"), purchaseCost: f.get("purchaseCost"),
      availability: availability === "previously_owned" ? availability : "not_for_sale",
      commentsEnabled: f.get("commentsEnabled") === "on", pinned: f.get("pinned") === "on", shelves: f.getAll("shelves"),
    });
    // Keep the saved identity before the separate commerce request. A rejected
    // listing or a lost response must never make a retry create another piece.
    setSaved({ id: result.id, version: result.version, visibility: visible });
    const resume = `/collection?${new URLSearchParams({ edit: result.id, minimum, ...(wantsSelling ? { selling: availability } : {}), ...(listingId ? { listing: listingId } : {}) })}`;
    if (!locked && ((wantsSelling && ready) || (availability === "not_for_sale" && piece?.listingId))) {
      try {
        await communityRequest({ action: "configure", itemId: result.id, listingId, availability, minimumCents: availability === "open_to_offers" ? Math.round(Number(f.get("minimum") || 0) * 100) : 0 }, "/api/collectors/offers");
      } catch (error) {
        // The piece has already been saved. Reload it with its current version
        // before another attempt, including if the commerce response was lost.
        setNotice(`Your piece was saved. Selling preferences still need attention: ${(error as Error).message}`);
        router.replace(resume + "&setupError=" + encodeURIComponent(`Your piece was saved. ${(error as Error).message}`), { scroll: false });
        router.refresh();
        return;
      }
    }
    if (wantsSelling && !ready) {
      setNotice("Your piece is saved. Complete the steps below, then save again to activate your chosen availability.");
      router.replace(resume, { scroll: false });
      router.refresh();
      return;
    }
    router.push(`/collection/${result.id}`);
    router.refresh();
  }}>
    <label>Availability
      <select name="availability" value={availability} disabled={locked} onChange={e => setAvailability(e.target.value)}>
        <option value="not_for_sale">Not for sale</option>
        <option value="open_to_offers">Open to offers</option>
        <option value="for_sale">For sale</option>
        {(!piece?.listingId || piece.availability === "previously_owned") && <option value="previously_owned">Previously owned · historical showcase</option>}
        {locked && availability === "reserved" && <option value="reserved">Reserved · pending payment</option>}
      </select>
    </label>
    {locked && <p>This piece has {availability === "reserved" ? "an accepted reservation. Manage it in Inbox before changing availability" : "a completed ownership history"}.</p>}
    {notice && <p role="status" className="collection-setup-notice">{notice}</p>}
    {wantsSelling && <section className="collection-selling-setup" aria-label="Selling setup">
      <h3>{availability === "open_to_offers" ? "Set up offers" : "Set up a sale"}</h3>
      <p>{availability === "open_to_offers" ? "Collectors can propose a price for this exact piece. You decide which offers to accept." : "Collectors can buy this piece through its marketplace listing at the listing price."}</p>
      <ul>
        <li>{catalogId ? "Catalog model selected." : "Choose the exact catalog model below."}</li>
        <li>{selling.published ? "Collector profile published." : saved ? <Link href={profileHref}>Publish your collector profile, then return to this piece</Link> : "Save this model first, then publish your collector profile."}</li>
        <li>{visible === "public" ? "Public showcase selected. Confirm publication below." : "Choose Public showcase below when you are ready to publish this piece."}</li>
        <li>{selling.sellerReady ? "Seller account ready." : saved ? <Link href={listingHref} target={professional ? "_blank" : undefined}>Complete seller setup and prepare your listing{professional ? " in Seller Hub (new tab)" : ""}</Link> : "After saving, complete seller setup and prepare a listing."}</li>
        <li>{selectedListing ? "Eligible listing selected." : "Link an active listing for this model with quantity one, condition, photos and shipping details. Listings already attached to another piece are excluded."}</li>
      </ul>
      <label>Marketplace listing
        <select value={listingId} onChange={e => setListingId(e.target.value)}>
          <option value="">{listings.length ? "Choose the listing for this physical piece" : "No eligible matching listing yet"}</option>
          {listingId && !selectedListing && <option value={listingId} disabled>Previously selected listing · not published</option>}
          {listings.map(l => <option value={l.id} key={l.id}>{l.title} · {new Intl.NumberFormat(undefined, { style: "currency", currency: l.currency }).format(l.priceCents / 100)}</option>)}
        </select>
      </label>
      {saved && <><Link href={listingHref} target={professional ? "_blank" : undefined}>{professional ? "Create or finish this listing in Seller Hub (new tab)" : "Create or finish the listing for this piece"}</Link><button type="button" className="text-action" onClick={() => router.refresh()}>Refresh seller and listing status</button></>}
      {availability === "open_to_offers" && <label>Minimum offer (optional){selectedListing ? ` · ${selectedListing.currency.toUpperCase()}` : ""}<input name="minimum" type="number" min={0} step="0.01" value={minimum} onChange={e => setMinimum(e.target.value)}/></label>}
      {!ready && <p>Your choice becomes active after these steps are complete. Saving now keeps the piece and lets you continue setup.</p>}
    </section>}
    <ModelPicker value={catalogId} onChange={id => { setCatalogId(id); if (id !== catalogId) setListingId(""); }}/>
    {!catalogId && <div className="form-grid">
      <label>Model name<input name="title" required defaultValue={piece?.title}/></label>
      <label>Scale<input name="scale" required defaultValue={piece?.scale} placeholder="1:64"/></label>
      <label>Manufacturer<input name="maker" required defaultValue={piece?.maker}/></label>
      <label>Car make<input name="carMake" defaultValue={piece?.carMake}/></label>
      <label>Color / livery<input name="color" defaultValue={piece?.color}/></label>
      <p>Personal item. Match it to the exact catalog release before selling.</p>
    </div>}
    <PhotoUpload value={photos} onChange={setPhotos}/>
    <label>Personal story<textarea name="story" defaultValue={piece?.story} maxLength={3000}/></label>
    <fieldset><legend>Shelves (optional)</legend>{unique.map(s => <label className="check-label" key={s.id}><input type="checkbox" name="shelves" value={s.id} defaultChecked={shelves.some(m => m.id === s.id && m.itemId === piece?.id)}/>{s.name}</label>)}{!unique.length && <p>Create a shelf after saving your first piece.</p>}</fieldset>
    <label>Visibility<select value={visible} onChange={e => setVisible(e.target.value)}><option value="private">Private - only you</option><option value="public" disabled={!selling.published}>Public showcase{!selling.published ? " - publish your profile first" : ""}</option></select></label>
    {visible === "public" && saved?.visibility !== "public" && <label className="check-label"><input required type="checkbox" name="publishConfirmed"/>Publish this piece, its story and photos on my public profile. My private records remain private.</label>}
    <label className="check-label"><input type="checkbox" name="commentsEnabled" defaultChecked={piece ? Boolean(piece.commentsEnabled) : true}/>Allow new comments</label>
    <label className="check-label"><input type="checkbox" name="pinned" defaultChecked={Boolean(piece?.pinned)}/>Pin as a favorite</label>
    <details><summary>Condition and private purchase records</summary>
      <label>Condition (shown with the piece)<textarea name="condition" defaultValue={piece?.condition}/></label>
      <label>Purchase cost (private)<input name="purchaseCost" defaultValue={piece?.purchaseCost}/></label>
      <label>Private notes<textarea name="privateNotes" defaultValue={piece?.privateNotes}/></label>
    </details>
    <p className="privacy-label">Saving as {visible === "public" ? "Public" : "Private"} · {wantsSelling && !ready ? `${availabilityLabel[availability]} setup pending` : availabilityLabel[availability]}. Adding a model does not create a post.</p>
  </SubmitForm>;
}
