"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";
import { modelHuntHref } from "@/lib/discovery";
import { useMarketplace } from "./marketplace-provider";

export type WantedModel = {
  id: string; title: string; scale: string; modelManufacturer: string;
  color?: string | null; manufacturerSku?: string | null;
};

export function CatalogWishlist({ models, loading, error, compact, onChange, onRetry }: {
  models: WantedModel[]; loading: boolean; error: string; compact: boolean;
  onChange(models: WantedModel[]): void; onRetry(): void;
}) {
  const { collector } = useMarketplace();
  const params = useSearchParams();
  const initialQuery = params.get("wantedSearch") ?? "";
  const [adding, setAdding] = useState(params.get("addWanted") === "1");
  const [query, setQuery] = useState(initialQuery);
  const [request, setRequest] = useState<{ query: string } | null>(initialQuery ? { query: initialQuery } : null);
  const [result, setResult] = useState<{ request: typeof request; models: WantedModel[]; error: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");
  const panelId = useId();
  const searching = !!request && result?.request !== request;
  const currentResult = result?.request === request ? result : null;
  const signInHref = "/sign-in?returnTo=" + encodeURIComponent("/wishlist?" + new URLSearchParams({ addWanted: "1", wantedSearch: request?.query ?? query }));

  useEffect(() => {
    if (!adding || !request) return;
    const controller = new AbortController();
    void fetch(`/api/catalog-products?q=${encodeURIComponent(request.query)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json() as { products?: WantedModel[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Model search is temporarily unavailable.");
      if (!controller.signal.aborted) setResult({ request, models: data.products ?? [], error: "" });
    }).catch(reason => {
      if (!controller.signal.aborted) setResult({ request, models: [], error: reason instanceof Error ? reason.message : "Model search is temporarily unavailable." });
    });
    return () => controller.abort();
  }, [adding, request]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequest({ query: query.trim() });
  }

  async function change(model: WantedModel, enabled: boolean) {
    if (!collector || busy || loading || error) return;
    setBusy(model.id); setMutationError(""); setMessage("");
    try {
      const response = await fetch("/api/collectors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wishlist", catalogId: model.id, enabled }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Your wanted models could not be updated.");
      onChange(enabled ? [model, ...models.filter(item => item.id !== model.id)] : models.filter(item => item.id !== model.id));
      setMessage(`${model.title} ${enabled ? "added to" : "removed from"} models you're looking for.`);
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "Your wanted models could not be updated.");
    } finally { setBusy(""); }
  }

  return <section className={`wanted-models${compact ? " compact" : ""}`} aria-label="Models I'm looking for">
    {(!compact || adding || error) && <><h2>Models I&apos;m looking for</h2><p>Specific releases you want from any seller, even when none are for sale.</p></>}
    <button className="wanted-add-toggle" type="button" aria-expanded={adding} aria-controls={panelId} onClick={() => setAdding(!adding)}>{adding ? "Close model search" : "Add a wanted model"}</button>
    {loading && <p className="wanted-status" role="status">Loading models you&apos;re looking for…</p>}
    {error && <div className="wishlist-error" role="alert"><p>{error}</p><button className="button outline small" type="button" onClick={onRetry}>Try again</button></div>}
    {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
    <p className="wanted-status" role="status">{message}</p>
    {models.length > 0 && <ul className="wanted-model-list">{models.map(model => <li key={model.id}>
      <div><h3><Link href={`/models/${model.id}`}>{model.title}</Link></h3><p>{model.scale} · {model.modelManufacturer}</p><Link className="wanted-model-offers" href={`/models/${model.id}`}>View model &amp; offers</Link></div>
      <button className="wanted-model-remove" type="button" disabled={!!busy || loading} onClick={() => void change(model, false)} aria-label={`Remove ${model.title} from models I'm looking for`}>{busy === model.id ? "Saving…" : "Remove"}</button>
    </li>)}</ul>}
    {adding && <div id={panelId} className="wanted-model-search">
      <p>Search by model name, model brand or product number. This adds the release you want; it does not save a seller&apos;s listing.</p>
      <form onSubmit={search} role="search" aria-label="Find a wanted model">
        <label htmlFor={`${panelId}-query`}>Find a model<input id={`${panelId}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="e.g. AUTOart Nissan" /></label>
        <button className="button dark" type="submit" disabled={searching}>{searching ? "Searching…" : "Search models"}</button>
      </form>
      {!collector && <p>Sign in to save models you&apos;re looking for. Your saved listings stay on this device.</p>}
      {searching && <p className="wanted-status" role="status">Searching models…</p>}
      {currentResult?.error && <p className="form-error" role="alert">{currentResult.error} Try your search again.</p>}
      {currentResult && !currentResult.error && <><p className="wanted-status" role="status">{currentResult.models.length ? `Models ${request?.query ? `matching “${request.query}”` : "you can look for"}` : "No matching models found."}</p>
        <ul className="wanted-search-results">{currentResult.models.map(model => {
          const saved = models.some(item => item.id === model.id);
          return <li key={model.id}><div><h3><Link href={`/models/${model.id}`}>{model.title}</Link></h3><p>{[model.scale, model.modelManufacturer, model.color, model.manufacturerSku].filter(Boolean).join(" · ")}</p></div>
            {collector ? <button className="button outline" type="button" disabled={saved || !!busy || loading || !!error} onClick={() => void change(model, true)}>{saved ? "Added to wanted models" : busy === model.id ? "Adding…" : "Add to wanted models"}</button> : <Link className="button outline" href={signInHref}>Sign in to add</Link>}
          </li>;
        })}</ul>
        {!currentResult.models.length && <Link className="wanted-model-offers" href={modelHuntHref({ q: request?.query })}>Can&apos;t find it? Start a Model Hunt</Link>}
      </>}
    </div>}
  </section>;
}
