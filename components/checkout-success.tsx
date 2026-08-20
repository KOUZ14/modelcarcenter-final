"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";

type Order = { orderNumber: string; sellerName: string; buyerEmail: string; totalCents: number; currency: string; fulfillmentStatus: string; items: Array<{ title: string; quantity: number; unitPriceCents: number }> };

export function CheckoutSuccess({ sessionId }: { sessionId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const { clearCart } = useMarketplace();
  useEffect(() => {
    let stopped = false; let attempts = 0;
    async function check() {
      attempts += 1;
      try {
        const response = await fetch(`/api/orders/by-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json() as { order?: Order; pending?: boolean; error?: string };
        if (response.ok && data.order) { if (!stopped) { setOrder(data.order); setPending(false); clearCart(); } return; }
        if (response.status === 202 && attempts < 6) { setTimeout(check, 1500); return; }
        if (!response.ok) throw new Error(data.error || "Confirmation unavailable.");
        if (!stopped) setPending(false);
      } catch (reason) { if (!stopped) { setError(reason instanceof Error ? reason.message : "Confirmation unavailable."); setPending(false); } }
    }
    void check(); return () => { stopped = true; };
  }, [clearCart, sessionId]);
  if (pending) return <div className="empty-state" role="status"><p className="eyebrow">Payment returned</p><h1>Confirming your order…</h1><p>Stripe is securely confirming payment with Model Car Center. This usually takes a few seconds.</p></div>;
  if (error || !order) return <div className="empty-state"><p className="eyebrow">Confirmation pending</p><h1>We&apos;re still processing your order.</h1><p>Your checkout returned successfully, but the verified payment webhook has not created the order record yet. Do not place the order again. Check your email or contact support with your Checkout Session ID.</p><code>{sessionId}</code><Link className="button outline" href="/contact">Contact support</Link></div>;
  return <div className="order-confirmation"><p className="eyebrow">Payment confirmed</p><h1>Thanks for your order.</h1><p>Confirmation was sent to {order.buyerEmail}. {order.sellerName} will fulfill the shipment, and we&apos;ll email tracking after it is added.</p><div className="confirmation-card"><h2>{order.orderNumber}</h2>{order.items.map((item) => <div key={item.title}><span>{item.title} × {item.quantity}</span><b>{money(item.unitPriceCents * item.quantity, order.currency)}</b></div>)}<div className="total"><span>Total</span><b>{money(order.totalCents, order.currency)}</b></div></div><Link className="button dark" href="/marketplace">Continue browsing</Link></div>;
}
