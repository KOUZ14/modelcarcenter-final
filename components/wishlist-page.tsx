"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { useMarketplace } from "./marketplace-provider";
import { SavedListingCard } from "./saved-listing-card";
import { CatalogWishlist, type WantedModel } from "./catalog-wishlist";

export function WishlistPage() {
  const { wishlist, collector, authReady, toggleWishlist } = useMarketplace();
  const [savedResult, setSavedResult] = useState<{ key: string; products: ProductSummary[]; error: string } | null>(null);
  const [wantedResult, setWantedResult] = useState<{ ownerId: string; models: WantedModel[]; error: string } | null>(null);
  const [savedRetry, setSavedRetry] = useState(0);
  const [wantedRetry, setWantedRetry] = useState(0);
  const savedKey = JSON.stringify(wishlist);
  const ownerId = collector?.id ?? "";

  useEffect(() => {
    const ids = JSON.parse(savedKey) as string[];
    if (!authReady || !ids.length) return;
    const controller = new AbortController();
    // The existing batch endpoint accepts at most 100 listings per request.
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100));
    void Promise.all(batches.map(async batch => {
      const response = await fetch("/api/products/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }), signal: controller.signal,
      });
      const data = await response.json() as { products?: ProductSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Saved listings are temporarily unavailable.");
      return data.products ?? [];
    })).then(batches => {
      if (!controller.signal.aborted) setSavedResult({ key: savedKey, products: batches.flat(), error: "" });
    }).catch(reason => {
      if (!controller.signal.aborted) setSavedResult({ key: savedKey, products: [], error: reason instanceof Error ? reason.message : "Saved listings are temporarily unavailable." });
    });
    return () => controller.abort();
  }, [authReady, savedKey, savedRetry]);

  useEffect(() => {
    if (!authReady || !ownerId) return;
    const controller = new AbortController();
    void fetch("/api/collectors?view=wishlist", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as { models?: WantedModel[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Your wanted models could not be loaded.");
      if (!controller.signal.aborted) setWantedResult({ ownerId, models: data.models ?? [], error: "" });
    }).catch(reason => {
      if (!controller.signal.aborted) setWantedResult({ ownerId, models: [], error: reason instanceof Error ? reason.message : "Your wanted models could not be loaded." });
    });
    return () => controller.abort();
  }, [authReady, ownerId, wantedRetry]);

  const savedLoading = !authReady || (wishlist.length > 0 && savedResult?.key !== savedKey);
  const savedError = savedResult?.key === savedKey ? savedResult.error : "";
  const wantedLoading = !authReady || (!!ownerId && wantedResult?.ownerId !== ownerId);
  const wantedModels = ownerId && wantedResult?.ownerId === ownerId ? wantedResult.models : [];
  const wantedError = ownerId && wantedResult?.ownerId === ownerId ? wantedResult.error : "";
  const total = wishlist.length + wantedModels.length;
  const byId = new Map((savedResult?.products ?? []).map(product => [product.id, product]));
  const products = wishlist.map(id => byId.get(id)).filter((product): product is ProductSummary => !!product);
  const unavailable = !savedLoading && !savedError ? wishlist.filter(id => !byId.has(id)) : [];

  return <div className="wishlist-page">
    <header className="wishlist-heading">
      <div className="wishlist-title-row">
        <h1>Your wishlist{authReady && !wantedLoading && !wantedError && <span className="wishlist-count"> · {total} {total === 1 ? "item" : "items"}</span>}</h1>
        {authReady && total > 0 && <Link className="wishlist-browse" href="/marketplace">Add more models</Link>}
      </div>
      {authReady && <p className="wishlist-sync">{collector ? "Saved to your account · Synced across devices" : <>Saved on this device · <Link href="/sign-in?returnTo=%2Fwishlist">Sign in to sync</Link></>}</p>}
    </header>
    {!authReady ? <p className="wishlist-loading" role="status">Loading your wishlist…</p> : wishlist.length > 0 ? <section className="saved-listings" aria-labelledby="saved-listings-title">
      <h2 id="saved-listings-title">Saved listings</h2>
      <p>Specific sellers&apos; listings you saved to compare or buy.</p>
      {savedLoading && <p className="wishlist-loading" role="status">{products.length ? "Updating saved listings…" : "Loading saved listings…"}</p>}
      {savedError && <div className="wishlist-error" role="alert"><p>{savedError}</p><button className="button outline small" type="button" onClick={() => { setSavedResult(null); setSavedRetry(value => value + 1); }}>Try again</button></div>}
      <div className="saved-listings-list">
        {products.map(product => <SavedListingCard key={product.id} product={product} />)}
        {unavailable.map((id, index) => <article className="wishlist-unavailable" key={id}><div><strong>Listing no longer available</strong><p>This saved listing can no longer be opened.</p></div><button className="saved-listing-remove" type="button" aria-label={`Remove unavailable saved listing ${index + 1}`} onClick={() => toggleWishlist(id)}>Remove</button></article>)}
      </div>
    </section> : <section className="wishlist-empty" aria-labelledby="empty-wishlist-title">
      <h2 id="empty-wishlist-title">No saved models yet</h2>
      {total === 0 && <Link className="button dark" href="/marketplace">Browse models</Link>}
    </section>}
    {authReady && <CatalogWishlist key={ownerId || "guest"} models={wantedModels} loading={wantedLoading} error={wantedError} compact={total === 0}
      onChange={models => setWantedResult({ ownerId, models, error: "" })}
      onRetry={() => { setWantedResult(null); setWantedRetry(value => value + 1); }} />}
  </div>;
}
