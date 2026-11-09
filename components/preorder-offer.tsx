"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import { DEPOSIT_PREORDER_POLICY, type PreorderTerms } from "@/lib/preorder-rules";
import type { publicPreorderOffers } from "@/lib/preorders";
import type { ProductSummary } from "@/lib/types";
import { AdultConsent } from "./adult-consent";
import { useMarketplace } from "./marketplace-provider";

export type PublicPreorderOffers = Awaited<ReturnType<typeof publicPreorderOffers>>;

export async function preorderAction(input:Record<string,unknown>) {
  const response=await fetch("/api/preorders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
  const body=await response.json();
  if(!response.ok) throw new Error(body.error??"The preorder could not be updated.");
  return body;
}
export function ReservationTerms({terms,quantity,compact=false}:{terms:PreorderTerms;quantity:number;compact?:boolean}) {
  const deposit=terms.paymentModel === "deposit_10" ? (terms.depositUnitCents ?? 0)*quantity : 0;
  return <div className={`preorder-terms-summary${compact ? " preorder-terms-compact" : ""}`}>
    <div className="preorder-price-breakdown"><div><span>Full item price</span><strong>{formatMoney(terms.priceCents*quantity,terms.currency)}</strong></div><div><span>{deposit ? "10% deposit today" : "Due today"}</span><strong>{formatMoney(deposit,terms.currency)}</strong></div><div><span>Item balance when ready</span><strong>{formatMoney(terms.priceCents*quantity-deposit,terms.currency)}</strong></div></div>
    <p>Expected to ship <strong>{terms.dispatch.label}</strong>. {terms.shippingEstimateCents == null ? "Shipping is calculated before balance payment." : `Shipping: ${formatMoney(terms.shippingEstimateCents,terms.currency)}, paid with the balance.`} Applicable tax is shown before payment.</p>
    <p className="preorder-cancellation-terms">{deposit ? (terms.policyVersion === DEPOSIT_PREORDER_POLICY ? compact ? "Payments refundable before shipment, including a missed balance deadline. Balance never charged automatically." : "Your payments are refundable before shipment, including cancellation for a missed balance deadline. Your rights under applicable law are unaffected." : "Your accepted deposit terms are shown below. Contact support for a refund review; applicable consumer rights still apply.") : "No payment today. You can cancel before payment without a fee."}</p>
    <details><summary>Preorder terms</summary><p>{terms.policyText}</p><p>{terms.variant}. {terms.contents}</p></details>
  </div>;
}

export function PreorderOffer({product,initialOffers}:{product:ProductSummary;initialOffers?:PublicPreorderOffers}) {
  const [fetchedOffers,setOffers]=useState<PublicPreorderOffers>([]);
  const offers=initialOffers ?? fetchedOffers;
  const [loading,setLoading]=useState(initialOffers === undefined),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [notified,setNotified]=useState(false);
  useEffect(()=>{
    // Public product pages supply the offer with the server render. The fallback
    // supports other callers without adding a second request to those pages.
    if (initialOffers !== undefined) return;
    const controller=new AbortController();
    fetch(`/api/preorders?listingId=${encodeURIComponent(product.id)}`,{signal:controller.signal,cache:"no-store"})
      .then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setOffers(b.offers);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[product.id,initialOffers]);
  async function notify(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const data=new FormData(event.currentTarget);
    try {const r=await fetch("/api/availability-alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:product.id,email:data.get("email"),adultConsent:data.get("adultConsent")})});const b=await r.json();if(!r.ok)throw new Error(b.error);setNotified(true);}catch(e){setError(e instanceof Error?e.message:"Alert failed.");}finally{setBusy(false);}
  }
  return <section className="preorder-panel preorder-purchase" id="listing-preorder" aria-label="Preorder">
    {error&&<p role="alert" className="form-error">{error}</p>}
    {initialOffers === undefined && loading ? <p role="status">Loading preorder details…</p> : <>
      {offers.map(offer=><PreorderBatchOffer key={`${offer.id}-${offer.terms.revision}`} product={product} offer={offer} sticky={offer.id === offers.find(item=>item.canReserve)?.id}/>)}
      {!offers.length && <><p className="detail-price">{product.priceCents ? formatMoney(product.priceCents,product.currency) : "Price to be announced"}</p><p>This upcoming listing is not accepting preorders yet.</p></>}
      <details><summary>Notify me about availability</summary>{notified ? <p role="status">Availability alert saved.</p> : <form className="preorder-form" onSubmit={notify}><label>Email<input name="email" type="email" required autoComplete="email"/></label><AdultConsent/><button className="button outline" disabled={busy}>Notify me</button></form>}</details>
    </>}
  </section>;
}

export function PreorderBatchOffer({product,offer,sticky=false}:{product:ProductSummary;offer:PublicPreorderOffers[number];sticky?:boolean}) {
  const {collector,authReady}=useMarketplace();
  const [quantityText,setQuantityText]=useState("1"),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[showSticky,setShowSticky]=useState(false);
  const key=useRef("");
  const submitting=useRef(false);
  const actionRef=useRef<HTMLDivElement>(null);
  const limit=Math.min(offer.remaining,offer.terms.buyerLimit);
  const quantity=Number(quantityText);
  const validQuantity=Number.isInteger(quantity)&&quantity>=1&&quantity<=limit;
  const displayQuantity=validQuantity ? quantity : 1;
  const deposit=offer.terms.paymentModel === "deposit_10";
  const depositAmount=formatMoney((offer.terms.depositUnitCents ?? 0)*displayQuantity,offer.terms.currency);
  const label=deposit ? `Preorder — ${depositAmount} deposit` : "Reserve without payment";

  useEffect(()=>{
    if (!sticky || !offer.canReserve || confirmed || !actionRef.current) return;
    const observer=new IntersectionObserver(([entry])=>setShowSticky(!entry.isIntersecting&&entry.boundingClientRect.bottom<=0));
    observer.observe(actionRef.current);
    return()=>observer.disconnect();
  },[sticky,offer.canReserve,confirmed]);

  async function reserve(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authReady || !collector || !validQuantity || submitting.current) return;
    const data=new FormData(event.currentTarget);
    if (data.get("accepted") !== "on" || data.get("adultConsent") !== "on") return;
    submitting.current=true;setBusy(true);setError("");key.current ||= crypto.randomUUID();
    try {
      // The server rechecks allocation and the accepted revision before holding stock.
      const hold=await preorderAction({action:"hold",batchId:offer.id,revision:offer.terms.revision,quantity,adultConsent:data.get("adultConsent"),idempotencyKey:key.current});
      if(deposit) {
        const payment=await preorderAction({action:"deposit",id:hold.id,acceptedTerms:true,adultConsent:data.get("adultConsent")});
        window.location.assign(payment.url);
      } else {
        await preorderAction({action:"confirm",id:hold.id,acceptedTerms:true});setConfirmed(true);
      }
    } catch(e) {setError(e instanceof Error?e.message:"Preorder could not start. Refresh and review the current offer.");}
    finally {submitting.current=false;setBusy(false);}
  }

  if (confirmed) return <p role="status">Reservation confirmed. Follow updates in <Link href="/account?view=orders">My Orders</Link>.</p>;
  return <div className="preorder-batch">
    <ReservationTerms terms={offer.terms} quantity={displayQuantity} compact/>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <div ref={actionRef} tabIndex={-1} className="preorder-action-target">
      {!offer.canReserve ? <p>Preorders are currently closed for this listing.</p> : !authReady ? <button className="button dark preorder-submit" disabled aria-busy="true">{label}</button> : !collector ? <Link className="button dark preorder-submit" href={`/sign-in?returnTo=${encodeURIComponent(`/products/${product.slug}`)}`}>Sign in to preorder</Link> : <form className="preorder-form" onSubmit={reserve}>
        <label className="preorder-quantity">Quantity<input name="quantity" type="number" min="1" step="1" max={limit} value={quantityText} disabled={busy} onChange={e=>{setQuantityText(e.target.value);key.current="";}} required/></label>
        <label className="preorder-check"><input type="checkbox" name="accepted" required/>I accept the expected ship date and preorder cancellation terms.</label>
        <AdultConsent/>
        <button className="button dark preorder-submit" disabled={busy||!validQuantity}>{busy ? "Preparing checkout…" : label}</button>
        <p className="form-note">{deposit ? "Review the deposit and applicable tax in secure Stripe Checkout." : "Pay when the seller has your items ready."}</p>
      </form>}
    </div>
    {sticky&&showSticky&&offer.canReserve&&<div className="product-sticky-purchase preorder-sticky-purchase" role="region" aria-label="Preorder this listing">
      <div className="sticky-price"><strong>{formatMoney(offer.terms.priceCents*displayQuantity,offer.terms.currency)}</strong><span>Full item price</span></div>
      <button type="button" className="button dark buy-button" disabled={busy} onClick={()=>{actionRef.current?.scrollIntoView({block:"center"});actionRef.current?.focus({preventScroll:true});}}>{label}</button>
    </div>}
  </div>;
}
