"use client";

import Link from "next/link";
import { useState } from "react";

export function CheckoutReturn({ reservationId }: { reservationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function close() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/checkout/return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout could not be closed. Please try again.");
      window.location.assign(data.completedSessionId ? `/checkout/success?session_id=${encodeURIComponent(data.completedSessionId)}` : "/cart?checkout=cancelled");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); setBusy(false); }
  }
  return <div className="empty-state"><p className="eyebrow">Back from checkout</p><h1>Return to your cart?</h1><p>Close this checkout to release its reserved items and make changes. If payment already completed, we’ll show your receipt.</p>{error && <p role="alert">{error}</p>}<button className="button dark" type="button" disabled={busy} onClick={() => void close()}>{busy ? "Checking payment…" : "Close checkout and return to cart"}</button><Link className="button outline" href="/cart">Keep checkout open</Link></div>;
}
