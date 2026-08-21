"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";

export function CartPage() {
  const { cart, removeFromCart, setQuantity, clearCart, collector } =
    useMarketplace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [shippingQuote, setShippingQuote] = useState<{
    cartKey: string;
    quoteId: string;
    expiresAt: string;
    insuranceRequired?: boolean;
    signatureRequired?: boolean;
    options: ShippingOption[];
  } | null>(null);
  const [selectedRateId, setSelectedRateId] = useState("");
  const subtotal = cart.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const shippingMode = cart[0]?.shippingMode ?? "flat";
  const cartKey = cart.map((item) => `${item.productId}:${item.quantity}`).join("|");
  const activeShippingQuote = shippingQuote?.cartKey === cartKey ? shippingQuote : null;
  const selectedRate = activeShippingQuote?.options.find(
    (option) => option.id === selectedRateId,
  );
  const shipping =
    shippingMode === "free"
      ? 0
      : shippingMode === "flat"
        ? (cart[0]?.shippingCents ?? 0)
        : (selectedRate?.amountCents ?? 0);
  async function calculateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCalculating(true);
    setError("");
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/shipping/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          destination: fields,
        }),
      });
      const data = (await response.json()) as {
        quoteId?: string;
        expiresAt?: string;
        options?: ShippingOption[];
        insuranceRequired?: boolean;
        signatureRequired?: boolean;
        error?: string;
      };
      if (!response.ok || !data.quoteId || !data.expiresAt || !data.options?.length)
        throw new Error(data.error || "Shipping options could not be calculated.");
      setShippingQuote({
        cartKey,
        quoteId: data.quoteId,
        expiresAt: data.expiresAt,
        options: data.options,
        insuranceRequired: data.insuranceRequired,
        signatureRequired: data.signatureRequired,
      });
      setSelectedRateId(data.options[0].id);
    } catch (reason) {
      setShippingQuote(null);
      setSelectedRateId("");
      setError(reason instanceof Error ? reason.message : "Shipping options could not be calculated.");
    } finally {
      setCalculating(false);
    }
  }
  async function checkout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyVersion: POLICY_VERSION,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          shippingSelection:
            shippingMode === "calculated"
              ? { quoteId: activeShippingQuote?.quoteId, rateId: selectedRateId }
              : { rateId: shippingMode },
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url)
        throw new Error(data.error || "Checkout could not be started.");
      window.location.assign(data.url);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Checkout could not be started.",
      );
      setLoading(false);
    }
  }
  if (!cart.length)
    return (
      <div className="empty-state">
        <p className="eyebrow">Your cart</p>
        <h1>Your cart is empty.</h1>
        <p>
          Browse current inventory and add a model when you find the right one.
        </p>
        <Link className="button dark" href="/marketplace">
          Browse model cars
        </Link>
      </div>
    );
  return (
    <div>
      <div className="page-title">
        <p className="eyebrow">One seller per checkout</p>
        <h1>Your cart</h1>
        <p>
          Products in this cart are sold by {cart[0].sellerName}. Model Car
          Center currently checks out one seller at a time.
        </p>
        {!collector && (
          <p>
            <Link className="text-link" href="/sign-in?returnTo=/cart">
              Sign in to keep your orders, wishlist, and Model Hunts in one
              place.
            </Link>
          </p>
        )}
      </div>
      <div className="cart-layout">
        <div className="cart-items">
          {cart.map((item) => (
            <article className="cart-item" key={item.productId}>
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={150}
                  height={150}
                  unoptimized
                />
              ) : (
                <div className="cart-image-placeholder" />
              )}
              <div>
                <p className="product-meta">
                  {item.scale} · {item.modelManufacturer}
                </p>
                <h2>
                  <Link href={`/products/${item.slug}`}>{item.title}</Link>
                </h2>
                <p>Sold by {item.sellerName}</p>
                {item.availabilityType === "preorder" && item.releaseDate && (
                  <p className="cart-preorder-note">
                    Preorder · Expected release {formatReleaseDate(item.releaseDate)}
                  </p>
                )}
                <label>
                  Quantity
                  <select
                    value={item.quantity}
                    onChange={(event) =>
                      setQuantity(item.productId, Number(event.target.value))
                    }
                  >
                    {Array.from(
                      { length: Math.min(item.availableQuantity, 10) },
                      (_, index) => index + 1,
                    ).map((quantity) => (
                      <option key={quantity}>{quantity}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                >
                  Remove
                </button>
              </div>
              <b>{money(item.priceCents * item.quantity, item.currency)}</b>
            </article>
          ))}
        </div>
        <aside className="cart-summary">
          <h2>Order summary</h2>
          {shippingMode === "calculated" && (
            <form className="checkout-shipping-form" onSubmit={calculateShipping}>
              <h3>Delivery address</h3>
              <p>Enter the address you will confirm in Stripe to compare carrier services.</p>
              <label>Full name<input name="name" autoComplete="shipping name" required /></label>
              <label>Street address<input name="street1" autoComplete="shipping address-line1" required /></label>
              <label>Apartment, suite, or unit<input name="street2" autoComplete="shipping address-line2" /></label>
              <div className="checkout-address-row"><label>City<input name="city" autoComplete="shipping address-level2" required /></label><label>State<input name="state" autoComplete="shipping address-level1" required /></label></div>
              <div className="checkout-address-row"><label>Postal code<input name="zip" autoComplete="shipping postal-code" required /></label><label>Country code<input name="country" autoComplete="shipping country" maxLength={2} defaultValue="US" required /></label></div>
              <button className="button outline small" disabled={calculating}>{calculating ? "Calculating…" : activeShippingQuote ? "Refresh carrier options" : "Calculate carrier options"}</button>
              {activeShippingQuote && <fieldset className="shipping-options"><legend>Choose a carrier service</legend>{activeShippingQuote.options.map((option) => <label className="shipping-option" key={option.id}><input type="radio" name="shippingRate" value={option.id} checked={selectedRateId === option.id} onChange={() => setSelectedRateId(option.id)} /><span><b>{option.provider} {option.serviceLevel}</b><small>{option.estimatedDays == null ? option.durationTerms || "Carrier estimate unavailable" : `${option.estimatedDays} business day${option.estimatedDays === 1 ? "" : "s"}`}</small></span><b>{money(option.amountCents, option.currency)}</b></label>)}{(activeShippingQuote.insuranceRequired || activeShippingQuote.signatureRequired) && <p className="form-note">Protection is included automatically{activeShippingQuote.insuranceRequired ? " with insurance" : ""}{activeShippingQuote.signatureRequired ? " and signature confirmation" : ""}.</p>}</fieldset>}
            </form>
          )}
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(subtotal, cart[0].currency)}</dd>
            </div>
            <div>
              <dt>{shippingMode === "calculated" ? "Selected carrier service" : shippingMode === "free" ? "Shipping" : "Seller flat-rate shipping"}</dt>
              <dd>{shippingMode === "calculated" && !selectedRate ? "Choose a service" : shippingMode === "free" ? "Free" : money(shipping, cart[0].currency)}</dd>
            </div>
            <div className="total">
              <dt>Total before tax</dt>
              <dd>{money(subtotal + shipping, cart[0].currency)}</dd>
            </div>
          </dl>
          <p>
            Tax, when enabled, is calculated by Stripe Checkout. {shippingMode === "calculated" ? "The seller must use your selected service or an equal/faster service." : shippingMode === "free" ? "This store offers free shipping." : "This store uses a flat shipping rate."}
          </p>
          {cart.some((item) => item.availabilityType === "preorder") && (
            <p className="checkout-preorder-notice">
              This order includes a preorder. You’ll be charged in full today;
              the complete order ships after the latest expected release date.
              Release dates may change.
            </p>
          )}
          <label className="consent-check checkout-consent">
            <input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} />
            <span>I agree to the <Link href="/terms">Marketplace Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>, <Link href="/shipping">Shipping Policy</Link>, and <Link href="/returns">Returns &amp; Refunds Policy</Link>.</span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button dark checkout-button"
            type="button"
            disabled={loading || !acceptedPolicies || (shippingMode === "calculated" && (!activeShippingQuote || !selectedRateId))}
            onClick={checkout}
          >
            {loading ? "Starting secure checkout…" : "Checkout with Stripe"}
          </button>
          <button className="text-button" type="button" onClick={clearCart}>
            Clear cart
          </button>
        </aside>
      </div>
    </div>
  );
}

type ShippingOption = {
  id: string;
  provider: string;
  serviceLevel: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string;
};

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}
