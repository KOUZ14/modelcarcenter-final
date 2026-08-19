"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";

export function CartPage() {
  const { cart, removeFromCart, setQuantity, clearCart } = useMarketplace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const subtotal = cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const shipping = cart[0]?.shippingCents ?? 0;
  async function checkout() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout could not be started.");
      window.location.assign(data.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setLoading(false); }
  }
  if (!cart.length) return <div className="empty-state"><p className="eyebrow">Your cart</p><h1>Your cart is empty.</h1><p>Browse current inventory and add a model when you find the right one.</p><Link className="button dark" href="/#inventory">Browse model cars</Link></div>;
  return <div><div className="page-title"><p className="eyebrow">One seller per checkout</p><h1>Your cart</h1><p>Products in this cart are sold by {cart[0].sellerName}. Model Car Center currently checks out one seller at a time.</p></div><div className="cart-layout"><div className="cart-items">{cart.map((item) => <article className="cart-item" key={item.productId}>{item.imageUrl ? <Image src={item.imageUrl} alt="" width={150} height={150} unoptimized/> : <div className="cart-image-placeholder"/>}<div><p className="product-meta">{item.scale} · {item.modelManufacturer}</p><h2><Link href={`/products/${item.slug}`}>{item.title}</Link></h2><p>Sold by {item.sellerName}</p><label>Quantity<select value={item.quantity} onChange={(event) => setQuantity(item.productId, Number(event.target.value))}>{Array.from({ length: Math.min(item.availableQuantity, 10) }, (_, index) => index + 1).map((quantity) => <option key={quantity}>{quantity}</option>)}</select></label><button className="text-button" type="button" onClick={() => removeFromCart(item.productId)}>Remove</button></div><b>{money(item.priceCents * item.quantity, item.currency)}</b></article>)}</div><aside className="cart-summary"><h2>Order summary</h2><dl><div><dt>Subtotal</dt><dd>{money(subtotal, cart[0].currency)}</dd></div><div><dt>Estimated seller shipping</dt><dd>{money(shipping, cart[0].currency)}</dd></div><div className="total"><dt>Total before tax</dt><dd>{money(subtotal + shipping, cart[0].currency)}</dd></div></dl><p>Tax, when enabled, is calculated by Stripe Checkout. Shipping is a flat seller rate for this order.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark checkout-button" type="button" disabled={loading} onClick={checkout}>{loading ? "Starting secure checkout…" : "Checkout with Stripe"}</button><button className="text-button" type="button" onClick={clearCart}>Clear cart</button></aside></div></div>;
}
