"use client";

import Link from "next/link";
import { AdultConsent } from "./adult-consent";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";
import { PreorderOffer } from "./preorder-offer";

export function ProductPurchase({ product }: { product: ProductSummary }) {
  const { addToCart, toggleWishlist, wishlistHas, collector, cart, authReady } = useMarketplace();
  const [added, setAdded] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [alertError, setAlertError] = useState("");
  const email = emailOverride ?? collector?.email ?? "";
  const saved = wishlistHas(product.id);
  const canBuy = product.availabilityType !== "preorder" && product.availableQuantity > 0;
  const inCart = cart.find(item => item.productId === product.id)?.quantity ?? 0;
  const atLimit = inCart >= Math.min(10, product.availableQuantity);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    const actions = actionsRef.current;
    if (!canBuy || !actions) return;
    const observer = new IntersectionObserver(([entry]) => {
      // An action below the first screen must not trigger the bar early.
      setShowSticky(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(actions);
    return () => observer.disconnect();
  }, [canBuy, product.id]);

  function add() {
    if (authReady && canBuy && !atLimit && !added && addToCart(product)) setAdded(true);
  }

  const cartAction = (sticky = false) => atLimit && !added ? (
    <Link className="button dark buy-button" href="/cart">View cart</Link>
  ) : (
    <button className="button dark buy-button" type="button" disabled={!authReady || added}
      aria-describedby={sticky ? undefined : `seller-checkout-${product.id}`} onClick={add}>
      {added ? <><Icon name="check"/> Added to cart</> : "Add to cart"}
    </button>
  );
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlertState("loading");
    setAlertError("");
    try {
      const response = await fetch("/api/availability-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, email, adultConsent: new FormData(event.currentTarget).get("adultConsent") }),
      });
      const body = (await response.json()) as { error?: string; available?: boolean };
      if (!response.ok) throw new Error(body.error || "The alert could not be saved.");
      if (body.available) {
        window.location.reload();
        return;
      }
      setAlertState("success");
    } catch (reason) {
      setAlertError(reason instanceof Error ? reason.message : "The alert could not be saved.");
      setAlertState("error");
    }
  }
  if (product.availabilityType === "preorder") return <PreorderOffer product={product}/>;
  if (product.availableQuantity < 1) {
    return <div className="restock-panel">
      <h2>Get a restock alert</h2>
      <p>We’ll email you once when this model becomes available again.</p>
      {alertState === "success" ? <p className="restock-success" role="status"><Icon name="check"/> Alert set for {email}.</p> : <form className="restock-form" onSubmit={subscribe}>
        <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmailOverride(event.target.value)}/></label>
        <AdultConsent/>
        <p className="collection-notice">One requested restock email. You can stop optional emails using its unsubscribe link or by contacting support. See our <Link href="/privacy">Privacy Policy</Link>.</p>
        <button className="button dark" disabled={alertState === "loading"}>{alertState === "loading" ? "Setting alert…" : "Notify me"}</button>
        {alertState === "error" && <p className="form-error" role="alert">{alertError}</p>}
      </form>}
      <div className="restock-secondary-actions">
        <button className="save-sold-out" type="button" aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/> {saved ? "Listing saved" : "Save listing"}</button>
      </div>
    </div>;
  }
  return <div className="product-purchase">
    <div className="purchase-actions" ref={actionsRef}>
      {cartAction()}
      <button className="button outline purchase-save" type="button" aria-label="Save listing" title={saved ? "Listing saved" : "Save listing"} aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/></button>
    </div>
    <span className="sr-only" role="status">{added ? `${product.title} added to cart.` : ""}</span>
    <p className="seller-checkout-notice" id={`seller-checkout-${product.id}`}>Shop several sellers in one checkout. Each seller has separate shipping.{cart.some((item) => item.sellerId !== product.sellerId) && <> Adding this model to {product.sellerName}&apos;s group keeps all your other items in your cart.</>}</p>
    {showSticky && <div className="product-sticky-purchase" role="region" aria-label="Purchase this listing">
      <Link className="sticky-shop-link" href="/marketplace" aria-label="Back to Shop"><Icon name="search"/><span>Shop</span></Link>
      <div className="sticky-price"><strong>{formatMoney(product.priceCents, product.currency)}</strong><span>Item price</span></div>
      {cartAction(true)}
    </div>}
  </div>;
}
