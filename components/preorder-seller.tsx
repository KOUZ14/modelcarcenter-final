"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { sellerPreorders } from "@/lib/preorders";
import { preorderAction } from "./preorder-offer";
import { formatMoney } from "@/lib/format";

function useSellerPreorders() {
  const router=useRouter();
  const [data,setData]=useState<Awaited<ReturnType<typeof sellerPreorders>>|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const load=useCallback(async()=>{const r=await fetch("/api/preorders?view=seller",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error);setData(b);},[]);
  useEffect(()=>{queueMicrotask(()=>void load().catch(e=>setError(e.message)));},[load]);
  async function run(payload:Record<string,unknown>,success:string) {
    setBusy(true);setError("");setMessage("");
    try {await preorderAction({...payload,view:"seller"});await load();router.refresh();setMessage(success);}
    catch(e){setError(e instanceof Error?e.message:"Preorder could not be updated.");}
    finally{setBusy(false);}
  }
  return {data,error,busy,message,run};
}

export function PreorderSeller({listingId}:{listingId:string}) {
  const {data,error,busy,message,run}=useSellerPreorders();
  function stock(event:FormEvent<HTMLFormElement>,batch:NonNullable<typeof data>["batches"][number]) {
    event.preventDefault();const form=new FormData(event.currentTarget),ready=Number(form.get("ready"));
    void run({action:"receipt",batchId:batch.id,sellableQuantity:ready,receivedQuantity:Math.max(batch.receivedQuantity,ready+batch.damagedQuantity),damagedQuantity:batch.damagedQuantity,complete:form.get("complete")==="on",reason:"Seller marked inspected stock ready to ship"},"Stock updated. Buyers with available items will be invited to pay their balance.");
  }
  const batches=data?.batches.filter(b=>b.listingId===listingId) ?? [];
  return <div className="preorder-listing">
    {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="preorder-notice">{message}</p>}
    {!data&&<p role="status">Loading preorders…</p>}
    {data&&!batches.length&&<p>No preorder details were found for this listing.</p>}
    {batches.map(batch=>{
      const active=batch.reservations.filter(r=>["reserved","allocated","awaiting_payment"].includes(r.status));
      const collected=batch.deposits.reduce((n,d)=>n+d.amountCents-d.refundedCents,0);
      return <article className="seller-preorder-card" key={batch.id}>
        <div className="preorder-heading"><div><h3>{batch.terms.title}</h3><p>{batch.terms.sellerSku} · {formatMoney(batch.terms.priceCents,batch.terms.currency)}</p></div><span className="status">{batch.supplyState === "cancelled" ? "Cancelled" : batch.status === "open" ? "Accepting preorders" : "Preorders closed"}</span></div>
        <p>Expected to ship <strong>{batch.terms.dispatch.label}</strong></p>
        <div className="preorder-price-breakdown"><div><span>Awaiting stock / payment</span><strong>{active.reduce((n,r)=>n+r.quantity,0)} units</strong></div><div><span>Deposits collected</span><strong>{formatMoney(collected,batch.terms.currency)}</strong></div><div><span>Balance paid</span><strong>{batch.reservations.filter(r=>r.status==="converted").length} orders</strong></div></div>
        {batch.supplyState!=="cancelled"&&<>
          <details className="preorder-primary-action"><summary>Mark stock ready</summary><form className="preorder-form" onSubmit={e=>stock(e,batch)}><label>Total units ready to ship<input name="ready" type="number" min={batch.sellableQuantity} max={100000} defaultValue={batch.sellableQuantity || batch.capacity} required/></label><label className="preorder-check"><input name="complete" type="checkbox" defaultChecked/>This is the final supplier delivery</label><p className="form-note">Buyers are served in preorder order. If the final delivery cannot fulfill a preorder, it is cancelled and its deposit refunded.</p><button className="button dark small" disabled={busy}>Mark ready and notify buyers</button></form></details>
          <div className="row-actions"><button className="text-button" disabled={busy} onClick={()=>void run({action:batch.status === "open" ? "close" : "open",batchId:batch.id,reason:"Seller changed preorder availability"},"Preorder availability updated.")}>{batch.status === "open" ? "Pause new preorders" : "Reopen preorders"}</button><Link href={`/store?view=inventory&edit=${encodeURIComponent(batch.listingId)}`}>Edit listing</Link><Link href="/store?view=orders&filter=preorders">Customer orders</Link></div>
          <details><summary>Change expected ship date</summary><form className="preorder-form" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run({action:"delay",batchId:batch.id,dispatch:{precision:"day",start:d.get("date")},reason:d.get("reason")},"Buyers have been notified of the revised date and can accept it or receive a refund.");}}><label>New expected ship date<input name="date" type="date" required min={new Date().toISOString().slice(0,10)}/></label><Reason/><p>Buyers can accept the new date or cancel for a refund. No response by their notice deadline also cancels and refunds their deposit.</p><button className="button outline small" disabled={busy}>Update date and notify buyers</button></form></details>
          <details><summary>Cannot fulfill this preorder</summary><form className="preorder-form" onSubmit={e=>{e.preventDefault();if(!window.confirm("Cancel this preorder offer and refund affected customers?"))return;void run({action:"cancel_batch",batchId:batch.id,reasonCode:"seller_failure",reason:new FormData(e.currentTarget).get("reason")},"Offer cancelled. Customer refunds are being processed.");}}><Reason/><p>Deposits and payments for unshipped orders will be refunded.</p><button className="button outline small" disabled={busy}>Cancel and refund</button></form></details>
        </>}
        {batch.reservations.some(r=>r.acceptedAt)&&<details><summary>Customer preorders</summary><div className="preorder-table"><table><thead><tr><th>Customer</th><th>Quantity</th><th>Status</th><th>Deposit</th><th>Action</th></tr></thead><tbody>{batch.reservations.filter(r=>r.acceptedAt).map(r=>{
          const deposit=batch.deposits.find(d=>d.reservationId===r.id);
          return <tr key={r.id}><td>{r.contactEmail}</td><td>{r.quantity}</td><td>{r.status === "awaiting_payment" ? "Balance due" : r.status === "converted" ? "Paid" : r.status === "reserved" ? "Awaiting stock" : r.status.replaceAll("_"," ")}</td><td>{deposit ? <>{formatMoney(deposit.amountCents-deposit.refundedCents,batch.terms.currency)}{deposit.refundStatus !== "not_required" && <small>Refund {deposit.refundStatus.replaceAll("_"," ")}</small>}</> : "No deposit"}</td><td>{deposit && deposit.status === "paid" && deposit.refundStatus === "not_required" && !r.orderId && <button className="text-button" disabled={busy} onClick={()=>{if(window.confirm(`Refund ${formatMoney(deposit.amountCents,batch.terms.currency)} and cancel this customer's preorder?`))void run({action:"refund_deposit",id:r.id,reason:"Seller approved a full deposit refund"},"Deposit refund requested.");}}>Refund deposit</button>}</td></tr>;
        })}</tbody></table></div></details>}
      </article>;
    })}
  </div>;
}

export function SellerPreorderOrders({showEmpty=false}:{showEmpty?:boolean}) {
  const {data,error,busy,message,run}=useSellerPreorders();
  const orders=data?.batches.flatMap(batch=>batch.reservations.filter(r=>r.acceptedAt&&!r.orderId).map(reservation=>({batch,reservation,deposit:batch.deposits.find(d=>d.reservationId===reservation.id)}))) ?? [];
  return <>
    {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="admin-message">{message}</p>}
    {!data&&!error&&<p role="status">Loading customer preorders…</p>}
    {data&&!orders.length&&showEmpty&&<p className="store-empty">No customer preorders awaiting fulfillment.</p>}
    {orders.map(({batch,reservation:r,deposit})=><article key={r.id} className="store-order">
      <div className="store-order-header"><div><p className="eyebrow">Preorder</p><h3>{r.contactEmail}</h3></div><span className="status">{r.status==="awaiting_payment" ? "Balance due" : r.status==="reserved" ? "Awaiting stock" : r.status.replaceAll("_"," ")}</span></div>
      <div className="store-order-body"><div><h4>Items</h4><p><b>{batch.terms.title}</b><br/>{r.quantity} × {formatMoney(batch.terms.priceCents,batch.terms.currency)}</p><p>Expected to ship {batch.terms.dispatch.label}</p><Link className="button outline small" href={`/store?view=inventory&preorder=${encodeURIComponent(batch.listingId)}`}>Manage stock and ship date</Link></div>
      <div><h4>Payment</h4><dl className="store-order-totals"><div><dt>Deposit received</dt><dd>{formatMoney(deposit?.amountCents ?? 0,batch.terms.currency)}</dd></div>{!["cancelled","expired"].includes(r.status)&&<div><dt>Remaining item balance</dt><dd>{formatMoney(r.quantity*batch.terms.priceCents-(deposit?.subtotalCents ?? 0),batch.terms.currency)}</dd></div>}</dl>
      {deposit&&deposit.refundStatus!=="not_required"&&<p>Deposit refund: {deposit.refundStatus==="succeeded" ? "Completed" : ["required","pending"].includes(deposit.refundStatus) ? "Processing" : "Needs attention"}{deposit.refundedCents>0 ? ` · ${formatMoney(deposit.refundedCents,batch.terms.currency)} refunded` : ""}</p>}
      {deposit&&deposit.status==="paid"&&deposit.refundStatus==="not_required"&&<button className="button outline small" disabled={busy} onClick={()=>{if(window.confirm(`Refund ${formatMoney(deposit.amountCents,batch.terms.currency)} and cancel this customer's preorder?`))void run({action:"refund_deposit",id:r.id,reason:"Seller approved a full deposit refund"},"Deposit refund requested.");}}>Refund deposit</button>}
      </div></div>
    </article>)}
  </>;
}

export function NumberField({name,label,initial=0,min=0,max=100000}:{name:string;label:string;initial?:number;min?:number;max?:number}) {return <label>{label}<input name={name} type="number" min={min} max={max} defaultValue={initial} required/></label>;}
export function Reason() {return <label>Reason<textarea name="reason" required maxLength={2000}/></label>;}
