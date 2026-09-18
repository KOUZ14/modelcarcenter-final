"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import type { PromotionSettings } from "@/lib/promotion-rules";

type Campaign = { id: string; product_id: string; title: string; status: string; reason: string; deliveryReason: string | null; price_cents: number; currency: string; starts_at: number | null; ends_at: number | null; payment_status: string; total_cents: number; refunded_cents: number; dispute_status: string; impressions: number; clicks: number; refund_status: string | null };
type Data = { settings: PromotionSettings; pilotEligible: boolean; termsVersion: string; listings: Array<{ id: string; title: string; unavailable: string | null }>; campaigns: Campaign[] };

export async function promotionRequest(url: string, payload?: Record<string, unknown>) {
  const response = await fetch(url, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Promotion request failed.");
  return body;
}

export function PromotedListingsPanel() {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [productId, setProductId] = useState(""), [accepted, setAccepted] = useState(false);
  const requestKey = useRef("");
  const load = useCallback(async () => { setData(await promotionRequest("/api/store/promotions")); }, []);
  useEffect(() => {
    queueMicrotask(() => {
      setProductId(new URLSearchParams(window.location.search).get("promotion_product") ?? "");
      void load().catch(e => setError(e.message));
    });
  }, [load]);
  useEffect(() => {
    if (!data?.campaigns.some(c => c.status === "pending_payment" || c.refund_status?.includes("queued") || c.refund_status?.includes("pending"))) return;
    const timer = setInterval(() => void load().catch(() => {}), 15_000);
    return () => clearInterval(timer);
  }, [data, load]);
  async function purchase(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const result = await promotionRequest("/api/store/promotions/checkout", { productId, requestKey: requestKey.current, termsVersion: accepted ? data?.termsVersion : "" });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else { await load(); setMessage("Payment status refreshed."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Purchase failed."); await load().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function action(campaignId: string, action: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await promotionRequest("/api/store/promotions", { campaignId, action });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      await load(); setMessage("Campaign updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }
  const settings = data?.settings;
  const canBuy = settings?.purchasesEnabled && settings.servingEnabled && settings.priceCents >= 50 && settings.taxMode !== "unconfigured" && data?.pilotEligible;
  const listing = data?.listings.find(l => l.id === productId);
  return <div className="store-stack">
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="store-panel"><h3>Promote a listing</h3>
      <p>Show an in-stock listing in sponsored marketplace placements for seven calendar days. Placements match the collector&apos;s search and rotate between stores. Views and sales are not guaranteed.</p>
      {!data ? <p role="status">Loading promotions…</p> : !canBuy ? <p className="hub-note">{!data.pilotEligible ? "Promotions are currently available to participating pilot stores." : "New promotion purchases are currently unavailable. Existing campaigns remain below."}</p> : <form className="promotion-form" onSubmit={purchase}>
        <label>Listing<select value={productId} required onChange={e => { setProductId(e.target.value); requestKey.current = ""; setAccepted(false); }}><option value="">Choose a listing</option>{data.listings.map(l => <option key={l.id} value={l.id} disabled={Boolean(l.unavailable)}>{l.title}{l.unavailable ? ` — ${l.unavailable}` : ""}</option>)}</select></label>
        {listing?.unavailable && <p>{listing.unavailable}</p>}
        <p><strong>{formatMoney(settings.priceCents, settings.currency)} for seven days</strong>{settings.taxMode === "automatic" ? ". Applicable tax is calculated and the full total shown in Stripe before payment." : ". No additional promotion tax is configured."}</p>
        <p>Pauses do not extend the end date. Voluntary cancellation after activation is not refundable. If activation fails, the payment is refunded. Renewals require a new purchase.</p>
        <label className="promotion-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required/>I accept the <Link href="/promotion-terms" target="_blank">promotion terms</Link>.</label>
        <button className="button dark small" disabled={busy || !accepted || !listing || Boolean(listing.unavailable)}>Continue to payment</button>
      </form>}
    </section>
    <section className="store-panel"><div className="panel-heading"><h3>Your campaigns</h3><button className="text-button" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Refresh</button></div>
      <p className="hub-note">Recorded impressions require at least half the card to be visible for one second. Clicks count product links in sponsored cards. These counts are not unique people or attributed sales.</p>
      {data && !data.campaigns.length && <p>No campaigns yet.</p>}
      <div className="promotion-campaigns">{data?.campaigns.map(c => <article className="promotion-campaign" key={c.id}>
        <div><h4>{c.title}</h4><p><strong>{c.status.replaceAll("_", " ")}</strong>{c.reason ? ` · ${c.reason.replaceAll("_", " ")}` : ""}</p>
          <p>{c.starts_at ? `${new Date(c.starts_at).toLocaleString()} – ${new Date(c.ends_at!).toLocaleString()}` : "Starts after payment is confirmed."}</p>
          <p>{formatMoney(c.total_cents || c.price_cents, c.currency)} · Payment {c.payment_status}{c.refund_status ? ` · Refund ${c.refund_status}` : ""}{c.refunded_cents > 0 ? ` · ${formatMoney(c.refunded_cents, c.currency)} refunded` : ""}</p>
          <p>{c.impressions} impressions · {c.clicks} clicks · {c.impressions ? `${(c.clicks / c.impressions * 100).toFixed(1)}% CTR` : "CTR unavailable"}</p>
          {c.status === "active" && c.deliveryReason && <p>Currently not showing: {c.deliveryReason}</p>}
        </div><div className="row-actions">
          {c.status === "pending_payment" && <><button className="button outline small" disabled={busy} onClick={() => void action(c.id, "continue")}>Continue payment</button><button className="text-button" disabled={busy} onClick={() => void action(c.id, "reconcile")}>Check payment</button></>}
          {c.status === "active" && <button className="button outline small" disabled={busy} onClick={() => void action(c.id, "pause")}>Pause</button>}
          {c.status === "paused" && c.reason === "seller_paused" && <button className="button outline small" disabled={busy} onClick={() => void action(c.id, "resume")}>Resume</button>}
          {["active", "paused", "pending_payment"].includes(c.status) && <button className="text-button" disabled={busy} onClick={() => { if (window.confirm("End this campaign? Activated campaigns do not receive a refund for voluntary cancellation.")) void action(c.id, "end"); }}>End campaign</button>}
          {["ended", "expired"].includes(c.status) && canBuy && <button className="text-button" disabled={busy} onClick={() => { setProductId(c.product_id); requestKey.current = ""; setAccepted(false); }}>Promote again</button>}
        </div>
      </article>)}</div>
    </section>
  </div>;
}
