"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { buyerPreorders } from "@/lib/preorders";
import type { buyerWaitlist } from "@/lib/preorder-waitlist";
import { formatMoney } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { preorderAction, ReservationTerms } from "./preorder-offer";
import { AdultConsent } from "./adult-consent";
import { AddressFields } from "./address-fields";

type Reservation=Awaited<ReturnType<typeof buyerPreorders>>[number];
export function PreorderDashboard({orderIds,children}:{orderIds:string[];children:(preorders:Reservation[])=>ReactNode}) {
  const router=useRouter();
  const refreshedOrders=useRef(new Set<string>());
  const [rows,setRows]=useState<Reservation[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [waitlist,setWaitlist]=useState<Awaited<ReturnType<typeof buyerWaitlist>>>([]);
  const load=useCallback(async()=>{const r=await fetch("/api/preorders",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error);setRows(b.reservations);setWaitlist(b.waitlist??[]);setLoading(false);},[]);
  useEffect(()=>{queueMicrotask(()=>void load().catch(e=>{setError(e.message);setLoading(false);}));},[load]);
  useEffect(()=>{if(!rows.some(r=>r.status === "hold" || r.deposit?.refundStatus === "pending" || r.deposit?.refundStatus === "required"))return;const timer=setInterval(()=>void load().catch(()=>{}),15000);return()=>clearInterval(timer);},[rows,load]);
  useEffect(()=>{
    const missing=rows.flatMap(r=>r.orderId&&!orderIds.includes(r.orderId)&&!refreshedOrders.current.has(r.orderId)?[r.orderId]:[]);
    if(missing.length){missing.forEach(id=>refreshedOrders.current.add(id));router.refresh();}
  },[rows,orderIds,router]);
  async function action(id:string,payload:Record<string,unknown>) {setBusy(true);setError("");try{const result=await preorderAction({id,...payload});if(result.url){window.location.assign(result.url);return;}await load();}catch(e){setError(e instanceof Error?e.message:"Update failed.");}finally{setBusy(false);}}
  const preorders=rows.filter(r=>!r.orderId||!orderIds.includes(r.orderId));
  return <div className="garage-list integrated-preorders">
    {error&&<p className="form-error" role="alert">{error}</p>}{loading&&<p role="status">Loading reservations…</p>}
    {!loading&&!error&&!rows.length&&!orderIds.length&&<p>No orders yet. <Link href="/marketplace">Find a model</Link>.</p>}
    {preorders.map(r=><article key={r.id} id={`preorder-${r.id}`} className="order-preorder">
      <div><b>Preorder</b><span className="status">{r.status === "hold" ? "Deposit not paid" : r.status === "reserved" ? "Awaiting stock" : r.status === "awaiting_payment" ? "Balance due" : r.status === "converted" ? "Paid" : r.status.replaceAll("_"," ")}</span></div>
      <h3>{r.terms.title}</h3>
      <p>{r.terms.sellerName} · {r.quantity} {r.terms.saleUnit}{r.quantity===1?"":"s"} · {formatMoney(r.quantity*r.terms.priceCents,r.terms.currency)} item subtotal</p>
      {r.deposit&&<p><strong>Deposit paid: {formatMoney(r.deposit.amountCents,r.terms.currency)}</strong>{r.deposit.taxCents > 0 ? ` (includes ${formatMoney(r.deposit.taxCents,r.terms.currency)} tax)` : ""}{r.deposit.refundedCents > 0 ? ` · ${formatMoney(r.deposit.refundedCents,r.terms.currency)} refunded` : ""}</p>}
      {["reserved","allocated","awaiting_payment","hold"].includes(r.status)&&<p>Remaining item balance: <strong>{formatMoney(r.quantity*r.terms.priceCents-(r.deposit?.subtotalCents ?? 0),r.terms.currency)}</strong>, plus shipping and applicable tax.</p>}
      <p>Expected to ship: <strong>{r.currentTerms.dispatch.label}</strong></p>
      <details className="order-preorder-details" open={["hold","awaiting_payment","allocated"].includes(r.status)||r.consentState==="required"}>
      <summary>{r.status==="hold" ? "Review and pay deposit" : r.consentState==="required" ? "Review updated ship date" : r.status==="awaiting_payment" ? "Pay remaining balance" : "Order details and options"}</summary>
      {r.status==="hold"&&<form className="preorder-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void action(r.id,{action:r.terms.paymentModel === "deposit_10" ? "deposit" : "confirm",acceptedTerms:form.get("accepted")==="on",adultConsent:form.get("adultConsent")});}}><ReservationTerms terms={r.terms} quantity={r.quantity}/><p>Complete checkout by {new Date(r.holdExpiresAt).toLocaleString()}.</p><label className="preorder-check"><input type="checkbox" name="accepted" required/>I accept the expected ship date and preorder cancellation terms.</label><AdultConsent/><button className="button dark" disabled={busy}>{r.terms.paymentModel === "deposit_10" ? "Pay deposit" : "Confirm reservation"}</button></form>}
      {r.paymentDeadline&&<p>Payment / allocation deadline: <time dateTime={r.paymentDeadline}>{new Date(r.paymentDeadline).toLocaleString()}</time></p>}
      {r.checkoutReservationId && r.status !== "converted" && <button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"close_checkout"})}>Close payment checkout to change details</button>}
      {r.consentState==="required"&&<div className="preorder-notice"><h3>The seller updated your preorder</h3><p>Respond by {r.consentDeadline?new Date(r.consentDeadline).toLocaleString():"the notice deadline"}. You can accept the revised date or cancel for a refund. If you do not respond, your preorder is cancelled and any deposit refunded.</p>
        {r.currentTerms.dispatch.end&&r.currentTerms.dispatch.end>new Date().toISOString()&&<button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"keep",revision:r.currentTerms.revision})}>Keep reservation with this estimate</button>}</div>}
      {r.status==="allocated"&&<div className="preorder-notice"><h3>Partial stock received</h3><p>{r.allocatedQuantity} of your {r.quantity} units are available. Accepting buys only these units and cancels the missing portion.</p><div className="row-actions"><button className="button dark" disabled={busy} onClick={()=>action(r.id,{action:"accept_partial"})}>Accept {r.allocatedQuantity} units</button><button className="button outline" disabled={busy} onClick={()=>action(r.id,{action:"wait"})}>Wait for a revised estimate</button></div></div>}
      {r.status==="awaiting_payment"&&r.consentState==="accepted"&&<PreorderPayment reservation={r}/>}
      {["reserved","allocated","awaiting_payment"].includes(r.status)&&<><div className="row-actions"><button className="button outline" disabled={busy} onClick={()=>{if(r.deposit && r.consentState !== "required" && !window.confirm("Cancel your preorder? A change-of-mind cancellation does not refund the deposit unless the seller approves. You can message the seller first."))return;void action(r.id,{action:"cancel"});}}>{r.consentState === "required" ? "Cancel and refund" : "Cancel preorder"}</button><Link className="text-link" href={`/messages?product=${encodeURIComponent(r.terms.listingId)}`}>Message seller</Link></div>
        <details><summary>Update contact details</summary><form className="preorder-form" onSubmit={e=>{e.preventDefault();void action(r.id,{action:"contact",email:new FormData(e.currentTarget).get("email")});}}><label>Contact email<input name="email" type="email" defaultValue={r.contactEmail} required/></label><button className="button outline" disabled={busy}>Save contact</button></form><p>Enter your delivery address when calculating final shipping. Shipping and tax are recalculated.</p>
          {r.terms.paymentModel !== "deposit_10" ? <form className="preorder-form" onSubmit={e=>{e.preventDefault();void action(r.id,{action:"reduce",quantity:Number(new FormData(e.currentTarget).get("quantity"))});}}><label>Reduce quantity<input type="number" name="quantity" min="1" max={r.quantity} defaultValue={r.quantity} required/></label><button className="button outline" disabled={busy}>Reduce quantity</button></form> : <p>To change quantity, message the seller about cancelling and refunding before placing a new preorder.</p>}</details></>}
      {r.deposit && r.deposit.refundStatus !== "not_required" && <p role="status">Deposit refund: {r.deposit.refundStatus === "succeeded" ? "Completed" : ["required","pending"].includes(r.deposit.refundStatus) ? "Processing" : "Needs attention - contact support"}.</p>}
      {r.deposit && ["cancelled","expired"].includes(r.status) && r.deposit.refundStatus === "not_required" && <p>Your preorder has ended. The deposit is retained under the accepted cancellation terms. Contact the seller to request a discretionary refund.</p>}
      <details><summary>Accepted terms and update history</summary><ReservationTerms terms={r.terms} quantity={r.quantity}/>{r.events.map(e=><div key={e.id} className="preorder-event"><strong>{e.kind.replaceAll("_"," ")}</strong> · {e.createdAt}<EventDetail detail={e.detail}/></div>)}</details>
      </details>
    </article>)}
    {children(rows)}
    {waitlist.length>0&&<details className="order-preorder-details"><summary>Upcoming release waitlists ({waitlist.length})</summary><p>No payment or reserved unit until you accept an invitation.</p>{waitlist.map(w=><p key={w.id}>{w.title} · {w.sellerName} · {w.quantity} requested · {w.status} {["waiting","invited"].includes(w.status)&&<button className="text-link" disabled={busy} onClick={()=>action(w.id,{action:"cancel_waitlist"})}>Leave waitlist</button>}</p>)}</details>}
  </div>;
}
export function PreorderOrderHistory({reservation:r}:{reservation:Reservation|undefined}) {
  if(!r)return null;
  return <details className="order-preorder-details"><summary>Preorder payment and history</summary>
    {r.deposit&&<p>{formatMoney(r.deposit.amountCents,r.terms.currency)} deposit credited to this order{r.deposit.refundedCents>0 ? ` · ${formatMoney(r.deposit.refundedCents,r.terms.currency)} refunded` : ""}.</p>}
    {r.deposit&&r.deposit.refundStatus!=="not_required"&&<p>Deposit refund: {r.deposit.refundStatus==="succeeded" ? "Completed" : ["required","pending"].includes(r.deposit.refundStatus) ? "Processing" : "Needs attention"}.</p>}
    <ReservationTerms terms={r.terms} quantity={r.quantity}/>{r.events.map(e=><div key={e.id} className="preorder-event"><strong>{e.kind.replaceAll("_"," ")}</strong> · {e.createdAt}<EventDetail detail={e.detail}/></div>)}
  </details>;
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
  return <details className="preorder-payment" open><summary>Pay remaining balance</summary><p>Your {r.allocatedQuantity} items are ready. Ships within {r.terms.handlingDays} business days after payment.</p><p>Item balance: <strong>{formatMoney(r.quantity*r.terms.priceCents-(r.deposit?.subtotalCents ?? 0),r.terms.currency)}</strong>{r.deposit ? " after your deposit" : ""}, plus shipping and applicable tax.</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <form className="preorder-form" onSubmit={calculate}>
      <AddressFields includeName disabled={busy} onChange={()=>{setQuote(null);setDestination(null);}}/>
      <button className="button outline" disabled={busy}>Calculate final shipping</button>
    </form>
    {quote&&<form className="preorder-form" onSubmit={pay}><label>Shipping service<select value={selected} onChange={e=>setSelected(e.target.value)}>{quote.options.map(o=><option key={o.id} value={o.id}>{o.provider} {o.serviceLevel} - {formatMoney(o.amountCents,r.terms.currency)}</option>)}</select></label><p>Remaining items: {formatMoney(r.quantity*r.terms.priceCents-(r.deposit?.subtotalCents ?? 0),r.terms.currency)}. Shipping: {formatMoney(quote.options.find(o=>o.id===selected)?.amountCents ?? 0,r.terms.currency)}. Applicable tax and the final total are shown in Stripe.</p><label className="preorder-check"><input name="accept" type="checkbox" required/>I accept this shipping amount, delivery address, handling deadline and <Link href="/terms">checkout policies</Link>.</label><AdultConsent/><button className="button dark" disabled={busy}>Review final total and pay</button></form>}
  </details>;
}
