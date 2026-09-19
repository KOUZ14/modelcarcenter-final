"use client";

import { useState } from "react";
import { estimateSellerProceeds } from "@/lib/seller-calculator";
import { formatMoney } from "@/lib/format";
import "./seller-workflows.css";

export function SellerProceedsCalculator({ rates }: { rates: { collector: number; professional: number; founding: number } }) {
  const [type, setType] = useState<keyof typeof rates>("professional");
  const [item, setItem] = useState("200"); const [shipping, setShipping] = useState("10");
  const [tax, setTax] = useState("20"); const [processing, setProcessing] = useState("2.9");
  const [fixed, setFixed] = useState("0.30");
  const valid = [item, shipping, tax, processing, fixed].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000) && Number(processing) <= 100;
  const result = valid ? estimateSellerProceeds({ itemCents: Math.round(Number(item) * 100), shippingCents: Math.round(Number(shipping) * 100), taxCents: Math.round(Number(tax) * 100), feeBps: rates[type], processingBps: Math.round(Number(processing) * 100), processingFixedCents: Math.round(Number(fixed) * 100) }) : null;
  return <section className="seller-calculator" aria-labelledby="proceeds-title"><div><p className="eyebrow">Plan a sale</p><h2 id="proceeds-title">What could you receive?</h2><p>Adjust the example. Actual processing and sales tax are confirmed on each order.</p>
    <label>Seller type<select value={type} onChange={event => setType(event.target.value as keyof typeof rates)}><option value="collector">Collector — {rates.collector / 100}%</option><option value="professional">Professional — {rates.professional / 100}%</option><option value="founding">Eligible founding store — {rates.founding / 100}%</option></select></label>
    <div className="seller-calculator-fields">{[{ label: "Item price (USD)", value: item, set: setItem }, { label: "Buyer-paid shipping (USD)", value: shipping, set: setShipping }, { label: "Illustrative sales tax (USD)", value: tax, set: setTax }, { label: "Assumed processing (%)", value: processing, set: setProcessing }, { label: "Assumed processing fixed fee (USD)", value: fixed, set: setFixed }].map(field => <label key={field.label}>{field.label}<input type="number" min="0" step="0.01" value={field.value} onChange={event => field.set(event.target.value)} /></label>)}</div></div>
    <div aria-live="polite">{result ? <><dl className="store-order-totals"><div><dt>Item price</dt><dd>{formatMoney(Math.round(Number(item) * 100))}</dd></div><div><dt>Buyer-paid shipping</dt><dd>{formatMoney(Math.round(Number(shipping) * 100))}</dd></div><div><dt>Customer pays, including tax</dt><dd>{formatMoney(result.totalCents)}</dd></div><div><dt>Tax withheld</dt><dd>−{formatMoney(Math.round(Number(tax) * 100))}</dd></div><div><dt>Marketplace fee ({rates[type] / 100}%)</dt><dd>−{formatMoney(result.platformFeeCents)}</dd></div><div><dt>Estimated processing deduction</dt><dd>−{formatMoney(result.processingDeductionCents)}</dd></div></dl><p className="seller-proceeds-result"><span>Proceeds before costs</span><strong>{formatMoney(result.proceedsCents)}</strong></p></> : <p role="alert">Enter non-negative amounts and a processing percentage from 0 to 100.</p>}<p>Postage, packaging, and inventory costs still need to be paid. Commission excludes shipping and tax. Processing uses the full customer payment; 2.9% + $0.30 is an editable assumption, not a promised rate. Refunds may change proceeds.</p></div>
  </section>;
}
