"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { POLICY_VERSION } from "@/lib/legal";

export function SellerApplicationForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("loading"); setError("");
    try {
      const response = await fetch("/api/seller-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Application could not be submitted.");
      event.currentTarget.reset(); setState("success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); setState("error"); }
  }
  if (state === "success") return <div className="success-message application-success" role="status"><Icon name="check"/><h2>Application received.</h2><p>We&apos;ll review your store and contact you by email. No payout or banking information is collected here—approved sellers complete that securely with Stripe.</p><button type="button" onClick={() => setState("idle")}>Submit another application</button></div>;
  return <form className="application-form" onSubmit={submit}><div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1}/></label></div><div className="form-row"><label>Store or business name<input name="storeName" required autoComplete="organization"/></label><label>Contact name<input name="contactName" required autoComplete="name"/></label></div><div className="form-row"><label>Email<input name="email" required type="email" autoComplete="email"/></label><label>Website<input name="website" type="url" placeholder="https://"/></label></div><label>Where do you currently sell?<input name="currentSellingChannels" required placeholder="Your store, Shopify, eBay, shows, or other channels"/></label><label>Approximate model-car inventory<input name="approximateInventorySize" required type="number" min="1" step="1"/></label><label>Anything else we should know?<textarea name="message" rows={5} placeholder="Optional"/></label><label className="consent-check"><input name="sellerTermsVersion" type="checkbox" value={POLICY_VERSION} required/><span>I am authorized to apply for this seller and agree to the <Link href="/seller-terms">Seller Terms</Link>. I acknowledge the <Link href="/privacy">Privacy Policy</Link>.</span></label>{state === "error" && <p className="form-error" role="alert">{error}</p>}<button className="button dark" type="submit" disabled={state === "loading"}>{state === "loading" ? "Submitting…" : <>Apply to sell <Icon name="arrow"/></>}</button></form>;
}
