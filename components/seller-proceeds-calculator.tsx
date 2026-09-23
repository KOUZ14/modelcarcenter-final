"use client";

import { useState } from "react";
import { estimateSellerProceeds } from "@/lib/seller-calculator";
import { formatMoney } from "@/lib/format";
import "./seller-proceeds-calculator.css";

export function SellerProceedsCalculator({ rates }: { rates: { collector: number; professional: number; founding: number } }) {
  const [type, setType] = useState<keyof typeof rates>("collector");
  const [item, setItem] = useState("200");
  const [shipping, setShipping] = useState("10");
  const [tax, setTax] = useState("20");
  const [processing, setProcessing] = useState("2.9");
  const [fixed, setFixed] = useState("0.30");
  const valid = [item, shipping, tax, processing, fixed].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000) && Number(processing) <= 100;
  const result = valid ? estimateSellerProceeds({ itemCents: Math.round(Number(item) * 100), shippingCents: Math.round(Number(shipping) * 100), taxCents: Math.round(Number(tax) * 100), feeBps: rates[type], processingBps: Math.round(Number(processing) * 100), processingFixedCents: Math.round(Number(fixed) * 100) }) : null;

  return <section className="seller-proceeds-calculator" aria-labelledby="proceeds-title">
    <div className="seller-calculator-heading">
      <p className="eyebrow">Plan a sale</p>
      <h2 id="proceeds-title">What could you receive?</h2>
      <p>Adjust the example to estimate your proceeds before costs.</p>
    </div>
    <div className="seller-calculator-primary">
      <label>Seller type<select value={type} onChange={event => setType(event.target.value as keyof typeof rates)}>
        <option value="collector">Collector — {rates.collector / 100}%</option>
        <option value="professional">Store — {rates.professional / 100}%</option>
        <option value="founding">Eligible founding store — {rates.founding / 100}%</option>
      </select></label>
      {type === "founding" && <p className="seller-calculator-note">This rate applies only during a store’s assigned founding offer.</p>}
      <div className="seller-calculator-fields">
        {[{ label: "Item price (USD)", value: item, set: setItem }, { label: "Buyer-paid shipping (USD)", value: shipping, set: setShipping }].map(field => <label key={field.label}>{field.label}<input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={field.value} onChange={event => field.set(event.target.value)} /></label>)}
      </div>
    </div>
    <div className="seller-calculator-result">
      <div aria-live="polite" aria-atomic="true">
        {result ? <p className="seller-proceeds-result"><span>Estimated proceeds before costs</span><strong>{formatMoney(result.proceedsCents)}</strong></p>
          : <p role="alert">Enter amounts from 0 to 1,000,000 and a processing percentage from 0 to 100. Check the tax and processing assumptions below, too.</p>}
      </div>
      <p className="seller-calculator-note">Postage, packaging and inventory costs still need to be paid.</p>
      {result && <>
        <p className="seller-calculator-assumption-note">Assumes {formatMoney(Math.round(Number(tax) * 100))} tax and {Number(processing)}% + {formatMoney(Math.round(Number(fixed) * 100))} processing. Actual amounts vary.</p>
        <details className="seller-calculator-breakdown">
          <summary>Show calculation</summary>
          <dl>
            <div><dt>Item price</dt><dd>{formatMoney(Math.round(Number(item) * 100))}</dd></div>
            <div><dt>Buyer-paid shipping</dt><dd>{formatMoney(Math.round(Number(shipping) * 100))}</dd></div>
            <div><dt>Customer pays, including tax</dt><dd>{formatMoney(result.totalCents)}</dd></div>
            <div><dt>Tax withheld</dt><dd>{`−${formatMoney(Math.round(Number(tax) * 100))}`}</dd></div>
            <div><dt>Marketplace fee ({rates[type] / 100}%)</dt><dd>{`−${formatMoney(result.platformFeeCents)}`}</dd></div>
            <div><dt>Estimated processing deduction</dt><dd>{`−${formatMoney(result.processingDeductionCents)}`}</dd></div>
          </dl>
        </details>
      </>}
    </div>
    <details className="seller-calculator-assumptions">
      <summary>Tax and processing assumptions</summary>
      <div className="seller-calculator-assumption-fields">
        {[{ label: "Illustrative sales tax (USD)", value: tax, set: setTax, max: 1000000 }, { label: "Assumed processing (%)", value: processing, set: setProcessing, max: 100 }, { label: "Assumed processing fixed fee (USD)", value: fixed, set: setFixed, max: 1000000 }].map(field => <label key={field.label}>{field.label}<input type="number" min="0" max={field.max} step="0.01" inputMode="decimal" value={field.value} onChange={event => field.set(event.target.value)} /></label>)}
      </div>
      <p>Marketplace commission excludes shipping and tax. Processing uses the full customer payment; the initial 2.9% + $0.30 is an editable assumption, not a promised rate. Tax is withheld. Actual processing and tax are confirmed on each order; refunds may change proceeds.</p>
    </details>
  </section>;
}
