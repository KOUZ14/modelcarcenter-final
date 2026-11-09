"use client";

import { type FormEvent, useRef, useState } from "react";
import { formatMoney, formatUtcDateTime } from "@/lib/format";
import { ShipmentTimeline, type ShipmentTimelineData } from "./shipment-timeline";

export type SellerShipmentOrder = {
  id: string;
  orderNumber: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  shippingMode: string;
  selectedShippingCarrier: string | null;
  selectedShippingService: string | null;
  selectedShippingEstimatedDays: number | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  shipment: ShipmentTimelineData | null;
};
export type ShippingPackageDefaults = {
  defaultPackageLength: string;
  defaultPackageWidth: string;
  defaultPackageHeight: string;
  defaultPackageWeight: string;
};
export type SellerShippingSettings = {
  configured: boolean;
  insuranceThresholdCents: number;
  signatureThresholdCents: number;
};

export function SellerShipmentPanel({
  order,
  compatibleOrders,
  store,
  shipping,
  disabled,
  action,
  manualTrackingAction = "ship_order",
}: {
  order: SellerShipmentOrder;
  compatibleOrders: SellerShipmentOrder[];
  store: ShippingPackageDefaults;
  shipping: SellerShippingSettings;
  disabled: boolean;
  action(payload: Record<string, unknown>): Promise<unknown>;
  manualTrackingAction?: "ship_order" | "ship_sale";
}) {
  const purchasePending = useRef(false);
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (order.shipment)
    return <ShipmentDetails shipment={order.shipment} order={order} />;

  if (!["paid", "partially_refunded"].includes(order.paymentStatus) || order.fulfillmentStatus !== "unfulfilled")
    return <p className="form-note">A new label requires a paid order that has not entered fulfillment.</p>;

  async function quoteRates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const response = await shippingRequest({
        action: "quote",
        orderIds: [order.id, ...selectedOrders],
        length: form.length,
        width: form.width,
        height: form.height,
        weight: form.weight,
      });
      setQuote(response.quote as ShippingQuote);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Rates are unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function buyLabel(rateId: string) {
    if (!quote || purchasePending.current || disabled) return;
    purchasePending.current = true;
    setBusy(true);
    setError("");
    try {
      await shippingRequest({ action: "buy_label", quoteId: quote.id, rateId });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The label could not be purchased.");
      purchasePending.current = false;
      setBusy(false);
    }
  }

  async function manualTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action({
        action: manualTrackingAction,
        orderId: order.id,
        ...Object.fromEntries(new FormData(event.currentTarget)),
      });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tracking could not be saved.");
      setBusy(false);
    }
  }

  if (!shipping.configured)
    return (
      <div className="store-shipment-form">
        <p className="form-note">Label purchasing is temporarily unavailable. You can add tracking for a label bought elsewhere.</p>
        <ManualTrackingForm disabled={disabled || busy} order={order} onSubmit={manualTracking} />
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    );

  return (
    <div className="store-shipment-form shipping-workflow">
      <h4>Create shipping label</h4>
      <p className="form-note">The buyer paid {formatMoney(order.shippingCents, order.currency)} for shipping. Checkout does not buy a label. Confirm the packed dimensions and weight, then choose a carrier rate to buy and print your label.</p>
      <p className="form-note">Paid orders can fund a label before your payout is ready. The label price is deducted from your seller proceeds.</p>
      {compatibleOrders.length > 0 && (
        <fieldset className="combined-orders">
          <legend>Combine orders to this same buyer and address</legend>
          {compatibleOrders.map((candidate) => (
            <label key={candidate.id}>
              <input
                type="checkbox"
                checked={selectedOrders.includes(candidate.id)}
                disabled={disabled || busy || Boolean(quote)}
                onChange={(event) =>
                  setSelectedOrders((current) =>
                    event.target.checked
                      ? [...current, candidate.id]
                      : current.filter((id) => id !== candidate.id),
                  )
                }
              />
              {candidate.orderNumber} · {formatMoney(candidate.subtotalCents, candidate.currency)}
            </label>
          ))}
        </fieldset>
      )}
      {!quote ? (
        <form onSubmit={quoteRates}>
          <div className="parcel-grid">
            <label>Length (in)<input name="length" inputMode="decimal" required defaultValue={store.defaultPackageLength} disabled={disabled || busy} /></label>
            <label>Width (in)<input name="width" inputMode="decimal" required defaultValue={store.defaultPackageWidth} disabled={disabled || busy} /></label>
            <label>Height (in)<input name="height" inputMode="decimal" required defaultValue={store.defaultPackageHeight} disabled={disabled || busy} /></label>
            <label>Weight (lb)<input name="weight" inputMode="decimal" required defaultValue={store.defaultPackageWeight} disabled={disabled || busy} /></label>
          </div>
          <p className="shipping-rule-note">Insurance is requested automatically at {formatMoney(shipping.insuranceThresholdCents)}; signature is required at {formatMoney(shipping.signatureThresholdCents)}.</p>
          <button className="button dark small" disabled={disabled || busy}>{busy ? "Getting rates…" : "Get carrier rates"}</button>
        </form>
      ) : (
        <div className="shipping-rates">
          <div className="shipping-guardrails">
            <b>{quote.orderNumbers.length > 1 ? `${quote.orderNumbers.length} orders combined` : "Single order"}</b>
            <span>{quote.insuranceRequired ? `Insured for ${formatMoney(quote.declaredValueCents)}` : "Insurance below threshold"}</span>
            <span>{quote.signatureRequired ? "Signature required" : "No signature required"}</span>
          </div>
          <small>Rates expire {formatUtcDateTime(quote.expiresAt)}. Buying a label deducts the displayed price from your seller proceeds. Reprinting is free.</small>
          {quote.selectedServices.length > 0 && <p className="shipping-rule-note">Only the buyer-selected service or objectively equal/faster services are shown.</p>}
          {quote.rates.map((rate) => (
            <button type="button" key={rate.id} disabled={disabled || busy} onClick={() => void buyLabel(rate.id)}>
              <span><b>{rate.provider}</b><small>{rate.serviceLevel}{rate.estimatedDays == null ? "" : ` · ${rate.estimatedDays} day${rate.estimatedDays === 1 ? "" : "s"}`}</small></span>
              <strong>Buy label · {formatMoney(rate.amountCents, rate.currency)}</strong>
            </button>
          ))}
          <button type="button" className="text-button" disabled={busy} onClick={() => setQuote(null)}>Change package or refresh rates</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <details className="manual-tracking">
        <summary>Use a label bought elsewhere</summary>
        <ManualTrackingForm disabled={disabled || busy} order={order} onSubmit={manualTracking} />
      </details>
    </div>
  );
}

type ShippingQuote = {
  id: string;
  expiresAt: string;
  orderNumbers: string[];
  declaredValueCents: number;
  insuranceRequired: boolean;
  signatureRequired: boolean;
  selectedServices: Array<{
    carrier: string | null;
    serviceToken: string | null;
    estimatedDays: number | null;
  }>;
  rates: Array<{
    id: string;
    provider: string;
    serviceLevel: string;
    amountCents: number;
    currency: string;
    estimatedDays: number | null;
  }>;
};

function ManualTrackingForm({
  disabled,
  order,
  onSubmit,
}: {
  disabled: boolean;
  order: SellerShipmentOrder;
  onSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const protectedService = order.shippingMode === "calculated";
  return <form onSubmit={onSubmit}><label>Carrier<input name="carrier" required maxLength={100} disabled={disabled} defaultValue={protectedService ? order.selectedShippingCarrier ?? "" : ""} /></label><label>Carrier service<input name="fulfillmentService" required={protectedService} maxLength={150} disabled={disabled} defaultValue={protectedService ? order.selectedShippingService ?? "" : ""} /></label><label>Estimated transit days<input name="fulfillmentEstimatedDays" type="number" min={0} max={60} required={protectedService} disabled={disabled} defaultValue={protectedService ? order.selectedShippingEstimatedDays ?? "" : ""} /></label><label>Tracking number<input name="trackingNumber" required maxLength={200} disabled={disabled} /></label>{protectedService && <p className="form-note">By submitting, you confirm this service matches or improves on the buyer&apos;s selection.</p>}<button className="button outline small" disabled={disabled}>Mark shipped manually</button></form>;
}

function ShipmentDetails({ shipment, order }: { shipment: ShipmentTimelineData; order: SellerShipmentOrder }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sync() {
    setBusy(true);
    setError("");
    try {
      await shippingRequest({ action: "sync_tracking", shipmentId: shipment.id });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tracking could not be refreshed.");
      setBusy(false);
    }
  }
  return (
    <>
      <ShipmentTimeline
        shipment={shipment}
        actions={
          <>
            <a className="button dark small" href={`/api/shipping/label?shipment_id=${encodeURIComponent(shipment.id)}`} target="_blank" rel="noreferrer">Print 4×6 label</a>
            <button className="button outline small" disabled={busy} onClick={() => void sync()}>{busy ? "Refreshing…" : "Refresh events"}</button>
          </>
        }
        note={order.fulfillmentStatus === "processing" ? <p className="form-note">A label is ready, but handling remains open until the carrier records the package in transit.</p> : null}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

async function shippingRequest(payload: Record<string, unknown>) {
  const response = await fetch("/api/shipping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(body.error || "The shipping request failed.");
  return body;
}
