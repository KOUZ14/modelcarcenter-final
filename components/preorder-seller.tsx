"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { sellerPreorders } from "@/lib/preorders";
import { CatalogModelPicker } from "./catalog-model-picker";
import { preorderAction } from "./preorder-offer";
import { formatMoney } from "@/lib/format";
import { PREORDER_TERMS } from "@/lib/preorder-rules";

export function WindowFields({prefix,label}:{prefix:string;label:string}) {
  return <fieldset><legend>{label}</legend><div className="preorder-grid"><label>Precision<select name={`${prefix}Precision`} defaultValue="month"><option value="day">Day</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="unknown">Unknown</option></select></label><label>Start<input name={`${prefix}Start`} placeholder="2027-01 or 2027-Q1"/></label><label>End<input name={`${prefix}End`} placeholder="2027-02 or 2027-Q2"/></label></div></fieldset>;
}
function windowInput(data:Record<string,FormDataEntryValue>,prefix:string) {return {precision:data[`${prefix}Precision`],start:data[`${prefix}Start`],end:data[`${prefix}End`]||data[`${prefix}Start`]};}
export function PreorderSeller() {
  const [data,setData]=useState<Awaited<ReturnType<typeof sellerPreorders>>|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ready,setReady]=useState(false);
  const load=useCallback(async()=>{const r=await fetch("/api/preorders?view=seller",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error);setData(b);},[]);
  useEffect(()=>{queueMicrotask(()=>void load().catch(e=>setError(e.message)));},[load]);
  async function submit(event:FormEvent<HTMLFormElement>,payload:Record<string,unknown>) {
    event.preventDefault();setBusy(true);setError("");setMessage("");const form=event.currentTarget,d=Object.fromEntries(new FormData(form));
    try{await preorderAction({...d,...payload,view:"seller",dispatch:windowInput(d,"dispatch"),receipt:d.receiptPrecision?windowInput(d,"receipt"):undefined,opensAt:d.opensAt?new Date(String(d.opensAt)).toISOString():undefined,cutoffAt:d.cutoffAt?new Date(String(d.cutoffAt)).toISOString():undefined,previewMedia:d.previewMedia==="on",complete:d.complete==="on",guaranteedChase:d.guaranteedChase==="on"});setMessage("Saved. Affected reservations retain their accepted terms and update history.");await load();}catch(e){setError(e instanceof Error?e.message:"Update failed.");}finally{setBusy(false);}
  }
  return <div className="preorder-dashboard"><p><Link href="/store">Seller Hub</Link> · <Link href="/store?view=orders">Paid orders and shipping</Link></p>
    <p>Dedicate incoming quantity to MCC separately from other sales channels. Free reservations measure demand; they do not fund supplier purchases or count as paid sales.</p>
    {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status">{message}</p>}
    {data&&!data.eligible&&<p className="preorder-notice">Preorder creation is paused until an administrator reviews your supply source and eligibility. Existing fulfillment and refund work remains available.</p>}
    {data?.eligible&&<details className="preorder-panel"><summary>Create incoming preorder offer</summary><form className="preorder-form" onSubmit={e=>submit(e,{action:"create_batch"})}>
      <CatalogModelPicker onReady={setReady}/>
      <div className="preorder-grid">
        <label>Exact variant and packaging<input name="variant" required placeholder="Regular blue livery, boxed"/></label>
        <label>Selling unit<select name="saleUnit"><option value="model">Individual model</option><option value="set">Set</option><option value="assortment">Assortment</option><option value="case">Sealed case</option></select></label>
        <NumberField name="unitsPerPack" label="Models per selling unit" initial={1} min={1}/>
        <label>Disclosed contents<textarea name="contents" required placeholder="List contents and any assortment uncertainty"/></label>
        <label>Item price per selling unit (USD)<input name="price" type="number" step="0.01" min="0.01" placeholder="Leave blank for interest only"/></label>
        <NumberField name="buyerLimit" label="Buyer limit (selling units)" initial={2} min={1} max={10}/>
        <label>Supplier reference (private)<input name="supplierReference" required/></label>
        <label>Allocation evidence reference (private)<input name="evidenceReference" placeholder="Private invoice / supplier confirmation reference"/></label>
        <NumberField name="requestedQuantity" label="Requested selling units"/><NumberField name="confirmedAllocation" label="Confirmed supplier allocation"/>
        <NumberField name="capacity" label="Selling units dedicated to MCC"/><NumberField name="safetyBuffer" label="Safety buffer"/>
        <label>Estimate source<input name="estimateSource" required/></label>
        <label>Reservation opens (your local time)<input name="opensAt" type="datetime-local" required/></label>
        <label>Reservation cutoff (your local time)<input name="cutoffAt" type="datetime-local" required/></label>
        <label>Timezone for entered local times<input name="timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} readOnly/></label>
        <label>Shipping method and rate basis<input name="shippingBasis" required placeholder="USPS Ground, calculated for delivery address"/></label>
        <label>Estimated shipping (USD)<input name="shippingEstimate" type="number" step="0.01" min="0"/></label>
        <NumberField name="handlingDays" label="Handling business days after payment" initial={3} min={1} max={10}/>
      </div><WindowFields prefix="receipt" label="Expected store receipt"/><WindowFields prefix="dispatch" label="Estimated buyer dispatch"/>
      <label className="preorder-check"><input name="previewMedia" type="checkbox" defaultChecked/>Images are renders, prototypes or previews</label>
      <label className="preorder-check"><input name="guaranteedChase" type="checkbox"/>Guaranteed chase inclusion</label><label>Evidence supporting any chase guarantee<input name="chaseEvidence"/></label>
      <p>{PREORDER_TERMS}</p><p>Offers start closed. Allocation evidence must be reviewed before reservations can open.</p><button className="button dark" disabled={busy||!ready}>Create preorder offer</button>
    </form></details>}
    {data?.batches.map(b=><article key={b.id} className="preorder-panel"><h2>{b.terms.title}</h2><p>{b.terms.variant} · {b.terms.saleUnit} · {b.status} · {b.supplyState.replaceAll("_"," ")}</p><p><Link href={`/products/preorder-${b.listingId}`}>View seller offer</Link></p>
      <div className="preorder-grid"><p><strong>{b.committed}</strong> committed units including converted orders<br/>{formatMoney(b.reservations.filter(r=>["reserved","allocated","awaiting_payment"].includes(r.status)).reduce((n,r)=>n+r.quantity*JSON.parse(r.terms).priceCents,0),b.terms.currency)} unpaid reserved merchandise<br/>{b.reservations.filter(r=>r.status==="converted").length} paid conversions</p><p><strong>{b.remaining}</strong> reservable slots<br/>{b.holds} temporary holds</p><p><strong>{b.sellableQuantity}</strong> inspected sellable<br/>{b.damagedQuantity} damaged / {b.receivedQuantity} received</p></div>
      <p>Allocation evidence: {b.evidenceState} · Dispatch: {b.terms.dispatch.label}</p>{b.shortage>0&&<p className="preorder-notice">Shortage: {b.shortage} committed units exceed capacity. New reservations are paused.</p>}
      <p>{b.metrics?.watchers??0} availability watchers · {b.metrics?.waitlisted??0} waitlisted buyers · {b.metrics?.shipped??0} shipped orders · {b.reservations.filter(r=>r.reason==="payment_deadline_expired").length} missed payment deadlines · {b.reservations.filter(r=>r.status==="cancelled"&&r.reason==="seller_failure").length} seller cancellations{b.metrics?.receiptToDispatchDays!=null&&` · ${b.metrics.receiptToDispatchDays.toFixed(1)} average days from receipt to dispatch`}</p>
      <form className="preorder-form" onSubmit={e=>submit(e,{batchId:b.id})}><label>Action<select name="action"><option value="close">Close new reservations</option><option value="open">Open reservations</option><option value="allocate">Allocate inspected stock in queue order</option><option value="invite_next">Invite next waitlisted buyer (up to 48 hours)</option></select></label><Reason/><button className="button outline" disabled={busy}>Apply</button></form>
      <details><summary>Record stock receipt and inspection</summary><form className="preorder-form" onSubmit={e=>submit(e,{action:"receipt",batchId:b.id})}><p>Enter cumulative selling-unit totals for this batch. Do not convert cases to individual cars here.</p><NumberField name="receivedQuantity" label="Total received" initial={b.receivedQuantity}/><NumberField name="sellableQuantity" label="Total inspected sellable" initial={b.sellableQuantity}/><NumberField name="damagedQuantity" label="Total damaged" initial={b.damagedQuantity}/><label className="preorder-check"><input type="checkbox" name="complete"/>Supplier shipment is complete</label><Reason/><p>Eligible buyers will receive allocations in acceptance order. Partial allocations require buyer acceptance.</p><button className="button dark" disabled={busy}>Record receipt and allocate</button></form></details>
      <details><summary>Change dispatch estimate</summary><form className="preorder-form" onSubmit={e=>submit(e,{action:"delay",batchId:b.id})}><WindowFields prefix="dispatch" label="Revised dispatch window"/><Reason/><p>This affects {b.reservations.filter(r=>["reserved","allocated","awaiting_payment"].includes(r.status)).length} unpaid reservations. Buyers must affirmatively accept; original terms remain available.</p><button className="button outline" disabled={busy}>Update estimate and request consent</button></form></details>
      <details><summary>Reduce supplier allocation</summary><form className="preorder-form" onSubmit={e=>submit(e,{action:"capacity",batchId:b.id})}><NumberField name="confirmedAllocation" label="Confirmed allocation" initial={b.confirmedAllocation}/><NumberField name="capacity" label="Quantity dedicated to MCC" initial={b.capacity}/><Reason/><button className="button outline" disabled={busy}>Update capacity and notify affected buyers</button></form></details>
      <details><summary>Cancel batch or report a material product change</summary><form className="preorder-form" onSubmit={e=>submit(e,{action:"cancel_batch",batchId:b.id})}><label>Reason category<select name="reasonCode"><option value="manufacturer_cancelled">Manufacturer cancelled production</option><option value="seller_failure">Seller cannot fulfill</option><option value="material_product_change">Material variant or packaging change</option></select></label><Reason/><p>Unpaid commitments will be cancelled and unshipped paid orders refunded. Create a separate offer for a materially different product.</p><button className="button outline" disabled={busy}>Cancel affected commitments</button></form></details>
      <details><summary>Buyer queue ({b.reservations.filter(r=>r.acceptedAt).length})</summary><div className="preorder-table"><table><thead><tr><th>Priority</th><th>Quantity</th><th>Status</th><th>Consent</th><th>Allocated</th><th>Next deadline</th></tr></thead><tbody>{b.reservations.filter(r=>r.acceptedAt).map(r=><tr key={r.id}><td>{r.acceptedSequence}</td><td>{r.quantity}</td><td>{r.status}</td><td>{r.consentState}</td><td>{r.allocatedQuantity}</td><td>{r.consentDeadline??r.paymentDeadline??"Awaiting supply"}</td></tr>)}</tbody></table></div></details>
    </article>)}
  </div>;
}
export function NumberField({name,label,initial=0,min=0,max=100000}:{name:string;label:string;initial?:number;min?:number;max?:number}) {return <label>{label}<input name={name} type="number" min={min} max={max} defaultValue={initial} required/></label>;}
export function Reason() {return <label>Reason / supporting detail<textarea name="reason" required maxLength={2000}/></label>;}
