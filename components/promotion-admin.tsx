"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { promotionRequest } from "./promoted-listings-panel";
import type { PromotionSettings } from "@/lib/promotion-rules";
import { formatMoney } from "@/lib/format";
type AdminData = {
  settings: PromotionSettings;
  sellers: Array<{ id: string; store_name: string; status: string }>;
  impact: { campaigns: number; sellers: number };
  campaigns: Array<{ id: string; seller_id: string; title: string; status: string; reason: string; total_cents: number; refunded_cents: number; payment_status: string; payment_error: string; dispute_status: string; ends_at: number | null }>;
  refunds: Array<{ id: string; campaign_id: string; amount_cents: number; status: string; error: string }>;
  audit: Array<{ id: string; campaign_id: string | null; action: string; actor: string; detail: string; created_at: number }>;
  totals: { gross_cents: number; tax_cents: number; recorded_fee_cents: number; refunded_cents: number; unsettled_payments: number };
};
export function PromotionAdmin() {
  const [data, setData] = useState<AdminData | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (pending) { previewRef.current?.focus(); previewRef.current?.scrollIntoView({ block: "start" }); } }, [pending]);
  const [audience, setAudience] = useState("selected");
  const load = useCallback(async () => { const next = await promotionRequest("/api/admin/promotions"); setData(next); setAudience(next.settings.sellerIds.length ? "selected" : "all"); }, []);
  useEffect(() => { queueMicrotask(() => void load().catch(e => setError(e.message))); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>, extra: Record<string, unknown>) {
    event.preventDefault(); const form = event.currentTarget;
    const formData = new FormData(form);
    const fields = Object.fromEntries(formData);
    const payload: Record<string, unknown> = { ...fields, ...extra, purchasesEnabled: fields.purchasesEnabled === "on", servingEnabled: fields.servingEnabled === "on", requestKey: crypto.randomUUID() };
    if (extra.action === "settings") {
      payload.priceCents = Math.round(Number(fields.price) * 100);
      payload.sellerIds = audience === "all" ? "" : formData.getAll("sellerIds").join(",");
      payload.audience = audience;
      payload.expectedSettings = JSON.stringify(data?.settings);
      if (audience === "selected" && !payload.sellerIds) { setError("Select at least one seller, or choose All eligible sellers."); return; }
    }
    if (fields.amount) payload.amountCents = Math.round(Number(fields.amount) * 100);
    setPending(payload);
  }
  async function confirmChange() {
    if (!pending) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await promotionRequest("/api/admin/promotions", pending);
      setPending(null);
      await load(); setMessage("Promotion changes saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }
  return <div className="store-stack"><p><Link href="/admin">Admin dashboard</Link> · Prices are in USD. Campaigns keep the price accepted at purchase.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    {pending && <section className="store-panel admin-focus-panel" ref={previewRef} tabIndex={-1} role="region" aria-label="Review promotion change"><h2>Review change before saving</h2>{pending.action === "settings" ? <><p>Seven-day price: {formatMoney(Number(pending.priceCents))}. Audience: {pending.audience === "all" ? "All eligible sellers" : `${String(pending.sellerIds).split(",").length} selected sellers`}.</p><p>New purchases: {pending.purchasesEnabled ? "enabled" : "disabled"}. Paid placements: {pending.servingEnabled ? "serving" : "stopped"}.</p><p>{data?.impact.campaigns ?? 0} active paid campaigns across {data?.impact.sellers ?? 0} sellers currently exist. {pending.servingEnabled ? "Accepted campaign prices stay unchanged." : "Stopping serving interrupts these placements immediately. Review adjustments for the affected sellers."}</p></> : <p>{String(pending.action).replaceAll("_", " ")} {pending.campaignId ? `campaign ${pending.campaignId}` : "promotion reconciliation"}{pending.action === "refund" ? ` - Refund ${formatMoney(Number(pending.amountCents))}` : ""}</p>}<p>Reason: {String(pending.reason)}</p><div className="row-actions"><button className="button dark small" disabled={busy} onClick={() => void confirmChange()}>Confirm change</button><button className="button outline small" disabled={busy} onClick={() => setPending(null)}>Back to editing</button></div></section>}
    {!data ? <p role="status">Loading promotions…</p> : <>
      <section className="store-panel"><h2>Availability and pricing</h2><p>The introductory price is $2.99 for seven calendar days. Set the applicable service tax treatment and pilot stores before enabling new purchases.</p>
        <form className="promotion-form" key={JSON.stringify(data.settings)} onSubmit={e => void submit(e, { action: "settings" })}>
          <label>Seven-day price (USD)<input name="price" type="number" min="0.50" max="10000" step="0.01" required defaultValue={(data.settings.priceCents / 100).toFixed(2)}/></label>
          <label>Promotion tax treatment<select name="taxMode" defaultValue={data.settings.taxMode}><option value="unconfigured">Not configured</option><option value="none">No tax collection required for this service</option><option value="automatic">Calculate tax in Stripe</option></select></label>
          <label>Stripe service tax code<input name="taxCode" defaultValue={data.settings.taxCode} placeholder="Required when calculating tax"/></label>
          <label>Eligible audience<select value={audience} onChange={e => setAudience(e.target.value)}><option value="selected">Selected sellers</option><option value="all">All eligible sellers</option></select></label>{audience === "selected" && <fieldset><legend>Select pilot sellers</legend>{data.sellers.map(seller => <label className="promotion-check" key={seller.id}><input type="checkbox" name="sellerIds" value={seller.id} defaultChecked={data.settings.sellerIds.includes(seller.id)} />{seller.store_name} ({seller.status})</label>)}</fieldset>}
          <label className="promotion-check"><input type="checkbox" name="purchasesEnabled" defaultChecked={data.settings.purchasesEnabled}/>Enable new promotion purchases</label>
          <label className="promotion-check"><input type="checkbox" name="servingEnabled" defaultChecked={data.settings.servingEnabled}/>Serve paid sponsored placements</label>
          <p>Disabling purchases preserves paid placements. Disabling serving stops all placements immediately; record the outage reason and review affected sellers for adjustments.</p>
          <Reason/><button className="button dark small" disabled={busy || Boolean(pending)}>Preview settings change</button>
        </form>
      </section>
      <section className="store-panel"><h2>Promotion payments</h2><div className="promotion-metrics"><p>Collected: <strong>{formatMoney(data.totals.gross_cents)}</strong></p><p>Tax collected: <strong>{formatMoney(data.totals.tax_cents)}</strong></p><p>Refunded: <strong>{formatMoney(data.totals.refunded_cents)}</strong></p><p>Recorded processing fees: <strong>{formatMoney(data.totals.recorded_fee_cents)}</strong></p></div><p>{data.totals.unsettled_payments} payments awaiting processing-fee details. Amounts include promotion purchases only; tax reversals and disputes need reconciliation before accounting use.</p></section>
      <section className="store-panel"><h2>Campaigns</h2>{!data.campaigns.length && <p>No campaigns yet.</p>}<div className="promotion-campaigns">{data.campaigns.map(c => <article className="promotion-campaign" key={c.id}><h3>{c.title}</h3><p>{c.status} · Payment {c.payment_status} · {c.reason || "No delivery restriction recorded"}</p><p>Store: {data.sellers.find(seller => seller.id === c.seller_id)?.store_name || c.seller_id} · Campaign: {c.id}</p><p>Expires: {c.ends_at ? new Date(c.ends_at).toLocaleString() : "Not activated"} · Dispute: {c.dispute_status}</p>{c.payment_error && <p role="alert">{c.payment_error}</p>}
        <form className="promotion-form" onSubmit={e => void submit(e, { campaignId: c.id })}><label>Action<select name="action"><option value="end">End campaign</option><option value="pause">Pause campaign</option><option value="reinstate">Reinstate eligible paused campaign</option><option value="refund">Refund payment</option></select></label><label>Refund amount (USD)<input name="amount" type="number" min="0.01" step="0.01" max={Math.max(0.01, (c.total_cents - c.refunded_cents) / 100)} defaultValue={(Math.max(1, c.total_cents - c.refunded_cents) / 100).toFixed(2)}/></label><Reason/><button className="button outline small" disabled={busy || Boolean(pending)}>Preview action</button></form>
      </article>)}</div></section>
      <section className="store-panel"><h2>Refund recovery</h2>{!data.refunds.length && <p>No refunds recorded.</p>}{data.refunds.map(r => <p key={r.id}>{r.campaign_id} · {formatMoney(r.amount_cents)} · {r.status}{r.error ? ` · ${r.error}` : ""}</p>)}<form className="promotion-form" onSubmit={e => void submit(e, { action: "maintenance" })}><Reason/><button className="button outline small" disabled={busy || Boolean(pending)}>Run reconciliation and expiry</button></form></section>
      <section className="store-panel"><h2>Recent changes</h2>{!data.audit.length && <p>No promotion changes recorded yet.</p>}{data.audit.map(a => <details key={a.id}><summary>{new Date(a.created_at).toLocaleString()} · {a.action} · {a.actor}</summary><p>{a.campaign_id}</p><pre className="promotion-audit-detail">{a.detail}</pre></details>)}</section>
    </>}
  </div>;
}
function Reason() { return <label>Reason<input name="reason" required minLength={3} maxLength={500}/></label>; }
