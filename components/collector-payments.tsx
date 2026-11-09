"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { collectorPaymentState, collectorPaymentSummary, type CollectorPayment } from "@/lib/collector-payments";
import { formatMoney, formatUtcDate } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { SellerOrderAmounts } from "./seller-order-amounts";
import { SellerPayoutNotice } from "./seller-payout-notice";

type PaymentSeller = (Record<string, unknown> & { id: string }) | null;

export function CollectorPayments({ seller, orders, setup }: {
  seller: PaymentSeller; orders: CollectorPayment[]; setup?: string;
}) {
  const router = useRouter();
  const currencies = [...new Set(orders.filter(order => !order.isTestOrder).map(order => order.currency.toLowerCase()))].sort();
  const [selectedCurrency, setCurrency] = useState(currencies[0] ?? "usd");
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? "usd";
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [refreshed, setRefreshed] = useState<{ status: string; chargesEnabled: boolean; payoutsEnabled: boolean } | null>(null);
  const connected = Boolean(seller?.stripeAccountId);
  const ready = refreshed ? refreshed.chargesEnabled && refreshed.payoutsEnabled : seller?.stripeChargesEnabled && seller?.stripePayoutsEnabled;
  const suspended = (refreshed?.status ?? seller?.status) === "suspended";

  async function paymentAction(action: "dashboard" | "onboarding" | "refresh") {
    if (busy) return;
    setBusy(action); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "onboarding" ? { sellerTermsVersion: POLICY_VERSION } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your payment account could not be opened.");
      if (action === "refresh") {
        setRefreshed(body); setMessage("Payment status refreshed."); router.refresh();
      } else {
        const url = body.url ?? body.onboardingUrl;
        if (!url) throw new Error("Stripe did not return a link. Please try again.");
        window.location.assign(url);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your payment account could not be opened. Please try again.");
    } finally { setBusy(""); }
  }

  if (seller?.sellerType === "professional") return <div className="garage-section">
    <h2>Payments</h2><p>Manage your store’s payments in Seller Hub.</p>
    <Link className="button dark small" href="/store?view=payments">Open Seller Hub payments</Link>
  </div>;
  if (!seller) return <div className="garage-section">
    <h2>Payments</h2><p>Start a collector listing to set up your payout account. Your sale proceeds and releases will appear here.</p>
    <Link className="button dark small" href="/sell/model">Sell a Model</Link>
  </div>;

  const summary = collectorPaymentSummary(orders, currency);
  const history = orders.filter(order => !order.isTestOrder && order.currency.toLowerCase() === currency);
  return <div className="garage-section account-payments">
    <header className="account-activity-heading"><div><p className="eyebrow">Selling</p><h2>Payments</h2></div>
      {currencies.length > 1 && <label className="account-payment-currency">Currency<select value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>}
    </header>
    <section className="account-payment-panel" aria-labelledby="payment-account-title">
      <h3 id="payment-account-title">{suspended ? "New sales suspended" : ready ? "Payout account connected" : connected ? "Finish your payout setup" : "Connect your payout account"}</h3>
      <p>{suspended ? "Contact support about your seller status. You can still access your existing Stripe account." : ready ? "View bank payouts, arrival estimates and account details in Stripe." : "Stripe securely collects the identity and bank details needed to receive your proceeds."}</p>
      {setup === "unavailable" && !refreshed && <p role="status">We could not check your connection after Stripe setup. Refresh your payment status to try again.</p>}
      {setup === "refresh" && !ready && <p>The setup link expired or needs to be reopened. Continue setup below.</p>}
      {setup === "returned" && <p>{ready ? "Your Stripe connection has been checked." : "Your setup has been checked. Stripe still needs more information."}</p>}
      <div className="account-payment-actions">
        {connected && <button className="button dark small" disabled={Boolean(busy)} onClick={() => void paymentAction("dashboard")}>{busy === "dashboard" ? "Opening Stripe…" : "Manage payouts & bank details"}</button>}
        {connected && <button className="button outline small" disabled={Boolean(busy)} onClick={() => void paymentAction("refresh")}>{busy === "refresh" ? "Refreshing…" : "Refresh payment status"}</button>}
        {suspended && <Link className="account-inline-link" href="/contact">Contact support</Link>}
      </div>
      {!ready && !suspended && <div className="account-payment-setup">
        <label className="consent-check"><input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} /><span>I agree to the current <Link href="/seller-terms">Seller Terms</Link>.</span></label>
        <button className="button outline small" disabled={Boolean(busy) || !acceptedTerms} onClick={() => void paymentAction("onboarding")}>{busy === "onboarding" ? "Opening setup…" : connected ? "Continue payout setup" : "Connect payout account"}</button>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
    <div className="account-payment-totals" aria-label={`Payment totals in ${currency.toUpperCase()}`}>
      <section><h3>Held proceeds</h3><strong>{formatMoney(summary.heldCents, currency)}</strong><p>Known proceeds awaiting release, including releases in progress. Refunds and MCC label costs are deducted.</p></section>
      <section><h3>Released to Stripe</h3><strong>{formatMoney(summary.releasedCents, currency)}</strong><p>Lifetime recorded releases, less reversals. This is not your current Stripe balance or money deposited into your bank.</p></section>
    </div>
    {summary.pendingCount > 0 && <p role="status">{summary.pendingCount} {summary.pendingCount === 1 ? "order is" : "orders are"} awaiting final proceeds and excluded from held totals.</p>}
    {summary.legacyCount > 0 && <p>{summary.legacyCount} legacy direct-payout {summary.legacyCount === 1 ? "order is" : "orders are"} excluded from these totals. Check Stripe for that payout history.</p>}
    <section className="account-payment-panel"><SellerPayoutNotice /></section>
    <section aria-labelledby="payment-history-title"><h3 id="payment-history-title">Payment history</h3>
      {!history.length ? <div className="account-payment-panel"><p>No payments yet{currencies.length > 1 ? ` in ${currency.toUpperCase()}` : ""}. Paid sales and their release history will appear here.</p><Link className="account-inline-link" href="/account?view=listings#account-content">View my listings</Link></div>
        : <div className="account-payment-history">{history.map(order => {
          const state = collectorPaymentState(order);
          return <article className="account-payment-panel" key={order.id}>
            <div className="account-order-meta"><b>{order.orderNumber}</b><span>{formatUtcDate(order.createdAt)}</span></div>
            <div className="account-payment-result"><h4>{state.label}</h4><strong>{state.amount == null ? state.kind === "legacy" ? "See Stripe" : "Pending" : formatMoney(state.amount, currency)}</strong></div>
            {state.kind === "released" && order.sellerTransferredAt && <p>Released {formatUtcDate(order.sellerTransferredAt)}. Bank arrival is shown in Stripe.</p>}
            {state.kind === "held" && <p>{order.payoutEligibleAt ? `Earliest release eligibility: ${formatUtcDate(order.payoutEligibleAt)}. Holds may delay release.` : "Release eligibility is set after confirmed delivery."}</p>}
            {order.sellerTransferReversedCents > 0 && <p>Reversed from Stripe: {formatMoney(order.sellerTransferReversedCents, currency)}.</p>}
            <details><summary>Payment &amp; fee details</summary><SellerOrderAmounts order={order} /></details>
            <div className="account-payment-actions">{order.paymentStatus !== "refunded" && <Link className="account-inline-link" href={`/account?view=sales#sale-${order.id}`}>View sale</Link>}<Link className="account-inline-link" href={`/resolution?order=${encodeURIComponent(order.id)}`}>Order support</Link></div>
          </article>;
        })}</div>}
    </section>
  </div>;
}
