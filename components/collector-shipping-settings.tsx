"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import "./collector-shipping-settings.css";

export function CollectorShippingSettings({ handlingTimeBusinessDays }: { handlingTimeBusinessDays: number }) {
  const router = useRouter();
  const [days, setDays] = useState(String(handlingTimeBusinessDays));
  const [savedDays, setSavedDays] = useState(String(handlingTimeBusinessDays));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || days === savedDays) return;
    saving.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/shipping", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlingTimeBusinessDays: Number(days) }),
      });
      const result = await response.json() as { error?: string; handlingTimeBusinessDays: number };
      if (!response.ok) throw new Error(result.error || "Your shipping settings could not be saved. Please try again.");
      setSavedDays(String(result.handlingTimeBusinessDays));
      setDays(String(result.handlingTimeBusinessDays));
      setMessage(`Saved. Future purchases will use ${result.handlingTimeBusinessDays} business day${result.handlingTimeBusinessDays === 1 ? "" : "s"} of handling time.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your shipping settings could not be saved. Please try again.");
    } finally {
      saving.current = false; setBusy(false);
    }
  }

  return <section className="collector-shipping-settings" id="collector-shipping-settings" aria-labelledby="collector-shipping-title">
    <h3 id="collector-shipping-title">Shipping settings</h3>
    <p>Choose how soon you can hand a paid order to the carrier. Your handling time appears on listings and determines each new order’s ship-by date.</p>
    <form onSubmit={save} aria-busy={busy}>
      <label htmlFor="collector-handling-days">Handling time (business days)</label>
      <div className="collector-handling-controls">
        <select id="collector-handling-days" name="handlingTimeBusinessDays" value={days} disabled={busy} aria-describedby="collector-handling-help" onChange={event => { setDays(event.target.value); setError(""); setMessage(""); }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{day} business day{day === 1 ? "" : "s"}</option>)}
        </select>
        <button className="button dark small" disabled={busy || days === savedDays}>{busy ? "Saving…" : "Save shipping settings"}</button>
      </div>
      <p id="collector-handling-help">Count from payment, excluding weekends and U.S. federal holidays. Carrier delivery time is additional.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="collector-handling-saved" role="status">{message}</p>}
    </form>
    <p>Applies to future purchases across all your listings. Existing checkouts and paid orders keep their agreed shipping terms. For an existing order, <Link href="/shipping/requests">request a shipping delay</Link>.</p>
  </section>;
}
