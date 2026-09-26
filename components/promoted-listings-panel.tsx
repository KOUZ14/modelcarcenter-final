"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import type { PromotionSettings } from "@/lib/promotion-rules";

type Campaign = { id: string; product_id: string; title: string; status: string; reason: string; deliveryReason: string | null; currency: string; ends_at: number | null; refunded_cents: number; impressions: number; clicks: number; refund_status: string | null };
type Listing = { id: string; title: string; sku: string; priceCents: number; currency: string; quantity: number; imageUrl: string | null; unavailable: string | null };
type Data = { settings: PromotionSettings; pilotEligible: boolean; termsVersion: string; listings: Listing[]; campaigns: Campaign[] };

export async function promotionRequest(url: string, payload?: Record<string, unknown>) {
  const response = await fetch(url, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Promotion request failed.");
  return body;
}

export function PromotedListingsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [accepted, setAccepted] = useState(false);
  const requestKey = useRef("");
  const load = useCallback(async () => setData(await promotionRequest("/api/store/promotions")), []);
  useEffect(() => { queueMicrotask(() => {
    setSelected(new URLSearchParams(window.location.search).get("promotion_product") ?? "");
    void load().catch(e => setError(e.message));
  }); }, [load]);
  useEffect(() => {
    if (!data?.campaigns.some(c => c.status === "pending_payment" || /queued|pending/.test(c.refund_status ?? ""))) return;
    const timer = setInterval(() => void load().catch(() => {}), 15_000);
    return () => clearInterval(timer);
  }, [data, load]);
  function choose(id: string) { setSelected(id); setAccepted(false); requestKey.current = ""; setError(""); }
  async function purchase(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); requestKey.current ||= crypto.randomUUID();
    try {
      const result = await promotionRequest("/api/store/promotions/checkout", { productId: selected, requestKey: requestKey.current, termsVersion: accepted ? data?.termsVersion : "" });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Payment could not start."); await load().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function action(campaign: Campaign, action: string) {
    setBusy(true); setError("");
    try {
      const result = await promotionRequest("/api/store/promotions", { campaignId: campaign.id, action });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Promotion could not be updated."); }
    finally { setBusy(false); }
  }
  const settings = data?.settings;
  const canBuy = Boolean(settings?.purchasesEnabled && settings.servingEnabled && settings.taxMode !== "unconfigured" && data?.pilotEligible);
  const listings = data?.listings.filter(l => `${l.title} ${l.sku}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const history = data?.campaigns.filter(c => ["ended", "expired"].includes(c.status)) ?? [];
  return <section className="store-panel promotion-inventory">
    <div className="panel-heading"><div><h3>Promote your listings</h3><p>Choose a listing to feature in sponsored marketplace results.</p></div>
      {settings && <div className="promotion-price"><strong>{formatMoney(settings.priceCents, settings.currency)}</strong><span>per listing · 7 days</span></div>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && !canBuy && <p className="hub-note">{data.pilotEligible ? "Promotion payments are not enabled yet. You can browse your inventory below." : "Your store is not included in the current promotion pilot."}</p>}
    <label className="promotion-search">Search your inventory<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Listing title or SKU" /></label>
    {!data && <p role="status">Loading your inventory…</p>}
    {data && !data.listings.length && <p>No listings yet. <Link href="/store?view=inventory">Create your first listing</Link> to get started.</p>}
    {data && data.listings.length > 0 && !listings.length && <p>No listings match your search.</p>}
    <div className="promotion-inventory-list">{listings.map(listing => {
      const campaign = data!.campaigns.find(c => c.product_id === listing.id && ["active", "paused", "pending_payment"].includes(c.status));
      const expanded = selected === listing.id && !campaign && canBuy && !listing.unavailable;
      return <article className="promotion-inventory-item" key={listing.id}>
        <div className="promotion-inventory-row">
          <div className="promotion-thumbnail">{listing.imageUrl ? <Image src={listing.imageUrl} alt="" width={80} height={64} unoptimized/> : <span>No photo</span>}</div>
          <div className="promotion-listing-title"><h4>{listing.title}</h4><p>{listing.sku} · {formatMoney(listing.priceCents, listing.currency)} · {listing.quantity} available</p>
            {campaign ? <p className="promotion-status">{campaign.status === "pending_payment" ? "Payment incomplete" : campaign.status === "paused" ? "Paused" : "Promoted"}{campaign.ends_at ? ` · Ends ${new Date(campaign.ends_at).toLocaleDateString()}` : ""}</p> : listing.unavailable && <p className="muted">{listing.unavailable}</p>}
            {campaign?.status === "active" && campaign.deliveryReason && <p className="muted">{campaign.deliveryReason}</p>}
          </div>
          {campaign && campaign.status !== "pending_payment" && <div className="promotion-counts"><strong>{campaign.impressions}<small>Views</small></strong><strong>{campaign.clicks}<small>Clicks</small></strong></div>}
          <div className="promotion-listing-actions">{campaign ? <>
            {campaign.status === "pending_payment" ? <button className="button dark small" disabled={busy} onClick={() => void action(campaign, "continue")}>Complete payment</button> : campaign.status === "active" ? <button className="button outline small" disabled={busy} onClick={() => void action(campaign, "pause")}>Pause</button> : campaign.reason === "seller_paused" ? <button className="button outline small" disabled={busy} onClick={() => void action(campaign, "resume")}>Resume</button> : <span>Needs review</span>}
            <button className="text-button" disabled={busy} onClick={() => { if (window.confirm("End this promotion? Its remaining time will end, and voluntary cancellation is not refunded.")) void action(campaign, "end"); }}>End</button>
          </> : <button className="button dark small" aria-expanded={expanded} disabled={busy || !canBuy || Boolean(listing.unavailable)} onClick={() => choose(expanded ? "" : listing.id)}>Promote</button>}</div>
        </div>
        {expanded && <form className="promotion-confirmation" onSubmit={purchase}>
          <p><strong>{formatMoney(settings!.priceCents, settings!.currency)} for 7 days</strong>{settings!.taxMode === "automatic" ? ", plus applicable tax." : "."} Starts after payment. No automatic renewal.</p>
          <label className="promotion-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required/>I accept the <Link href="/promotion-terms" target="_blank">promotion terms</Link>, including no guaranteed views or sales.</label>
          <div className="row-actions"><button className="button dark small" disabled={busy || !accepted}>{busy ? "Opening payment…" : "Pay and promote"}</button><button className="text-button" type="button" disabled={busy} onClick={() => choose("")}>Cancel</button></div>
        </form>}
      </article>;
    })}</div>
    {history.length > 0 && <details className="promotion-history"><summary>Past promotions ({history.length})</summary>{history.map(c => <div key={c.id}><strong>{c.title}</strong><p>{c.impressions} views · {c.clicks} clicks · {c.status}{c.refunded_cents > 0 ? ` · ${formatMoney(c.refunded_cents,c.currency)} refunded` : ""}</p></div>)}</details>}
    <p className="form-note">Listings rotate in matching sponsored placements. Views count a listing visible for at least one second. Pausing does not extend the seven-day period.</p>
  </section>;
}
