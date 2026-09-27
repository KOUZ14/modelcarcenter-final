"use client";

import { FormEvent, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatCondition } from "@/lib/format";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { useMarketplace } from "./marketplace-provider";
import Link from "next/link";
import { AdultConsent } from "./adult-consent";

type State = { kind: "idle" | "loading" | "success" | "error" | "matches"; message?: string; referenceCode?: string; products?: ProductSummary[] };
type Draft = Record<string, string>;

export function ModelHuntForm({ compact = false, initial = {}, emailAlertsEnabled = false }: { compact?: boolean; initial?: Draft; emailAlertsEnabled?: boolean }) {
  const { collector } = useMarketplace();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [draft, setDraft] = useState<Draft>(initial);

  async function send(payload: Draft, continueHunt = false) {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/model-hunts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, continueHunt }) });
      const data = await response.json() as { error?: string; message?: string; referenceCode?: string; products?: ProductSummary[] };
      if (response.status === 409 && data.products?.length) { setState({ kind: "matches", message: data.error, products: data.products }); return; }
      if (!response.ok) throw new Error(data.error || "Your Model Hunt could not be started.");
      setState({ kind: "success", message: data.message, referenceCode: data.referenceCode });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Draft;
    setDraft(payload);
    await send(payload);
  }

  const summary = [draft.vehicleMake, draft.vehicleModel, draft.preferredScale || "Any scale", draft.modelManufacturer, draft.conditionPreference ? formatCondition(draft.conditionPreference) : "Any condition"].filter(Boolean).join(" · ");
  if (state.kind === "success") return <div className="success-message" role="status"><Icon name="check"/><h3>Your Model Hunt is saved.</h3><p className="hunt-submission-summary">{summary}</p><p>{state.message}</p><p className="reference-code">Reference: {state.referenceCode}</p>{collector ? <Link className="text-link" href="/account?view=hunts">Track this Hunt in your account</Link> : <Link className="text-link" href={`/sign-in?returnTo=${encodeURIComponent("/account?view=hunts")}`}>Sign in with {draft.collectorEmail} to track this Hunt</Link>}<button type="button" onClick={() => { setDraft({}); setState({ kind: "idle" }); }}>Start another Hunt</button></div>;
  if (state.kind === "matches") return <div className="hunt-matches" role="status"><p className="eyebrow">Possible matches</p><h3>Do any of these fit your request?</h3><p>Check the release, condition and seller details. You can still save your Hunt if these are not right.</p><div className="product-grid mini-grid">{state.products?.map(product => <ProductCard key={product.id} product={product}/>)}</div><button className="button dark" type="button" onClick={() => void send(draft, true)}>Save my Hunt anyway</button><button className="button outline" type="button" onClick={() => setState({ kind: "idle" })}>Edit my request</button></div>;
  const scales = [...new Set(["1:12", "1:18", "1:24", "1:32", "1:43", "1:64", "1:87", "Other", draft.preferredScale].filter(Boolean))];
  const conditions = [...new Set(["mint", "near_mint", "excellent", "good", "fair", "poor", "new", "preowned", draft.conditionPreference].filter(Boolean))];
  return <form className={`wanted-form ${compact ? "compact-form" : ""}`} onSubmit={submit} onChange={event => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) setDraft(current => ({ ...current, [field.name]: field instanceof HTMLInputElement && field.type === "checkbox" && !field.checked ? "" : field.value }));
  }}>
    <p>{emailAlertsEnabled ? "Tell us what you want, and we'll contact you if we find a matching listing." : "Tell us what you want and save a request for the team to review. Email match alerts are not currently available."}</p>
    {emailAlertsEnabled && <p className="field-note">The team reviews requests and sends matching listings by email. A match or response time isn&apos;t guaranteed.</p>}
    <div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label></div>
    <label>Model or search description<input name="vehicleModel" required maxLength={200} placeholder="e.g. Porsche 911 Carrera RS" defaultValue={draft.vehicleModel}/></label>
    <div className="form-row"><label>Preferred scale (optional)<select name="preferredScale" defaultValue={draft.preferredScale || ""}><option value="">Any scale</option>{scales.map(scale => <option key={scale}>{scale}</option>)}</select></label><label>Email address<input key={collector?.email ?? "guest"} name="collectorEmail" required type="email" autoComplete="email" placeholder="you@example.com" defaultValue={collector?.email ?? draft.collectorEmail ?? ""} readOnly={Boolean(collector)}/>{collector && <span className="field-note">Linked to your verified account.</span>}</label></div>
    <details open={Boolean(draft.modelManufacturer || draft.conditionPreference || draft.notes || draft.vehicleMake)}><summary>Optional model details and preferences</summary>
      <div className="form-row"><label>Car make (optional)<input name="vehicleMake" placeholder="e.g. Porsche" defaultValue={draft.vehicleMake}/></label><label>Model manufacturer (optional)<input name="modelManufacturer" placeholder="e.g. AUTOart" defaultValue={draft.modelManufacturer}/></label></div>
      <div className="form-row"><label>Color (optional)<input name="color" defaultValue={draft.color}/></label><label>Condition (optional)<select name="conditionPreference" defaultValue={draft.conditionPreference || ""}><option value="">Any condition</option>{conditions.map(condition => <option key={condition} value={condition}>{formatCondition(condition)}</option>)}</select></label></div>
      <label>Maximum budget (optional, USD)<input name="maxBudget" inputMode="decimal" placeholder="e.g. 300" defaultValue={draft.maxBudget}/></label>
      <label>Notes (optional)<textarea name="notes" rows={3} defaultValue={draft.notes} placeholder="Edition, livery, racing number, or any detail that matters"/></label>
    </details>
    <AdultConsent/>
    <p className="collection-notice">We use these details and your email to review this request. See our <Link href="/privacy">Privacy Policy</Link>.</p>
    {state.kind === "error" && <p className="form-error" role="alert">{state.message}</p>}
    <button className="button light" type="submit" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Checking inventory…" : <>Start Model Hunt <Icon name="arrow"/></>}</button>
  </form>;
}
