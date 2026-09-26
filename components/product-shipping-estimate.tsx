"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { parseEstimateZip } from "@/lib/shipping-rules";
import type { ProductSummary } from "@/lib/types";
import { useShippingZip } from "./use-shipping-zip";

type Estimate = {
  zip: string;
  productId: string;
  requiresAddress: boolean;
  options: Array<{ provider: string; serviceLevel: string; amountCents: number; currency: string }>;
};

export function ProductShippingEstimate({ product, preview = false }: { product: ProductSummary; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useShippingZip();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const pending = useRef<AbortController | null>(null);
  const panelId = useId();
  const shippingMode = product.sellerType === "collector" ? "calculated" : product.shippingMode;
  const activeEstimate = estimate?.zip === zip.trim() && estimate.productId === product.id ? estimate : null;

  useEffect(() => () => { pending.current?.abort(); }, [product.id]);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setEstimate(null);
    try {
      const destinationZip = parseEstimateZip(zip);
      setZip(destinationZip);
      setLoading(true);
      const response = await fetch("/api/shipping/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, zip: destinationZip }),
        signal: controller.signal,
      });
      const data = await response.json() as Omit<Estimate, "productId"> & { error?: string };
      if (!response.ok) throw new Error(data.error || "Shipping could not be estimated. Please try again.");
      if (!controller.signal.aborted) setEstimate({ ...data, productId: product.id });
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Shipping could not be estimated. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <div>
    <div className="product-price-row">
      <p className="detail-price">{preview && !product.priceCents ? "Price not entered" : formatMoney(product.priceCents, product.currency)}</p>
      {shippingMode === "calculated" ? product.availableQuantity > 0 && (
        <button className="text-button shipping-estimate-toggle" type="button" disabled={preview} aria-expanded={open} aria-controls={panelId} onClick={() => { if (!preview) setOpen(!open); }}>
          Estimate shipping
        </button>
      ) : <span className="product-shipping-price">{shippingMode === "free" ? "Free shipping" : `${formatMoney(product.defaultShippingCents, product.currency)} flat-rate shipping per order`}</span>}
    </div>
    {shippingMode === "calculated" && open && <div id={panelId} className="product-shipping-estimate">
      <form onSubmit={calculate} aria-busy={loading}>
        <label htmlFor={`${panelId}-zip`}>Destination ZIP code (U.S.)</label>
        <div className="shipping-estimate-fields">
          <input id={`${panelId}-zip`} name="zip" type="text" inputMode="numeric" autoComplete="shipping postal-code" required maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" title="Enter a five-digit U.S. ZIP code or ZIP+4." placeholder="e.g. 90210" value={zip} aria-describedby={`${panelId}-note`} onChange={(event) => {
            pending.current?.abort();
            setLoading(false);
            setEstimate(null);
            setError("");
            setZip(event.target.value);
          }} />
          <button className="button outline small" disabled={loading}>{loading ? "Estimating…" : "Get estimate"}</button>
        </div>
      </form>
      <p id={`${panelId}-note`} className="form-note">Estimate for one model. Your complete delivery address determines the final shipping charge in the cart.</p>
      <div role="status" aria-live="polite">
        {loading && <p className="form-note">Checking available carrier estimates…</p>}
        {activeEstimate && (activeEstimate.requiresAddress ? <p className="form-note">No ZIP-only estimate is available for this destination. Add this model to your cart and enter your complete address for carrier options. <Link className="text-link" href="/cart">Open cart</Link></p> : <>
          <p className="shipping-estimate-heading">Estimated shipping to {activeEstimate.zip}</p>
          <ul className="shipping-estimate-results">{activeEstimate.options.map((option, index) => <li key={`${option.provider}-${option.serviceLevel}-${index}`}><span>{option.provider} {option.serviceLevel}</span><b>{formatMoney(option.amountCents, option.currency)}</b></li>)}</ul>
        </>)}
      </div>
      {error && <p className="form-error" role="alert">{error} <Link className="text-link" href="/cart">Open cart</Link></p>}
    </div>}
  </div>;
}
