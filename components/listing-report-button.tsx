"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ListingReportButton({ productId, preview = false }: { productId: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const panelId = useId();
  const router = useRouter();
  function close() { setOpen(false); setError(""); trigger.current?.focus(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const details = String(form.get("details") || "").trim();
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/listings/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, reason: `${form.get("reason")}${details ? `: ${details}` : ""}` }) });
      if (response.status === 401) { router.push(`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search + "#report-listing")}`); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your report could not be sent. Please try again.");
      setSent(true); close();
    } catch (err) { setError((err as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="listing-report" id="report-listing">
    <button ref={trigger} className="text-link" type="button" disabled={preview || sent} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>{sent ? "Listing reported" : "Report listing"}</button>
    {sent && <p role="status">Thank you. Your report has been sent to the moderation team.</p>}
    {open && <form id={panelId} className="listing-report-form" onSubmit={submit} aria-busy={busy}>
      <p>Tell us what looks wrong. A report does not automatically remove the listing.</p>
      <label>Reason<select name="reason" required disabled={busy} autoFocus defaultValue=""><option value="" disabled>Select a reason</option>{["Incorrect model or description", "Misleading photos or condition", "Suspected counterfeit", "Prohibited item or scam", "Other issue"].map(reason => <option key={reason}>{reason}</option>)}</select></label>
      <label>Details<textarea name="details" required maxLength={850} rows={3} placeholder="Describe the problem so we can investigate." disabled={busy} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="row-actions"><button className="button dark small" type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</button><button className="button outline small" type="button" disabled={busy} onClick={close}>Cancel</button></div>
    </form>}
  </div>;
}
