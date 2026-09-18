"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { promotionRequest } from "./promoted-listings-panel";
import type { PromotionSettings } from "@/lib/promotion-rules";
import { formatMoney } from "@/lib/format";
type AdminData = {
  settings: PromotionSettings;
  campaigns: Array<{ id: string; seller_id: string; title: string; status: string; reason: string; total_cents: number; refunded_cents: number; payment_status: string; payment_error: string; dispute_status: string; ends_at: number | null }>;
  refunds: Array<{ id: string; campaign_id: string; amount_cents: number; status: string; error: string }>;
  audit: Array<{ id: string; campaign_id: string | null; action: string; actor: string; detail: string; created_at: number }>;
  totals: { gross_cents: number; tax_cents: number; recorded_fee_cents: number; refunded_cents: number; unsettled_payments: number };
};
export function PromotionAdmin() {
  const [data, setData] = useState<AdminData | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => setData(await promotionRequest("/api/admin/promotions")), []);
  useEffect(() => { queueMicrotask(() => void load().catch(e => setError(e.message))); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>, extra: Record<string, unknown>) {
    event.preventDefault(); const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true); setError(""); setMessage("");
    try {
      await promotionRequest("/api/admin/promotions", { ...fields, ...extra, purchasesEnabled: fields.purchasesEnabled === "on", servingEnabled: fields.servingEnabled === "on", requestKey: crypto.randomUUID() });
      await load(); setMessage("Promotion changes saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }
  return <div className="store-stack"><p><Link href="/admin">Admin dashboard</Link> · Prices are in USD. Campaigns keep the price accepted at purchase.</p>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    {!data ? <p role="status">Loading promotions…</p> : <>
      <section className="store-panel"><h2>Availability and pricing</h2><p>The introductory price is $2.99 for seven calendar days. Set the applicable service tax treatment and pilot stores before enabling new purchases.</p>
        <form className="promotion-form" key={JSON.stringify(data.settings)} onSubmit={e => void submit(e, { action: "settings" })}>
          <label>Seven-day price (cents)<input name="priceCents" type="number" min="50" max="1000000" step="1" required defaultValue={data.settings.priceCents}/></label>
          <label>Promotion tax treatment<select name="taxMode" defaultValue={data.settings.taxMode}><option value="unconfigured">Not configured</option><option value="none">No tax collection required for this service</option><option value="automatic">Calculate tax in Stripe</option></select></label>
          <label>Stripe service tax code<input name="taxCode" defaultValue={data.settings.taxCode} placeholder="Required when calculating tax"/></label>
          <label>Pilot seller IDs (comma-separated; blank permits all eligible stores)<textarea name="sellerIds" defaultValue={data.settings.sellerIds.join(", ")}/></label>
          <label className="promotion-check"><input type="checkbox" name="purchasesEnabled" defaultChecked={data.settings.purchasesEnabled}/>Enable new promotion purchases</label>
          <label className="promotion-check"><input type="checkbox" name="servingEnabled" defaultChecked={data.settings.servingEnabled}/>Serve paid sponsored placements</label>
          <p>Disabling purchases preserves paid placements. Disabling serving stops all placements immediately; record the outage reason and review affected sellers for adjustments.</p>
          <Reason/><button className="button dark small" disabled={busy}>Save promotion settings</button>
        </form>
      </section>
      <section className="store-panel"><h2>Promotion payments</h2><div className="promotion-metrics"><p>Collected: <strong>{formatMoney(data.totals.gross_cents)}</strong></p><p>Tax collected: <strong>{formatMoney(data.totals.tax_cents)}</strong></p><p>Refunded: <strong>{formatMoney(data.totals.refunded_cents)}</strong></p><p>Recorded processing fees: <strong>{formatMoney(data.totals.recorded_fee_cents)}</strong></p></div><p>{data.totals.unsettled_payments} payments awaiting processing-fee details. Amounts include promotion purchases only; tax reversals and disputes need reconciliation before accounting use.</p></section>
      <section className="store-panel"><h2>Campaigns</h2>{!data.campaigns.length && <p>No campaigns yet.</p>}<div className="promotion-campaigns">{data.campaigns.map(c => <article className="promotion-campaign" key={c.id}><h3>{c.title}</h3><p>{c.status} · Payment {c.payment_status} · {c.reason || "No delivery restriction recorded"}</p><p>Store: {c.seller_id} · Campaign: {c.id}</p><p>Expires: {c.ends_at ? new Date(c.ends_at).toLocaleString() : "Not activated"} · Dispute: {c.dispute_status}</p>{c.payment_error && <p role="alert">{c.payment_error}</p>}
        <form className="promotion-form" onSubmit={e => void submit(e, { campaignId: c.id })}><label>Action<select name="action"><option value="end">End campaign</option><option value="pause">Pause campaign</option><option value="reinstate">Reinstate eligible paused campaign</option><option value="refund">Refund payment</option></select></label><label>Refund amount (cents)<input name="amountCents" type="number" min="1" max={Math.max(1, c.total_cents - c.refunded_cents)} defaultValue={Math.max(1, c.total_cents - c.refunded_cents)}/></label><Reason/><button className="button outline small" disabled={busy}>Apply action</button></form>
      </article>)}</div></section>
      <section className="store-panel"><h2>Refund recovery</h2>{!data.refunds.length && <p>No refunds recorded.</p>}{data.refunds.map(r => <p key={r.id}>{r.campaign_id} · {formatMoney(r.amount_cents)} · {r.status}{r.error ? ` · ${r.error}` : ""}</p>)}<form className="promotion-form" onSubmit={e => void submit(e, { action: "maintenance" })}><Reason/><button className="button outline small" disabled={busy}>Run reconciliation and expiry</button></form></section>
      <section className="store-panel"><h2>Recent changes</h2>{data.audit.map(a => <details key={a.id}><summary>{new Date(a.created_at).toLocaleString()} · {a.action} · {a.actor}</summary><p>{a.campaign_id}</p><pre className="promotion-audit-detail">{a.detail}</pre></details>)}</section>
    </>}
  </div>;
}
function Reason() { return <label>Reason<input name="reason" required minLength={3} maxLength={500}/></label>; }
