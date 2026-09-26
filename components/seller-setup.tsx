"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { StoreData } from "./store-dashboard";
import { formatMoney, formatUtcDateTime } from "@/lib/format";
import { trackEvent, sellerSetupElapsed } from "@/lib/analytics-client";
import { needsShipment, prioritizeOrders, sellerOrderPayout, sellerPaymentStatus, sellerTimestamp } from "@/lib/seller-dashboard";
import { matchesInventoryView } from "@/lib/seller-hub";

export function SellerSetup({ data }: { data: StoreData }) {
  const { setup } = data;
  useEffect(() => {
    sellerSetupElapsed(data.store.id, true);
    trackEvent("seller_setup_started", {}, { onceKey: `setup-start-${data.store.id}` });
    for (const step of setup.steps) if (step.complete) trackEvent("seller_setup_step_completed", { step: step.id }, { onceKey: `setup-step-${data.store.id}-${step.id}` });
  }, [setup, data.store.id]);
  const remaining = setup.steps.filter(step => !step.complete);
  return <section className="store-panel seller-setup-compact"><h3>Store setup · {setup.completed}/4 complete</h3>
    {!setup.termsAccepted && <p><Link href="/store?view=settings&filter=terms#seller-terms">Accept current Seller Terms</Link> before publishing or accepting new payments.</p>}
    {remaining.length > 0 && <ul>{remaining.map(step => <li key={step.id}><Link href={step.href}>{step.title} →</Link></li>)}</ul>}
    <details><summary>{setup.completed === 4 ? "View completed setup" : "Setup details"}</summary><ol className="seller-setup-list">{setup.steps.map(step => <li key={step.id}><span>{step.complete ? "Complete" : "To do"}</span><Link href={step.href}>{step.title}</Link><p>{step.detail}</p></li>)}</ol><p>Store approval, payment readiness, and listing publication are separate. {setup.listingCounts.live} live · {setup.listingCounts.draft} drafts · {setup.listingCounts.pending} unpublished.</p></details>
  </section>;
}

export function SellerNextActions({ data }: { data: StoreData }) {
  const orders = prioritizeOrders(data.orders.filter(needsShipment));
  const attention = data.inventory.filter(product => matchesInventoryView(product, "attention", data.hub.slowIds));
  const failed = data.orders.filter(order => order.sellerTransferStatus === "failed");
  return <section className="store-panel seller-priority-orders"><div className="panel-heading"><h3>Orders to ship <span>{orders.length}</span></h3><Link href="/store?view=orders">View queue →</Link></div>
    {orders.length ? <div className="seller-order-previews">{orders.slice(0, 3).map(order => {
      const overdue = order.shipByAt && sellerTimestamp(order.shipByAt) < sellerTimestamp(data.asOf);
      return <Link href={`/store?view=orders&filter=open#order-${order.id}`} key={order.id} className="seller-order-preview">
        <SellerThumbnail src={order.items[0]?.imageUrlSnapshot} title={order.items[0]?.productTitleSnapshot ?? "Order item"}/>
        <div><strong>{order.items[0]?.productTitleSnapshot ?? "Item details need review"}</strong><span>{order.orderNumber} · {order.items.length ? `${order.items.reduce((sum, item) => sum + item.quantity, 0)} items` : "Packing details missing"}</span><span className={overdue ? "seller-overdue" : ""}>{overdue ? "Overdue · " : ""}{order.shipByAt ? `Ship by ${formatUtcDateTime(order.shipByAt)}` : "Dispatch deadline not recorded"}</span></div><b>Open order →</b>
      </Link>;
    })}</div> : <p>No paid orders waiting to ship.</p>}
    <div className="seller-task-links"><Link href="/store?view=orders&filter=returns">Returns · {data.demand.returnOrderIds.length}</Link><Link href="/store?view=inventory&filter=attention">Listings needing attention · {attention.length}</Link>{failed.length > 0 && <Link href="/store?view=payments">Release issues · {failed.length}</Link>}</div>
  </section>;
}

export function SellerThumbnail({ src, title }: { src?: string | null; title: string }) {
  return <div className="seller-thumbnail">{src ? <Image unoptimized src={src} alt={title} width={88} height={66}/> : <span>No photo</span>}</div>;
}

export function SellerPayments({ data, action }: { data: StoreData; action: (payload: Record<string, unknown>, options?: { reload?: boolean; message?: string }) => Promise<Record<string, unknown>> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const state = sellerPaymentStatus(data.store, data.setup.termsAccepted);
  const legacy = data.orders.filter(order => sellerOrderPayout(order).legacy).length;
  async function connect(refresh: boolean) {
    setBusy(true); setError("");
    try { const result = await action({ action: refresh ? "refresh_payments" : "connect_payments" }, { reload: refresh, message: refresh ? "Payment connection checked." : "Opening secure payment setup." }); if (typeof result.onboardingUrl === "string") window.location.assign(result.onboardingUrl); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open payment setup. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="store-stack"><header className="store-page-heading"><div><h2>Payments</h2><p>Connection, held proceeds, and releases to Stripe.</p></div></header>
    <section className="store-panel seller-payment-state"><h3>{state.title}</h3><p>{state.detail}</p><div className="seller-inline-actions">{state.href ? <Link className="button dark small" href={state.href}>{state.action}</Link> : <button className={`button ${state.connected ? "outline" : "dark"} small`} disabled={busy} onClick={() => void connect(state.action === "Refresh status")}>{busy ? "Please wait…" : state.action}</button>}{state.action !== "Refresh status" && data.setup.termsAccepted && !["suspended", "applicant"].includes(data.store.status) && <button className="text-button" disabled={busy || !data.setup.termsAccepted || ["suspended", "applicant"].includes(data.store.status)} onClick={() => void connect(true)}>Refresh status</button>}</div>{error && <p role="alert" className="form-error">{error}</p>}</section>
    <section className="store-panel"><div className="hub-payouts"><div><span>Released to Stripe</span><b className="seller-money">{formatMoney(data.hub.releasedCents)}</b><small>Recorded MCC releases, less reversals</small></div><div><span>Held proceeds</span><b className="seller-money">{formatMoney(data.hub.heldCents)}</b><small>Known proceeds, adjusted for refunds</small></div></div>
      {data.hub.pendingFeeOrders > 0 && <p>{data.hub.pendingFeeOrders} additional held orders await final processing fees; their amounts are not included yet.</p>}
      {legacy > 0 && <p className="seller-data-note">{legacy} legacy direct-payout {legacy === 1 ? "order is" : "orders are"} excluded from both totals. These used an older payment flow. Check Stripe for legacy payout amounts and bank dates.</p>}
      <p>Release to Stripe is not a bank deposit. Bank arrival follows your Stripe payout schedule.</p>
    </section>
    <section className="store-panel seller-payment-orders"><h3>Order payments</h3>{data.orders.length ? data.orders.map(order => {
      const payout = sellerOrderPayout(order), released = ["transferred", "reversed"].includes(order.sellerTransferStatus) && !payout.legacy;
      return <article id={`payment-${order.id}`} key={order.id}><div><Link href={`/store?view=orders&filter=all#order-${order.id}`}><strong>{order.orderNumber}</strong></Link><b className="seller-money">{payout.amount === null ? payout.legacy ? "Release untracked" : "Amount pending" : formatMoney(payout.amount, order.currency)}</b></div><p><strong>{payout.label}</strong>{order.isTestOrder ? " · Test order" : ""}</p><p>{payout.legacy ? `Legacy flow; excluded from MCC release totals.${order.sellerProceedsCents !== null ? ` Recorded proceeds: ${formatMoney(order.sellerProceedsCents, order.currency)} before refunds and fulfillment.` : " Check Stripe for payout history."}` : released ? order.sellerTransferredAt ? `Released ${formatUtcDateTime(order.sellerTransferredAt)}. Bank arrival is managed by Stripe.` : "Release recorded; release date not available. Check Stripe for bank arrival." : !["paid", "partially_refunded"].includes(order.paymentStatus) ? "No upcoming release for this payment status." : order.payoutEligibleAt ? `Eligible no earlier than ${formatUtcDateTime(order.payoutEligibleAt)}, subject to holds and final fees.` : "Estimated release date available after confirmed delivery."}</p>{order.sellerTransferStatus === "failed" && <Link href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}>Get help with this release →</Link>}<Link href={`/store?view=orders&filter=all#order-${order.id}`}>View order and fees →</Link></article>;
    }) : <p>Payments will appear after your first order.</p>}</section>
    <details className="store-panel"><summary>Release timing and processing fees</summary><ol><li>Buyer pays: proceeds are held while you prepare and ship.</li><li>Carrier confirms delivery: the order’s protection window runs.</li><li>Eligible proceeds release when no case is open, fees are final, and the payment account is ready.</li><li>Bank arrival follows Stripe’s payout schedule.</li></ol><p>New orders deduct your marketplace commission and actual payment processing. Older orders may record processing paid by MCC; that order’s recorded fee arrangement still applies. Open cases, refunds, and missing tracking can delay or reduce releases.</p><Link href="/seller-terms#fees">Fee and payout terms →</Link></details>
  </div>;
}

export function SellerHelp() {
  const guides = [
    ["Fulfill an order", "Check items and the dispatch deadline, then create a label or add tracking from your own carrier.", "/store?view=orders", "Open Orders"],
    ["Check a payment", "See the required account action, held proceeds, and each order’s release date. Stripe manages bank arrival.", "/store?view=payments", "Open Payments"],
    ["Add a model", "Reuse a shared catalog model, then add price, condition, and photos. New listings start as drafts.", "/store?view=inventory&edit=new", "Create listing"],
    ["Update stock or import CSV", "Keep seller SKUs stable. Reduce stock after selling elsewhere; reservations cannot be removed by lowering stock.", "/store?view=inventory&filter=bulk", "Update stock & price"],
    ["Upload a spreadsheet", "Preview a UTF-8 CSV and resolve row errors before saving. New SKUs create drafts.", "/store?view=inventory&filter=import#inventory-upload", "Import CSV"],
    ["Shipping and store details", "Set your private ship-from address, parcel size, dispatch time, and public store information.", "/store?view=settings&filter=shipping", "Open shipping settings"],
  ];
  return <div className="store-stack"><header className="store-page-heading"><div><h2>Help</h2><p>Choose a task and go straight to the right tool.</p></div></header><div className="seller-help-grid">{guides.map(([title, detail, href, label]) => <section className="store-panel" key={title}><h3>{title}</h3><p>{detail}</p><Link className="button outline small" href={href}>{label} →</Link></section>)}</div><p>Need a hand? <Link href="/contact#seller-setup-help">Contact seller support</Link> with your store name and the step where you are stuck.</p></div>;
}
