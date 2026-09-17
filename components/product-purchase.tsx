"use client";

import Link from "next/link";
import { AdultConsent } from "./adult-consent";
import { FormEvent, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function ProductPurchase({ product }: { product: ProductSummary }) {
  const { addToCart, toggleWishlist, wishlistHas, collector, cart, authReady } = useMarketplace();
  const [added, setAdded] = useState(false);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [alertError, setAlertError] = useState("");
  const email = emailOverride ?? collector?.email ?? "";
  const saved = wishlistHas(product.id);
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
        <button className="save-sold-out" type="button" aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/> {saved ? "Saved to wishlist" : "Save to wishlist"}</button>
        <Link className="save-sold-out" href={`/messages?product=${encodeURIComponent(product.id)}`}><Icon name="message"/>Message seller</Link>
      </div>
    </div>;
  }
  const preorder = product.availabilityType === "preorder";
  return <div><p className="seller-checkout-notice" id={`seller-checkout-${product.id}`}>Shop several sellers in one checkout. Each seller has separate shipping.{cart.some((item) => item.sellerId !== product.sellerId) && <> Adding this model to {product.sellerName}&apos;s group keeps all your other items in your cart.</>}</p><div className="purchase-actions"><button className="button dark buy-button" type="button" disabled={!authReady} aria-describedby={`seller-checkout-${product.id}`} onClick={() => { if (addToCart(product)) { setAdded(true); setTimeout(() => setAdded(false), 1800); } }}>{added ? <><Icon name="check"/> Added to cart</> : preorder ? "Preorder now" : "Add to cart"}</button><button className="button outline" type="button" aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/>{saved ? "Saved" : "Save model"}</button><Link className="button outline message-seller-button" href={`/messages?product=${encodeURIComponent(product.id)}`}><Icon name="message"/>Message seller</Link></div>{preorder && product.releaseDate && <p className="preorder-terms">Paid in full today. Expected to ship after {formatReleaseDate(product.releaseDate)}. Release dates may change.</p>}</div>;
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}
