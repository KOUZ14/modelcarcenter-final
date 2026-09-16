"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { useShippingZip } from "./use-shipping-zip";
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY, checkoutAddressKey, readCheckoutAddressDraft } from "@/lib/checkout-address";
import type { NormalizedShippingAddress } from "@/lib/shipping-rules";

export function CartPage({
  automaticTax,
  taxBehavior,
}: {
  automaticTax: boolean;
  taxBehavior: "exclusive" | "inclusive";
}) {
  const { cart, removeFromCart, setQuantity, clearCart, collector, authReady } =
    useMarketplace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const addressRef = useRef<AddressFieldsHandle>(null);
  const addressForm = useRef<HTMLFormElement>(null);
  const addressRevision = useRef(0);
  const [shippingZip, setShippingZip] = useShippingZip();
  const [destination, setDestination] = useState<NormalizedShippingAddress | null>(null);
  useEffect(() => {
    let active = true;
    // Back/forward cache can restore the pre-redirect loading state. Reload to
    // close its payment session and refresh stock before editing the destination.
    const refreshOnReturn = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", refreshOnReturn);
    void Promise.resolve().then(() => {
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(CHECKOUT_ADDRESS_KEY); } catch { /* Optional tab-local storage. */ }
      if (active) {
        const address = readCheckoutAddressDraft(saved);
        setDestination(address);
        if (saved) setShippingZip(address.zip);
      }
    });
    return () => {
      active = false;
      addressRevision.current += 1;
      window.removeEventListener("pageshow", refreshOnReturn);
    };
  }, [setShippingZip]);
  const deliveryAddress = destination ? { ...destination, zip: shippingZip } : null;
  const [shippingQuote, setShippingQuote] = useState<{
    cartKey: string;
    addressKey: string;
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
  const cartKey = JSON.stringify(cart.map((item) => [item.productId, item.quantity, item.priceCents, item.currency, item.shippingMode, item.shippingCents]));
  const addressKey = deliveryAddress ? checkoutAddressKey(deliveryAddress) : "";
  const activeShippingQuote = shippingQuote?.cartKey === cartKey && shippingQuote.addressKey === addressKey && Date.parse(shippingQuote.expiresAt) > Date.now() ? shippingQuote : null;
  useEffect(() => {
    if (!shippingQuote) return;
    const timer = setTimeout(() => {
      setShippingQuote(null);
      setSelectedRateId("");
    }, Math.max(0, Date.parse(shippingQuote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [shippingQuote]);
  const selectedRate = activeShippingQuote?.options.find(
    (option) => option.id === selectedRateId,
  );
  const shipping =
    shippingMode === "free"
      ? 0
      : shippingMode === "flat"
        ? (cart[0]?.shippingCents ?? 0)
        : (selectedRate?.amountCents ?? null);
  const taxAddedAtCheckout = automaticTax && taxBehavior === "exclusive";
  const taxExplanation = !automaticTax
    ? "Tax is not collected at checkout."
    : taxBehavior === "inclusive"
      ? "Prices include applicable tax. The tax amount is calculated in Stripe Checkout before payment."
      : "Applicable tax is calculated in Stripe Checkout and added before payment.";
  async function calculateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shippingMode !== "calculated") { await checkout(); return; }
    setCalculating(true);
    setShippingQuote(null);
    setSelectedRateId("");
    setError("");
    const revision = ++addressRevision.current;
    try {
      const response = await fetch("/api/shipping/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          destination: deliveryAddress,
        }),
      });
      const data = (await response.json()) as {
        quoteId?: string;
        expiresAt?: string;
        options?: ShippingOption[];
        insuranceRequired?: boolean;
        signatureRequired?: boolean;
        error?: string;
        fields?: Record<string, string>;
      };
      if (revision !== addressRevision.current) return;
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.quoteId || !data.expiresAt || !data.options?.length)
        throw new Error(data.error || "Shipping options could not be calculated.");
      setShippingQuote({
        cartKey,
        addressKey,
        quoteId: data.quoteId,
        expiresAt: data.expiresAt,
        options: data.options,
        insuranceRequired: data.insuranceRequired,
        signatureRequired: data.signatureRequired,
      });
      setSelectedRateId(data.options[0].id);
    } catch (reason) {
      if (revision !== addressRevision.current) return;
      setShippingQuote(null);
      setSelectedRateId("");
      setError(reason instanceof Error ? reason.message : "Shipping options could not be calculated.");
    } finally {
      if (revision === addressRevision.current) setCalculating(false);
    }
  }
  async function checkout() {
    if (loading || calculating || !acceptedPolicies || !deliveryAddress || !addressForm.current?.reportValidity()) return;
    if (shippingMode === "calculated" && (!activeShippingQuote || !selectedRate)) {
      setError("Calculate fresh shipping rates for your delivery address before checkout.");
      return;
    }
    try { sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(deliveryAddress)); } catch { /* Optional tab-local storage. */ }
    setLoading(true);
    setError("");
    try {
      let previousReservationId: string | null = null;
      try { previousReservationId = sessionStorage.getItem(CHECKOUT_SESSION_KEY); } catch { /* Storage may be disabled. */ }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyVersion: POLICY_VERSION,
          destination: deliveryAddress,
          previousReservationId,
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
      const data = (await response.json()) as { url?: string; reservationId?: string; error?: string; fields?: Record<string, string> };
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.url)
        throw new Error(data.error || "Checkout could not be started.");
      if (data.reservationId) {
        try { sessionStorage.setItem(CHECKOUT_SESSION_KEY, data.reservationId); } catch { /* The Stripe return link still closes this session. */ }
      }
      window.location.assign(data.url);
    } catch (reason) {
      setShippingQuote(null);
      setSelectedRateId("");
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
                    disabled={loading}
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
                  disabled={loading}
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
          {deliveryAddress && (
            <form ref={addressForm} className="checkout-shipping-form" onSubmit={calculateShipping}>
              <h3>Delivery address</h3>
              <p>Enter your delivery address once. We’ll carry it into secure payment. Return to your cart to change it before paying.</p>
              <AddressFields ref={addressRef} includeName disabled={loading} initialValues={deliveryAddress} values={deliveryAddress} onChange={(address) => {
                addressRevision.current += 1;
                setDestination(address);
                setShippingZip(address.zip);
                setShippingQuote(null);
                setSelectedRateId("");
                setCalculating(false);
                setError("");
                try { sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(address)); } catch { /* Optional tab-local storage. */ }
              }} />
              {shippingMode === "calculated" && <button className="button outline small" disabled={loading || calculating || !authReady}>{calculating ? "Calculating…" : activeShippingQuote ? "Refresh carrier options" : "Calculate carrier options"}</button>}
              {activeShippingQuote && <fieldset className="shipping-options"><legend>Choose a carrier service</legend>{activeShippingQuote.options.map((option) => <label className="shipping-option" key={option.id}><input type="radio" name="shippingRate" value={option.id} checked={selectedRateId === option.id} onChange={() => setSelectedRateId(option.id)} /><span><b>{option.provider} {option.serviceLevel}</b><small>{option.estimatedDays == null ? option.durationTerms || "Carrier estimate unavailable" : `${option.estimatedDays} business day${option.estimatedDays === 1 ? "" : "s"}`}</small></span><b>{money(option.amountCents, option.currency)}</b></label>)}{(activeShippingQuote.insuranceRequired || activeShippingQuote.signatureRequired) && <p className="form-note">Protection is included automatically{activeShippingQuote.insuranceRequired ? " with insurance" : ""}{activeShippingQuote.signatureRequired ? " and signature confirmation" : ""}.</p>}</fieldset>}
            </form>
          )}
          <dl>
            <div>
              <dt>Item subtotal</dt>
              <dd>{money(subtotal, cart[0].currency)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{shipping === null ? "Not calculated" : shipping === 0 ? "Free" : money(shipping, cart[0].currency)}</dd>
            </div>
            {shipping !== null && (
              <div className="total">
                <dt>{taxAddedAtCheckout ? "Total before tax" : "Total"}</dt>
                <dd>{money(subtotal + shipping, cart[0].currency)}</dd>
              </div>
            )}
          </dl>
          <p>
            {taxExplanation} {shippingMode === "calculated" ? "The seller must use your selected service or an equal/faster service." : shippingMode === "free" ? "This store offers free shipping." : "This store uses a flat shipping rate."}
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
            disabled={loading || calculating || !authReady || !deliveryAddress || !acceptedPolicies || (shippingMode === "calculated" && (!activeShippingQuote || !selectedRate))}
            onClick={checkout}
          >
            {loading ? "Starting secure checkout…" : "Checkout with Stripe"}
          </button>
          <button className="text-button" type="button" disabled={loading} onClick={clearCart}>
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
