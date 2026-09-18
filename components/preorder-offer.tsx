"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import type { PreorderTerms } from "@/lib/preorder-rules";
import type { publicPreorderOffers } from "@/lib/preorders";
import type { ProductSummary } from "@/lib/types";
import { AdultConsent } from "./adult-consent";

export async function preorderAction(input:Record<string,unknown>) {
  const response=await fetch("/api/preorders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
  const body=await response.json();
  if(!response.ok) throw new Error(body.error??"The preorder could not be updated.");
  return body;
}
export function ReservationTerms({terms,quantity}:{terms:PreorderTerms;quantity:number}) {
  const deposit=terms.paymentModel === "deposit_10" ? (terms.depositUnitCents ?? 0)*quantity : 0;
  return <div className="preorder-terms-summary">
    <div className="preorder-price-breakdown"><div><span>Full item price</span><strong>{formatMoney(terms.priceCents*quantity,terms.currency)}</strong></div><div><span>{deposit ? "10% deposit today" : "Due today"}</span><strong>{formatMoney(deposit,terms.currency)}</strong></div><div><span>Item balance when ready</span><strong>{formatMoney(terms.priceCents*quantity-deposit,terms.currency)}</strong></div></div>
    <p>Expected to ship <strong>{terms.dispatch.label}</strong>. {terms.shippingEstimateCents == null ? "Shipping is calculated before balance payment." : `Shipping: ${formatMoney(terms.shippingEstimateCents,terms.currency)}, paid with the balance.`} Applicable tax is shown before payment.</p>
    <p className="preorder-cancellation-terms">{deposit ? "The deposit is non-refundable if you change your mind, unless the seller approves a refund. You receive a refund if the seller cannot fulfill or you decline a shipping delay. Your rights under applicable law are unaffected." : "No payment today. You can cancel before payment without a fee."}</p>
    <details><summary>Preorder terms</summary><p>{terms.policyText}</p><p>{terms.variant}. {terms.contents}</p></details>
  </div>;
}

export function PreorderOffer({product}:{product:ProductSummary}) {
  const [offers,setOffers]=useState<Awaited<ReturnType<typeof publicPreorderOffers>>>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [quantity,setQuantity]=useState(1),[confirmed,setConfirmed]=useState(false),[notified,setNotified]=useState(false);
  const key=useRef("");
  useEffect(()=>{const controller=new AbortController();fetch(`/api/preorders?listingId=${encodeURIComponent(product.id)}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setOffers(b.offers);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[product.id]);
  async function reserve(event:FormEvent<HTMLFormElement>,offer:typeof offers[number]) {
    event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setError("");key.current ||= crypto.randomUUID();
    try {
      const hold=await preorderAction({action:"hold",batchId:offer.id,revision:offer.terms.revision,quantity,adultConsent:data.get("adultConsent"),idempotencyKey:key.current});
      if(offer.terms.paymentModel === "deposit_10") {
        const payment=await preorderAction({action:"deposit",id:hold.id,acceptedTerms:data.get("accepted")==="on",adultConsent:data.get("adultConsent")});
        window.location.assign(payment.url);
      } else {
        await preorderAction({action:"confirm",id:hold.id,acceptedTerms:data.get("accepted")==="on"});setConfirmed(true);
      }
    } catch(e) {setError(e instanceof Error?e.message:"Preorder could not start.");}
    finally {setBusy(false);}
  }
  async function notify(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const data=new FormData(event.currentTarget);
    try {const r=await fetch("/api/availability-alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:product.id,email:data.get("email"),adultConsent:data.get("adultConsent")})});const b=await r.json();if(!r.ok)throw new Error(b.error);setNotified(true);}catch(e){setError(e instanceof Error?e.message:"Alert failed.");}finally{setBusy(false);}
  }
  return <section className="preorder-panel preorder-purchase" aria-label="Preorder">
    <p className="eyebrow">Preorder</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {loading ? <p role="status">Loading preorder details…</p> : confirmed ? <p role="status">Reservation confirmed. Follow updates in <Link href="/preorders">My Preorders</Link>.</p> : <>
      {offers.map(offer=><div key={offer.id}>
        <ReservationTerms terms={offer.terms} quantity={quantity}/>
        {offer.canReserve ? <form className="preorder-form" onSubmit={e=>reserve(e,offer)}>
          <label>Quantity<input name="quantity" type="number" min="1" max={Math.min(offer.remaining,offer.terms.buyerLimit)} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));key.current="";}} required/></label>
          <label className="preorder-check"><input type="checkbox" name="accepted" required/>I accept the expected ship date and preorder cancellation terms.</label>
          <AdultConsent/>
          <button className="button dark" disabled={busy}>{busy ? "Preparing checkout…" : offer.terms.paymentModel === "deposit_10" ? `Pay ${formatMoney((offer.terms.depositUnitCents ?? 0)*quantity,offer.terms.currency)} deposit` : "Reserve without payment"}</button>
          <p className="form-note">{offer.terms.paymentModel === "deposit_10" ? "Confirm your deposit and applicable tax in secure Stripe Checkout. The remaining balance is never charged automatically." : "Pay when the seller has your items ready."}</p>
        </form> : <p>Preorders are currently closed for this listing.</p>}
      </div>)}
      {!offers.length && <p>This upcoming listing is not accepting preorders yet.</p>}
      <details><summary>Notify me about availability</summary>{notified ? <p role="status">Availability alert saved.</p> : <form className="preorder-form" onSubmit={notify}><label>Email<input name="email" type="email" required autoComplete="email"/></label><AdultConsent/><button className="button outline" disabled={busy}>Notify me</button></form>}</details>
      <p className="form-note"><Link href="/preorders">My preorders</Link> · <Link href={`/sign-in?returnTo=${encodeURIComponent(`/products/${product.slug}`)}`}>Sign in to preorder</Link></p>
    </>}
  </section>;
}
