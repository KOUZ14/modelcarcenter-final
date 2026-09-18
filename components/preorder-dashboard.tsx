"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { buyerPreorders } from "@/lib/preorders";
import type { buyerWaitlist } from "@/lib/preorder-waitlist";
import { formatMoney } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { preorderAction, ReservationTerms } from "./preorder-offer";
import { AdultConsent } from "./adult-consent";

type Reservation=Awaited<ReturnType<typeof buyerPreorders>>[number];
export function PreorderDashboard() {
  const [rows,setRows]=useState<Reservation[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [waitlist,setWaitlist]=useState<Awaited<ReturnType<typeof buyerWaitlist>>>([]);
  const load=useCallback(async()=>{const r=await fetch("/api/preorders",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error);setRows(b.reservations);setWaitlist(b.waitlist??[]);setLoading(false);},[]);
  useEffect(()=>{queueMicrotask(()=>void load().catch(e=>{setError(e.message);setLoading(false);}));},[load]);
  async function action(id:string,payload:Record<string,unknown>) {setBusy(true);setError("");try{await preorderAction({id,...payload});await load();}catch(e){setError(e instanceof Error?e.message:"Update failed.");}finally{setBusy(false);}}
  const outstanding=rows.filter(r=>["reserved","allocated","awaiting_payment"].includes(r.status));
  const totals=Object.entries(outstanding.reduce<Record<string,number>>((sum,r)=>({...sum,[r.terms.currency]:(sum[r.terms.currency]??0)+r.quantity*r.terms.priceCents}),{}));
  return <div className="preorder-dashboard">
    <p>Unpaid reservations are separate from purchases. <Link href="/account?view=orders">View paid orders and shipment tracking</Link>.</p>
    <div className="preorder-panel"><h2>Outstanding reservations</h2><p>{outstanding.length} active reservations · {totals.length?totals.map(([currency,value])=>formatMoney(value,currency)).join(" + "):"$0.00"} in merchandise commitments.</p><p>Shipping and tax are additional estimates until final payment.</p></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{loading&&<p role="status">Loading reservations…</p>}
    {!loading&&!rows.length&&<p>No reservations yet. <Link href="/marketplace?availability=preorder">Browse upcoming releases</Link>.</p>}
    {waitlist.length>0&&<section className="preorder-panel"><h2>Seller waitlists</h2><p>Interest only; no reserved unit, payment or reservation priority until you accept an invitation.</p>{waitlist.map(w=><p key={w.id}>{w.title} · {w.sellerName} · {w.quantity} requested · {w.status} {["waiting","invited"].includes(w.status)&&<button className="text-link" disabled={busy} onClick={()=>action(w.id,{action:"cancel_waitlist"})}>Leave waitlist</button>}</p>)}</section>}
    {rows.map(r=><article key={r.id} className="preorder-panel">
      <div className="preorder-heading"><h2>{r.terms.title}</h2><span className="preorder-state">{r.status.replaceAll("_"," ")}</span></div>
      <p>{r.terms.sellerName} · {r.quantity} {r.terms.saleUnit}{r.quantity===1?"":"s"} · {formatMoney(r.quantity*r.terms.priceCents,r.terms.currency)} item subtotal</p>
      {["reserved","allocated","awaiting_payment","hold"].includes(r.status)&&<p>Estimated remaining cost: {formatMoney(r.quantity*r.terms.priceCents+(r.terms.shippingEstimateCents??0),r.terms.currency)} {r.terms.shippingEstimateCents===null?"plus shipping and tax":"plus tax; shipping may change"}.</p>}
      <p>Original dispatch: <strong>{r.terms.dispatch.label}</strong><br/>Current estimate: <strong>{r.currentTerms.dispatch.label}</strong></p>
      {r.status==="hold"&&<form className="preorder-form" onSubmit={e=>{e.preventDefault();void action(r.id,{action:"confirm",acceptedTerms:true});}}><h3>Review invitation or checkout hold</h3><ReservationTerms terms={r.terms} quantity={r.quantity}/><p>Accept by {new Date(r.holdExpiresAt).toLocaleString()}. No acceptance means no reservation.</p><label className="preorder-check"><input type="checkbox" required/>I accept the displayed seller, full price, packaging, dispatch and cancellation terms.</label><button className="button dark" disabled={busy}>Accept unpaid reservation</button></form>}
      {r.paymentDeadline&&<p>Payment / allocation deadline: <time dateTime={r.paymentDeadline}>{new Date(r.paymentDeadline).toLocaleString()}</time></p>}
      {r.checkoutReservationId && r.status !== "converted" && <button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"close_checkout"})}>Close payment checkout to change details</button>}
      {r.consentState==="required"&&<div className="preorder-notice"><h3>Your response is required</h3><p>{r.reason?.replaceAll("_"," ")}. Respond by {r.consentDeadline?new Date(r.consentDeadline).toLocaleString():"the notice deadline"}. No response cancels this unpaid reservation without a fee. Payment is disabled.</p>
        {r.currentTerms.dispatch.end&&r.currentTerms.dispatch.end>new Date().toISOString()&&<button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"keep",revision:r.currentTerms.revision})}>Keep reservation with this estimate</button>}</div>}
      {r.status==="allocated"&&<div className="preorder-notice"><h3>Partial stock received</h3><p>{r.allocatedQuantity} of your {r.quantity} units are available. Accepting buys only these units and cancels the missing portion.</p><div className="row-actions"><button className="button dark" disabled={busy} onClick={()=>action(r.id,{action:"accept_partial"})}>Accept {r.allocatedQuantity} units</button><button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"wait"})}>Wait for a revised estimate</button></div></div>}
      {r.status==="awaiting_payment"&&r.consentState==="accepted"&&<PreorderPayment reservation={r}/>}
      {["reserved","allocated","awaiting_payment"].includes(r.status)&&<><div className="row-actions"><button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"cancel"})}>Cancel without a fee</button><Link className="text-link" href={`/messages?product=${encodeURIComponent(r.terms.listingId)}`}>Message seller</Link></div>
        <details><summary>Update contact or reduce quantity</summary><form className="preorder-form" onSubmit={e=>{e.preventDefault();void action(r.id,{action:"contact",email:new FormData(e.currentTarget).get("email")});}}><label>Contact email<input name="email" type="email" defaultValue={r.contactEmail} required/></label><button className="button outline" disabled={busy}>Save contact</button></form><p>Enter or change your delivery address when calculating final shipping below. Shipping and tax are recalculated.</p>
          <form className="preorder-form" onSubmit={e=>{e.preventDefault();void action(r.id,{action:"reduce",quantity:Number(new FormData(e.currentTarget).get("quantity"))});}}><label>Reduce quantity<input type="number" name="quantity" min="1" max={r.quantity} defaultValue={r.quantity} required/></label><button className="button outline" disabled={busy}>Reduce quantity</button><p>Additional units require a separate reservation and receive a new queue position.</p></form></details></>}
      {(r.payment.results ?? []).map((p,i)=><p key={i}>Payment: {String(p.status)} · Refund: {String(p.refundStatus).replaceAll("_"," ")}</p>)}
      <details><summary>Accepted terms and update history</summary><ReservationTerms terms={r.terms} quantity={r.quantity}/>{r.events.map(e=><div key={e.id} className="preorder-event"><strong>{e.kind.replaceAll("_"," ")}</strong> · {e.createdAt}<EventDetail detail={e.detail}/></div>)}</details>
    </article>)}
  </div>;
}
function EventDetail({detail}:{detail:string}) { const d=JSON.parse(detail); return <p>{[d.message,d.status?`Status: ${d.status}`:null,d.reason?.replaceAll("_"," "),d.currentDispatch?.label?`Dispatch: ${d.currentDispatch.label}`:null,d.responseDeadline?`Respond by ${d.responseDeadline}`:null,d.affectedUnits?`${d.affectedUnits} units affected`:null,d.refundedCents!=null?`Returned ${formatMoney(d.refundedCents,d.currency)}; still owed ${formatMoney(d.outstandingCents,d.currency)}; pending ${formatMoney(d.pendingCents,d.currency)}`:null].filter(Boolean).join(" · ")}</p>; }
function PreorderPayment({reservation:r}:{reservation:Reservation}) {
  const [quote,setQuote]=useState<{quoteId:string|null;options:Array<{id:string;provider:string;serviceLevel:string;amountCents:number}>}|null>(null);
  const [destination,setDestination]=useState<Record<string,string>|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[selected,setSelected]=useState("");
  async function calculate(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const dest=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
    try{const q=await preorderAction({action:"quote",id:r.id,destination:dest});setQuote(q);setDestination(dest);setSelected(q.options[0]?.id??"");}catch(e){setError(e instanceof Error?e.message:"Quote failed.");}finally{setBusy(false);}
  }
  async function pay(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget),rate=quote!.options.find(o=>o.id===selected);
    try{const result=await preorderAction({action:"pay",id:r.id,destination,shippingSelection:{quoteId:quote!.quoteId,rateId:selected},shippingCents:rate?.amountCents,acceptedFinalQuote:form.get("accept")==="on",adultConsent:form.get("adultConsent"),policyVersion:POLICY_VERSION});window.location.assign(result.url);}catch(e){setError(e instanceof Error?e.message:"Payment could not start.");setBusy(false);}
  }
  return <details className="preorder-payment"><summary>Pay for your allocated stock</summary><p>{r.allocatedQuantity} inspected units are held for you. Ships within {r.terms.handlingDays} business days after payment. Review the final tax and total on the secure payment page before paying.</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <form className="preorder-form preorder-grid" onSubmit={calculate} onChange={()=>{setQuote(null);setDestination(null);}}>
      {[['name','Full name'],['street1','Street address'],['street2','Apartment / unit (optional)'],['city','City'],['state','State / region'],['zip','Postal code'],['country','Country code']].map(([name,label])=><label key={name}>{label}<input name={name} required={name!=="street2"} defaultValue={name==="country"?"US":""} maxLength={name==="country"?2:120}/></label>)}
      <button className="button outline" disabled={busy}>Calculate final shipping</button>
    </form>
    {quote&&<form className="preorder-form" onSubmit={pay}><label>Shipping service<select value={selected} onChange={e=>setSelected(e.target.value)}>{quote.options.map(o=><option key={o.id} value={o.id}>{o.provider} {o.serviceLevel} — {formatMoney(o.amountCents,r.terms.currency)}</option>)}</select></label><p>Locked merchandise total: {formatMoney(r.quantity*r.terms.priceCents,r.terms.currency)}. Applicable tax shown before payment.</p><label className="preorder-check"><input name="accept" type="checkbox" required/>I accept this shipping amount, delivery address, handling deadline and <Link href="/terms">checkout policies</Link>.</label><AdultConsent/><button className="button dark" disabled={busy}>Review final total and pay</button></form>}
  </details>;
}
