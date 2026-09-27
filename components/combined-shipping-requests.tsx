"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { CombinedShippingRequest } from "@/lib/combined-shipping";
import { formatMoney } from "@/lib/format";

export function CombinedShippingRequests({ sellerContext = false }: { sellerContext?: boolean } = {}) {
  const [requests, setRequests] = useState<CombinedShippingRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/shipping/combined", { cache: "no-store" });
        const data = await response.json() as { requests?: CombinedShippingRequest[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Shipping requests could not be loaded.");
        if (active) { setRequests(data.requests ?? []); setError(""); setNow(Date.now()); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Shipping requests could not be loaded."); }
      finally { if (active) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const visible = sellerContext ? requests.filter(request => request.viewerRole === "seller") : requests;
  return <section className="combined-requests" id="shipping-requests" aria-labelledby="shipping-requests-title">
    <div className="panel-heading"><div><h2 id="shipping-requests-title">Combined shipping requests</h2><p>Quote shipping before payment. Quotes last 48 hours for the listed items and address.</p></div><Link className="text-link" href={sellerContext ? "/store?view=orders" : "/cart"}>{sellerContext ? "Open Orders" : "Return to cart"}</Link></div>
    {loading && <p role="status">Loading shipping requests…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !visible.length && <p>No shipping requests yet. Buyers can request a quote from their cart when buying two or more models from one seller.</p>}
    {visible.map((request) => <ShippingRequestCard key={request.id} request={request} now={now} onUpdate={setRequests} />)}
  </section>;
}

function ShippingRequestCard({ request, now, onUpdate }: { request: CombinedShippingRequest; now: number; onUpdate(requests: CombinedShippingRequest[]): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const expired = Date.parse(request.expiresAt) <= now;
  async function respond(action: string, form?: HTMLFormElement) {
    setBusy(true); setError("");
    try {
      const values = form ? Object.fromEntries(new FormData(form)) : {};
      const response = await fetch("/api/shipping/combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, action, id: request.id }) });
      const data = await response.json() as { requests?: CombinedShippingRequest[]; error?: string };
      if (!response.ok) throw new Error(data.error || "The request could not be updated.");
      onUpdate(data.requests ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be updated."); }
    finally { setBusy(false); }
  }
  function quote(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void respond("quote", event.currentTarget); }
  return <article className="combined-request-card">
    <h3>{request.sellerName} <span className="status-badge">{expired && ["pending", "quoted"].includes(request.status) ? "Expired" : request.status}</span></h3>
    <ul>{request.items.map((item) => <li key={item.productId}>{item.title} × {item.quantity}</li>)}</ul>
    <p>Ship to {request.destination.name}: {request.destination.street1}{request.destination.street2 ? `, ${request.destination.street2}` : ""}, {request.destination.city}, {request.destination.state} {request.destination.zip}</p>
    {request.amountCents !== null && <p><strong>Combined shipping: {formatMoney(request.amountCents, request.currency)}</strong> · {request.carrier} {request.service} · Estimated {request.estimatedDays} business days in transit</p>}
    {request.sellerNote && <p>{request.sellerNote}</p>}
    {request.viewerRole === "seller" && request.status === "pending" && !expired && <form className="combined-quote-form" onSubmit={quote}>
      <label>Total shipping price ({request.currency.toUpperCase()})<input required name="amount" type="number" min="0" step="0.01" disabled={busy}/></label>
      <label>Carrier<input required name="carrier" maxLength={80} placeholder="e.g. USPS" disabled={busy}/></label>
      <label>Service<input required name="service" maxLength={100} placeholder="e.g. Ground Advantage" disabled={busy}/></label>
      <label>Estimated transit (business days)<input required name="estimatedDays" type="number" min="1" max="60" disabled={busy}/></label>
      <label className="full-width">Note to buyer (optional)<textarea name="note" maxLength={500} disabled={busy}/></label>
      <p className="form-note full-width">Quote the total for packing these models together. Include required insurance and signature protection. Ship with the quoted service or an equal/faster service.</p>
      <button className="button dark" disabled={busy}>{busy ? "Saving…" : "Send shipping quote"}</button>
      <button className="button outline" type="button" disabled={busy} onClick={(event) => void respond("decline", event.currentTarget.form ?? undefined)}>Cannot combine shipping</button>
    </form>}
    {request.viewerRole === "buyer" && ["pending", "quoted"].includes(request.status) && !expired && <div className="dialog-actions"><Link className="button outline small" href="/cart">{request.status === "quoted" ? "Review quote in cart" : "Continue with standard shipping"}</Link><button className="text-button" disabled={busy} onClick={() => void respond("cancel")}>Cancel request</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
