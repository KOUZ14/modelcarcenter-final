"use client";

import { FormEvent, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";

type State = { kind: "idle" | "loading" | "success" | "error" | "matches"; message?: string; referenceCode?: string; products?: ProductSummary[] };

export function ModelHuntForm({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/model-hunts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; message?: string; referenceCode?: string; products?: ProductSummary[] };
      if (response.status === 409 && data.products?.length) { setState({ kind: "matches", message: data.error, products: data.products }); return; }
      if (!response.ok) throw new Error(data.error || "Your Model Hunt could not be started.");
      setState({ kind: "success", message: data.message, referenceCode: data.referenceCode });
      event.currentTarget.reset();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Please try again." });
    }
  }
  if (state.kind === "success") return <div className="success-message" role="status"><Icon name="check"/><h3>Your Model Hunt is active.</h3><p>{state.message}</p><p className="reference-code">Reference: {state.referenceCode}</p><button type="button" onClick={() => setState({ kind: "idle" })}>Start another hunt</button></div>;
  if (state.kind === "matches") return <div className="hunt-matches" role="status"><p className="eyebrow">Before we start a hunt</p><h3>We may already have what you&apos;re looking for</h3><div className="product-grid mini-grid">{state.products?.map((product) => <ProductCard key={product.id} product={product}/>)}</div><button className="button outline" type="button" onClick={() => setState({ kind: "idle" })}>Refine request</button></div>;
  return <form className={`wanted-form ${compact ? "compact-form" : ""}`} onSubmit={submit} noValidate>
    <div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label></div>
    <div className="form-row"><label>Car make<input name="vehicleMake" required placeholder="e.g. Porsche"/></label><label>Model<input name="vehicleModel" required placeholder="e.g. 911 Carrera RS"/></label></div>
    <div className="form-row"><label>Preferred scale<select name="preferredScale" required defaultValue=""><option value="" disabled>Select scale</option>{["1:18", "1:24", "1:43", "1:64", "1:87", "Other"].map((scale) => <option key={scale}>{scale}</option>)}</select></label><label>Model manufacturer<input name="modelManufacturer" placeholder="Optional, e.g. AUTOart"/></label></div>
    <div className="form-row"><label>Color<input name="color" placeholder="Optional"/></label><label>Condition<select name="conditionPreference" defaultValue=""><option value="">Any condition</option><option value="new">New</option><option value="preowned">Pre-owned</option></select></label></div>
    <div className="form-row"><label>Maximum budget<input name="maxBudget" inputMode="decimal" placeholder="Optional, e.g. 300"/></label><label>Email address<input name="collectorEmail" required type="email" autoComplete="email" placeholder="you@example.com"/></label></div>
    <label>Notes<textarea name="notes" rows={3} placeholder="Edition, livery, racing number, or any detail that matters"/></label>
    {state.kind === "error" && <p className="form-error" role="alert">{state.message}</p>}
    <button className="button light" type="submit" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Checking inventory…" : <>Start Model Hunt <Icon name="arrow"/></>}</button>
  </form>;
}
