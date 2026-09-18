"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
  return <div className="preorder-terms-summary">
    <h3>{terms.title}</h3><p>Sold by {terms.sellerName} · {terms.variant}</p>
    <dl className="product-facts">
      <div><dt>Selling unit</dt><dd>{quantity} × {terms.saleUnit} ({terms.unitsPerPack} models per unit)<br/>{terms.contents}</dd></div>
      <div><dt>Item price</dt><dd>{formatMoney(terms.priceCents,terms.currency)} per {terms.saleUnit}</dd></div>
      <div><dt>Due today</dt><dd><strong>{formatMoney(0,terms.currency)}</strong></dd></div>
      <div><dt>Items due later</dt><dd>{formatMoney(terms.priceCents*quantity,terms.currency)}</dd></div>
      <div><dt>Shipping estimate</dt><dd>{terms.shippingEstimateCents===null?"Quoted before payment":formatMoney(terms.shippingEstimateCents,terms.currency)} · {terms.shippingBasis}</dd></div>
      <div><dt>Estimated dispatch</dt><dd>{terms.dispatch.label}</dd></div>
      <div><dt>After payment</dt><dd>Ships within {terms.handlingDays} business days. Payment is due within {terms.paymentDays} calendar days of allocation.</dd></div>
    </dl>
    <p>{terms.taxTreatment}</p><p>{terms.policyText}</p>
    <p className="muted">Policy {terms.policyVersion}. {terms.previewMedia?"Images are previews or prototypes; production details may change.":"Seller-provided product imagery."}</p>
  </div>;
}
export function PreorderOffer({product}:{product:ProductSummary}) {
  const [offers,setOffers]=useState<Awaited<ReturnType<typeof publicPreorderOffers>>>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [hold,setHold]=useState<{id:string;terms:string;quantity:number;holdExpiresAt:string}|null>(null);
  const [confirmed,setConfirmed]=useState(false),[notified,setNotified]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/preorders?listingId=${encodeURIComponent(product.id)}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setOffers(b.offers);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[product.id]);
  async function reserve(event:FormEvent<HTMLFormElement>,offer:typeof offers[number]) {
    event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setError("");
    try {setHold(await preorderAction({action:"hold",batchId:offer.id,revision:offer.terms.revision,quantity:Number(data.get("quantity")),adultConsent:data.get("adultConsent"),idempotencyKey:crypto.randomUUID()}));}
    catch(e){setError(e instanceof Error?e.message:"Reservation failed.");}finally{setBusy(false);}
  }
  async function confirm(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");try{await preorderAction({action:"confirm",id:hold!.id,acceptedTerms:new FormData(event.currentTarget).get("accepted")==="on"});setConfirmed(true);}
    catch(e){setError(e instanceof Error?e.message:"Confirmation failed.");}finally{setBusy(false);}
  }
  async function notify(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const data=new FormData(event.currentTarget);
    try {const r=await fetch("/api/availability-alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:product.id,email:data.get("email"),adultConsent:data.get("adultConsent")})});const b=await r.json();if(!r.ok)throw new Error(b.error);setNotified(true);}catch(e){setError(e instanceof Error?e.message:"Alert failed.");}finally{setBusy(false);}
  }
  return <section className="preorder-panel" aria-label="Preorder reservation">
    <p className="eyebrow">Upcoming release · Pay when ready</p>
    {error&&<p role="alert" className="form-error">{error} <Link href={`/sign-in?returnTo=${encodeURIComponent(`/products/${product.slug}`)}`}>Sign in</Link></p>}
    {loading?<p role="status">Loading seller allocations…</p>:confirmed?<div role="status"><h2>Reservation confirmed</h2><p>Nothing was charged. Follow updates and payment invitations in <Link href="/preorders">My Preorders</Link>.</p></div>:hold?<form onSubmit={confirm}>
      <h2>Review your reservation</h2><ReservationTerms terms={JSON.parse(hold.terms)} quantity={hold.quantity}/>
      <p>Review hold expires {new Date(hold.holdExpiresAt).toLocaleString()}.</p>
      <label className="preorder-check"><input type="checkbox" name="accepted" required/> I accept these seller, price, packaging, dispatch and cancellation terms.</label>
      <button className="button dark" disabled={busy}>Confirm unpaid reservation</button>
    </form>:<>{offers.map(offer=><div key={offer.id}><ReservationTerms terms={offer.terms} quantity={1}/>
      {offer.canReserve?<form className="preorder-form" onSubmit={e=>reserve(e,offer)}>
        <p>{offer.remaining} reservation slots · Incoming allocation; these units are not physical stock.</p>
        <p>Allocation evidence reviewed. Supply and delivery are not guaranteed.</p>
        <label>Quantity ({offer.terms.saleUnit})<input name="quantity" type="number" min="1" max={Math.min(offer.remaining,offer.terms.buyerLimit)} defaultValue="1" required/></label>
        <AdultConsent/><button className="button dark" disabled={busy}>Reserve — pay when ready</button>
      </form>:<><p>Reservations are closed or awaiting a supported price, allocation or dispatch estimate.</p><form className="preorder-form" onSubmit={async e=>{e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);setError("");try{await preorderAction({action:"waitlist",batchId:offer.id,quantity:Number(d.get("quantity")),adultConsent:d.get("adultConsent")});setError("Waitlist request saved. View it in My Preorders. No unit is promised.");}catch(e){setError(e instanceof Error?e.message:"Waitlist failed.");}finally{setBusy(false);}}}><label>Waitlist quantity<input type="number" name="quantity" min="1" max={offer.terms.buyerLimit} defaultValue="1" required/></label><AdultConsent/><button className="button outline" disabled={busy}>Join seller waitlist</button><p>A waitlist request does not reserve a unit or charge a payment. Any invitation requires your acceptance of the current terms.</p></form></>}
    </div>)}<details><summary>Notify me about availability</summary><p>A release alert expresses interest. It does not reserve a unit or provide queue priority.</p>
      {notified?<p role="status">Availability alert saved.</p>:<form className="preorder-form" onSubmit={notify}><label>Email<input name="email" type="email" required autoComplete="email"/></label><AdultConsent/><button className="button outline" disabled={busy}>Notify me</button></form>}
    </details></>}
  </section>;
}
