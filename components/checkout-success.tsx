"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";

type Order = { orderNumber: string; sellerName: string; buyerEmail: string; shippingCents: number; taxCents: number; totalCents: number; currency: string; fulfillmentStatus: string; items: Array<{ productId: string | null; title: string; quantity: number; unitPriceCents: number }>; orders?: Order[] };

export function CheckoutSuccess({ sessionId }: { sessionId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const { completeCheckout, authReady, cart, collector } = useMarketplace();
  useEffect(() => {
    let stopped = false; let attempts = 0;
    async function check() {
      attempts += 1;
      try {
        const response = await fetch(`/api/orders/by-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json() as { order?: Order; pending?: boolean; error?: string };
        if (response.ok && data.order) { if (!stopped) { setOrder(data.order); setPending(false); } return; }
        if (response.status === 202 && attempts < 6) { setTimeout(check, 1500); return; }
        if (!response.ok) throw new Error(data.error || "Confirmation unavailable.");
        if (!stopped) setPending(false);
      } catch (reason) { if (!stopped) { setError(reason instanceof Error ? reason.message : "Confirmation unavailable."); setPending(false); } }
    }
    void check(); return () => { stopped = true; };
  }, [sessionId]);
  useEffect(() => {
    if (authReady && order) completeCheckout(sessionId, order.items);
  }, [authReady, completeCheckout, order, sessionId]);
  if (pending) return <div className="empty-state" role="status"><p className="eyebrow">Payment returned</p><h1>Confirming your order…</h1><p>Stripe is securely confirming payment with Model Car Center. This usually takes a few seconds.</p></div>;
  if (error || !order) return <div className="empty-state"><p className="eyebrow">Confirmation pending</p><h1>We couldn&apos;t confirm your order yet.</h1><p>Please don&apos;t place the order again. Check the email you used at checkout, including spam, for confirmation. If you need help, contact support from that email and include the payment reference below. No account is needed.</p><code>{sessionId}</code><Link className="button outline" href="/contact">Contact support</Link></div>;
  return (
    <div className="order-confirmation">
      <p className="eyebrow">Payment confirmed</p>
      <h1>Thanks for your purchase.</h1>
      <p>Your confirmation emails go to <b>{order.buyerEmail}</b>. Each seller fulfills their own order and provides separate tracking.</p>
      <p className="checkout-paid-total">Total paid: <b>{money(order.totalCents, order.currency)}</b></p>
      {(order.orders ?? [order]).map((sellerOrder) => <section className="confirmation-card" key={sellerOrder.orderNumber}>
        <h2>{sellerOrder.sellerName}</h2><p>{sellerOrder.orderNumber}</p>
        {sellerOrder.items.map((item, index) => <div key={item.productId ?? index}><span>{item.title} × {item.quantity}</span><b>{money(item.unitPriceCents * item.quantity, sellerOrder.currency)}</b></div>)}
        <div><span>Shipping</span><b>{sellerOrder.shippingCents === 0 ? "Free" : money(sellerOrder.shippingCents, sellerOrder.currency)}</b></div>
        <div><span>Tax</span><b>{money(sellerOrder.taxCents, sellerOrder.currency)}</b></div>
        <div className="total"><span>Seller order total</span><b>{money(sellerOrder.totalCents, sellerOrder.currency)}</b></div>
      </section>)}
      <section className="order-next-steps" aria-labelledby="order-help-title">
        <h2 id="order-help-title">Tracking and support</h2>
        <p>Keep your confirmation email and order number. We&apos;ll email carrier tracking to <b>{order.buyerEmail}</b> when it&apos;s added. Use the tracking details in that email to follow your delivery without signing in.</p>
        <p>Need help or missing an email? Check spam, then <Link className="text-link" href="/contact">contact support</Link> from your checkout email and include the relevant seller&apos;s order number shown above. You don&apos;t need an account.</p>
      </section>
      {cart.length > 0 && <p>Your remaining items are still in your cart, ready when you are.</p>}
      <Link className="button dark" href={cart.length > 0 ? "/cart" : "/marketplace"}>{cart.length > 0 ? "Continue to remaining cart" : "Continue browsing"}</Link>
      {authReady && !collector && (
        <section className="post-purchase-account" aria-labelledby="save-order-title">
          <p className="eyebrow">Optional account</p>
          <h2 id="save-order-title">Save this order in My Garage</h2>
          <p>Create an account to keep your orders, wishlist, and Model Hunt preferences together across devices. Use <b>{order.buyerEmail}</b> and verify the email link to add this guest order automatically.</p>
          <p>Your purchase is complete. Tracking emails and support remain available if you skip this.</p>
          <Link className="button outline" href="/sign-in?returnTo=%2Faccount%3Fview%3Dorders&intent=save-order">Create an account (optional)</Link>
        </section>
      )}
    </div>
  );
}
