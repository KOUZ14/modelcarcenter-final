"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AdultConsent } from "./adult-consent";
import { SellerFeeDisclosure } from "./seller-fee-disclosure";
import { Icon } from "./icons";
import { POLICY_VERSION } from "@/lib/legal";

export function SellerApplicationForm({ marketplaceFeeBps }: { marketplaceFeeBps: number }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("loading"); setError("");
    const formElement = event.currentTarget;
    try {
      const response = await fetch("/api/seller-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Application could not be submitted.");
      formElement.reset(); setState("success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); setState("error"); }
  }
  if (state === "success") return <div className="success-message application-success" role="status"><Icon name="check"/><h2>Application received.</h2><p>We&apos;ll review your store and contact you by email. No payout or banking information is collected here. Approved sellers will be required to complete that securely with Stripe.</p><button type="button" onClick={() => setState("idle")}>Submit another application</button></div>;
  return <form className="application-form sell-application-form" onSubmit={submit} aria-label="Store application">
    <div className="sell-application-expectations">
      <h3>What happens after you apply</h3>
      <p>We review your store and email the next step. Approval is required before listings go live; review times vary.</p>
    </div>
    <p className="sell-form-help">All fields are required unless marked optional.</p>
    <div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1} /></label></div>
    <div className="form-row">
      <label>Store or business name<input name="storeName" required autoComplete="organization" /></label>
      <label>Contact name<input name="contactName" required autoComplete="name" /></label>
    </div>
    <div className="form-row">
      <label>Email<input name="email" required type="email" autoComplete="email" /></label>
      <div className="sell-form-field">
        <label htmlFor="application-website">Website (optional)</label>
        <input id="application-website" name="website" type="url" autoComplete="url" aria-describedby="application-website-help" />
        <p id="application-website-help" className="sell-form-help">Use a full address, such as https://yourstore.com.</p>
      </div>
    </div>
    <div className="sell-form-field">
      <label htmlFor="application-channels">Where do you currently sell?</label>
      <input id="application-channels" name="currentSellingChannels" required aria-describedby="application-channels-help" />
      <p id="application-channels-help" className="sell-form-help">For example: your shop, Shopify, eBay or model shows.</p>
    </div>
    <div className="sell-form-field">
      <label htmlFor="application-inventory">Approximate model-car inventory</label>
      <input id="application-inventory" name="approximateInventorySize" required type="number" min="1" step="1" inputMode="numeric" aria-describedby="application-inventory-help" />
      <p id="application-inventory-help" className="sell-form-help">An estimate of how many models you have available to sell.</p>
    </div>
    <label>Anything else we should know? (optional)<textarea name="message" rows={3} /></label>
    <details className="sell-application-fees">
      <summary>{marketplaceFeeBps / 100}% standard marketplace fee + actual processing<span>How fees and deductions work</span></summary>
      <SellerFeeDisclosure marketplaceFeeBps={marketplaceFeeBps} />
    </details>
    <AdultConsent />
    <label className="consent-check"><input name="sellerTermsVersion" type="checkbox" value={POLICY_VERSION} required /><span>I am authorized to apply for this seller and agree to the <Link href="/seller-terms">Seller Terms</Link>, including deductions for marketplace commission and actual payment processing. I acknowledge the <Link href="/privacy">Privacy Policy</Link>.</span></label>
    {state === "error" && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark" type="submit" disabled={state === "loading"}>{state === "loading" ? "Submitting…" : <>Submit store application <Icon name="arrow" /></>}</button>
  </form>;
}
