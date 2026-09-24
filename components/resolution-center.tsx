"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  protectionReasonLabel,
  type RequestedResolution,
} from "@/lib/protection";
import type { ResolutionCenterData } from "@/lib/resolution";
import { OrderProtectionSummary } from "./order-protection-summary";

type ResolutionCase = ResolutionCenterData["cases"][number];
type BuyerOrder = ResolutionCenterData["buyerOrders"][number];

function isActiveCase(item: ResolutionCase) {
  return !["resolved", "closed", "denied"].includes(item.status);
}

function focusPanel(panel: HTMLElement | null) {
  panel?.focus({ preventScroll: true });
  panel?.scrollIntoView({ block: "start" });
}

export function ResolutionCenter({
  data,
  initialOrderId,
  initialCaseId,
}: {
  data: ResolutionCenterData;
  initialOrderId?: string;
  initialCaseId?: string;
}) {
  const initialCase =
    data.cases.find((item) => item.id === initialCaseId) ??
    data.cases.find((item) => item.order.id === initialOrderId) ??
    data.cases.find(isActiveCase) ?? data.cases[0] ??
    null;
  const shouldReport = Boolean(
    initialOrderId && !data.cases.some((item) => item.order.id === initialOrderId),
  );
  const [mode, setMode] = useState<"cases" | "report">(
    shouldReport ? "report" : "cases",
  );
  const [selectedId, setSelectedId] = useState(initialCase?.id ?? "");
  const [role, setRole] = useState<"all" | "buyer" | "seller">("all");
  const workspaceRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"workspace" | "detail" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const visibleCases = data.cases
    .filter((item) => role === "all" || item.viewerRole === role)
    .sort((a, b) => Number(isActiveCase(b)) - Number(isActiveCase(a)));
  const selected =
    visibleCases.find((item) => item.id === selectedId) ?? visibleCases[0] ?? null;
  const showRoleFilters = data.buyerCaseCount > 0 && data.sellerCaseCount > 0;
  const eligibleOrders = data.buyerOrders.filter(
    (order) => order.eligible && !order.caseId,
  );

  useEffect(() => {
    if (!pendingFocus.current) return;
    focusPanel(pendingFocus.current === "workspace" ? workspaceRef.current : detailRef.current);
    pendingFocus.current = null;
  }, [mode, selectedId]);

  function showMode(nextMode: "cases" | "report") {
    if (nextMode === mode) focusPanel(workspaceRef.current);
    else pendingFocus.current = "workspace";
    setMode(nextMode);
  }

  function selectCase(id: string) {
    if (id === selectedId) focusPanel(detailRef.current);
    else pendingFocus.current = "detail";
    setSelectedId(id);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/resolution", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const text = await response.text();
      let body: { error?: string } = {};
      try {
        body = text ? (JSON.parse(text) as { error?: string }) : {};
      } catch {
        body = { error: text };
      }
      if (!response.ok)
        throw new Error(body.error || "Your support request could not be saved.");
      setMessage("Support request saved. Refreshing…");
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Your support request could not be saved.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <section className="resolution-hero">
        <div className="shell resolution-hero-content">
          <h1>Get help with an order</h1>
          <p className="resolution-intro">Report a problem or check the status of an existing support request.</p>
          <button className="button resolution-primary" type="button" onClick={() => showMode("report")} aria-controls="support-workspace">Choose an order</button>
          <p className="resolution-contact">Can&apos;t find your order or need help with something else? <Link href="/contact">Contact support</Link></p>
        </div>
      </section>

      <section className="shell resolution-shell" id="support-workspace" ref={workspaceRef} tabIndex={-1} aria-label="Order help and support requests">
        {message && <p className="admin-message" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {mode === "report" && data.cases.length > 0 && <button className="resolution-back" type="button" onClick={() => showMode("cases")}>← View your support requests</button>}

        {mode === "report" ? (
          <ReportProblem
            orders={data.buyerOrders}
            eligibleOrders={eligibleOrders}
            initialOrderId={initialOrderId}
            busy={busy}
            submit={submit}
          />
        ) : data.cases.length ? (
          <>
          <div className="resolution-requests-heading">
            <h2>Your support requests</h2>
            {showRoleFilters && <div className="resolution-filters" role="group" aria-label="Filter support requests">
              {([['all', 'All requests'], ['buyer', 'Purchases'], ['seller', 'Sales']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>)}
            </div>}
          </div>
          <div className="resolution-workspace">
            <aside className="case-list" aria-label="Your support requests">
              {visibleCases.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected?.id === item.id ? "active" : ""}
                  aria-pressed={selected?.id === item.id}
                  aria-controls="support-request-detail"
                  onClick={() => selectCase(item.id)}
                >
                  <span><b>{item.caseNumber}</b><em>{item.viewerRole}</em></span>
                  <strong>{protectionReasonLabel(item.reason)}</strong>
                  <small>{item.order.orderNumber} · Updated {shortDate(item.updatedAt)}</small>
                  <CaseStatus status={item.status} />
                  {isActiveCase(item) && <CaseDeadline item={item} compact />}
                </button>
              ))}
            </aside>
            {selected && <div id="support-request-detail" className="case-detail-container" ref={detailRef} tabIndex={-1}><CaseDetail item={selected} busy={busy} submit={submit} /></div>}
          </div>
          </>
        ) : (
          <p className="resolution-empty-note">You have no support requests yet.</p>
        )}

        <div className="resolution-help">
          <details className="resolution-guide">
            <summary>How support requests work</summary>
            <ol>
              <li><b>Report</b><p>Choose your order, tell us what went wrong, and add photos or documents that show the problem.</p></li>
              <li><b>Respond</b><p>The seller replies to your request. You can check their response and your next steps here, with the exact deadlines shown on your request.</p></li>
              <li><b>Resolve</b><p>Follow the instructions for a return or refund. If the problem is still unresolved, ask Model Car Center to review it.</p></li>
            </ol>
          </details>
          <Link className="resolution-policy-link" href="/protection">How buyer and seller protection works</Link>
        </div>
      </section>
    </>
  );
}

function ReportProblem({
  orders,
  eligibleOrders,
  initialOrderId,
  busy,
  submit,
}: {
  orders: BuyerOrder[];
  eligibleOrders: BuyerOrder[];
  initialOrderId?: string;
  busy: boolean;
  submit(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const [resolution, setResolution] = useState<RequestedResolution>("return_refund");
  const defaultOrder = eligibleOrders.some((order) => order.id === initialOrderId)
    ? initialOrderId
    : eligibleOrders[0]?.id;
  const [selectedOrderId, setSelectedOrderId] = useState(defaultOrder);
  const selectedOrder = eligibleOrders.find(order => order.id === selectedOrderId);
  if (!eligibleOrders.length)
    return (
      <div className="resolution-empty">
        <h2>We couldn&apos;t find an eligible order on this account.</h2>
        <p>{orders.length ? "An order may already have a support request, be past its reporting deadline, or have no payment left to refund." : "Check your order confirmation, or ask support to help find your purchase."}</p>
        <div className="resolution-recovery-actions">
          <Link className="button dark" href="/account?view=orders">Find an order</Link>
          <Link className="button outline" href="/contact">Contact support</Link>
        </div>
        <details className="resolution-checkout-help">
          <summary>Used a different email or checked out as a guest?</summary>
          <p>Sign in with your checkout email to find your order. You can also contact support with that email and your order number or purchase date. Guest orders receive support without creating an account.</p>
        </details>
      </div>
    );
  return (
    <div className="resolution-report-layout">
      <form className="resolution-form" onSubmit={submit}>
        <input type="hidden" name="action" value="open_case" />
        <div>
          <h2>Report an order problem</h2>
          <p>Choose your order and tell us what went wrong.</p>
        </div>
        <label>
          Order
          <select name="orderId" value={selectedOrderId} onChange={event => setSelectedOrderId(event.target.value)} required>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {order.sellerName} · {formatMoney(order.totalCents, order.currency)} · report by {shortDate(order.reportDeadline)}
              </option>
            ))}
          </select>
        </label>
        {selectedOrder && <OrderProtectionSummary order={selectedOrder} compact/>}
        <label>
          Problem
          <select name="reason" required defaultValue="damaged">
            <option value="not_received">Order not received</option>
            <option value="damaged">Damaged in transit</option>
            <option value="not_as_described">Materially not as described</option>
            <option value="wrong_item">Wrong item</option>
            <option value="missing_item">Item or parts missing</option>
            <option value="counterfeit">Authenticity concern</option>
            <option value="other">Other order problem</option>
          </select>
        </label>
        <fieldset>
          <legend>How would you like this resolved?</legend>
          <label><input type="radio" name="requestedResolution" value="return_refund" checked={resolution === "return_refund"} onChange={() => setResolution("return_refund")} /> Return for a full refund</label>
          <label><input type="radio" name="requestedResolution" value="full_refund" checked={resolution === "full_refund"} onChange={() => setResolution("full_refund")} /> Full refund without return</label>
          <label><input type="radio" name="requestedResolution" value="partial_refund" checked={resolution === "partial_refund"} onChange={() => setResolution("partial_refund")} /> Keep item with a partial refund</label>
        </fieldset>
        {resolution === "partial_refund" && (
          <label>
            Requested partial refund (USD)
            <input name="requestedRefund" inputMode="decimal" placeholder="25.00" required />
          </label>
        )}
        <label>
          What happened?
          <textarea name="details" rows={7} minLength={30} maxLength={4000} placeholder="Describe the item received, the listing or delivery issue, packaging condition, and the outcome you are requesting." required />
        </label>
        <label className="resolution-file-input">
          Photos or documents
          <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
          <span>JPG, PNG, WebP, or PDF · up to 5 files · 10 MB each. Add at least one file for damage, an item that differs from its listing, wrong or missing items, or authenticity concerns.</span>
        </label>
        <label className="resolution-attestation">
          <input type="checkbox" required />
          <span>I confirm this report is accurate, I will preserve the item and packaging, and I have reviewed the <Link href="/protection">protection rules</Link>.</span>
        </label>
        <button className="button dark" disabled={busy}>{busy ? "Sending request…" : "Send support request"}</button>
      </form>
      <aside className="resolution-rule-rail">
        <p className="eyebrow">What happens next</p>
        <ol>
          <li><b>Add photos or documents within 5 calendar days.</b><span>Show the model, packaging, shipping label, and problem. Your request will show the exact deadline.</span></li>
          <li><b>The seller has 3 calendar days to respond.</b><span>Check your request for their reply and any return or refund instructions.</span></li>
          <li><b>Still need help?</b><span>If the seller misses their deadline or their reply does not resolve the problem, ask Model Car Center to review your request.</span></li>
        </ol>
      </aside>
    </div>
  );
}

function CaseDetail({
  item,
  busy,
  submit,
}: {
  item: ResolutionCase;
  busy: boolean;
  submit(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const open = isActiveCase(item);
  const label = item.files.find((file) => file.kind === "return_label");
  const evidence = item.files.filter((file) => file.kind === "evidence");
  const refundable = Math.max(
    0,
    item.order.totalCents - item.order.refundedAmountCents,
  );
  return (
    <article className="case-detail">
      <header className="case-detail-header">
        <div>
          <p className="eyebrow">{item.viewerRole === "buyer" ? "Purchase protection" : "Seller response"}</p>
          <h2>{item.caseNumber}</h2>
          <p>{item.order.orderNumber} · {item.order.sellerName} · Opened {longDate(item.createdAt)}</p>
        </div>
        <CaseStatus status={item.status} />
      </header>

      <CaseDeadline item={item} />

      <div className="case-order-strip">
        <div>
          <span>Problem</span>
          <b>{protectionReasonLabel(item.reason)}</b>
        </div>
        <div>
          <span>Requested</span>
          <b>{resolutionLabel(item.requestedResolution)}</b>
        </div>
        <div>
          <span>Order total</span>
          <b>{formatMoney(item.order.totalCents, item.order.currency)}</b>
        </div>
        <div>
          <span>Refundable balance</span>
          <b>{formatMoney(refundable, item.order.currency)}</b>
        </div>
      </div>

      {open && item.returnAuthorizationNumber && (
        <section className="return-authorization">
          <div><p className="eyebrow">Return reference</p><h3>{item.returnAuthorizationNumber}</h3></div>
          <p>{item.status === "return_authorized" ? item.viewerRole === "buyer" ? <>Ship by <b>{longDate(item.buyerShipBy)}</b>. Keep a carrier receipt and add tracking here.</> : <>The buyer must ship by <b>{longDate(item.buyerShipBy)}</b>.</> : "Check the request history for return tracking and refund updates."}</p>
          {label && <a className="button dark small" href={`/api/resolution/files/${label.id}`}>Download return label</a>}
        </section>
      )}

      {open && item.viewerRole === "seller" && (
        <SellerActions item={item} busy={busy} submit={submit} refundable={refundable} />
      )}
      {open && item.viewerRole === "buyer" && item.status !== "awaiting_seller" && (
        <BuyerActions item={item} busy={busy} submit={submit} />
      )}

      <section className="case-section">
        <div className="case-section-heading"><div><p className="eyebrow">Evidence</p><h3>{evidence.length} file{evidence.length === 1 ? "" : "s"}</h3></div><small>Private to buyer, seller, and Model Car Center</small></div>
        <div className="case-files">
          {evidence.map((file) => (
            <a href={`/api/resolution/files/${file.id}`} key={file.id} target="_blank" rel="noreferrer">
              {file.mimeType.startsWith("image/") ? <Image unoptimized width={480} height={360} src={`/api/resolution/files/${file.id}`} alt={file.caption || file.originalName} /> : <span className="case-pdf">PDF</span>}
              <b>{file.originalName}</b>
              <small>{file.uploaderRole} · {formatBytes(file.sizeBytes)}</small>
            </a>
          ))}
          {!evidence.length && <p className="case-empty-note">No files have been added.</p>}
        </div>
        {open && (
          <form className="case-inline-form" onSubmit={submit}>
            <input type="hidden" name="action" value="add_evidence" />
            <input type="hidden" name="caseId" value={item.id} />
            <label>Add evidence<input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <label>Note (optional)<input name="caption" maxLength={500} placeholder="What this file shows" /></label>
            <button className="button outline small" disabled={busy}>Upload</button>
          </form>
        )}
      </section>

      {open && item.viewerRole === "buyer" && item.status === "awaiting_seller" && (
        <BuyerActions item={item} busy={busy} submit={submit} />
      )}

      <section className="case-section">
        <div className="case-section-heading"><div><p className="eyebrow">Case history</p><h3>Shared timeline</h3></div></div>
        <ol className="case-timeline">
          {item.messages.map((entry) => (
            <li key={entry.id}>
              <span className={`timeline-dot ${entry.authorRole}`} />
              <div><p><b>{roleLabel(entry.authorRole)}</b><time>{longDate(entry.createdAt)}</time></p><span>{entry.body}</span></div>
            </li>
          ))}
        </ol>
      </section>

      {!open && item.resolutionSummary && (
        <section className="case-outcome"><p className="eyebrow">Outcome</p><h3>{item.resolutionSummary}</h3><p>Closed {longDate(item.resolvedAt)}</p></section>
      )}
    </article>
  );
}

function SellerActions({ item, busy, submit, refundable }: { item: ResolutionCase; busy: boolean; submit(event: FormEvent<HTMLFormElement>): Promise<void>; refundable: number }) {
  return (
    <section className="case-actions">
      <div className="case-section-heading"><div><p className="eyebrow">Seller actions</p><h3>{item.status === "awaiting_seller" ? `Reply by ${longDate(item.sellerRespondBy)}` : "Respond to this request"}</h3></div></div>
      <div className="case-action-grid">
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="seller_response" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Reply to the buyer</h4><p>Ask for more information or explain how you can help.</p>
          <textarea name="message" rows={5} minLength={10} maxLength={3000} required />
          <button className="button outline small" disabled={busy}>Send response</button>
        </form>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="authorize_return" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Approve a return</h4><p>Send a prepaid label and packing instructions. The buyer has seven calendar days to ship the return.</p>
          <textarea name="instructions" rows={3} maxLength={1500} placeholder="Packing and drop-off instructions" required />
          <label>Prepaid return label<input name="files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
          <button className="button outline small" disabled={busy}>Approve return &amp; send label</button>
        </form>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="issue_refund" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Issue a refund</h4><p>Refunds go to the original payment method. Remaining balance: {formatMoney(refundable, item.order.currency)}.</p>
          <select name="refundKind" required defaultValue="full"><option value="full">Full remaining refund</option><option value="partial">Partial refund</option></select>
          <input name="amount" inputMode="decimal" placeholder="Partial amount, e.g. 25.00" />
          <label className="resolution-attestation"><input type="checkbox" required /><span>I approve this refund and understand a full refund closes the support request.</span></label>
          <button className="button dark small" disabled={busy || refundable < 1}>Issue refund</button>
        </form>
      </div>
    </section>
  );
}

function BuyerActions({ item, busy, submit }: { item: ResolutionCase; busy: boolean; submit(event: FormEvent<HTMLFormElement>): Promise<void> }) {
  const mayEscalate = item.status !== "awaiting_seller" || item.sellerResponseOverdue;
  return (
    <section className="case-actions">
      <div className="case-section-heading"><div><p className="eyebrow">Buyer actions</p><h3>Manage your request</h3></div></div>
      <div className="case-action-grid buyer-actions">
        {item.status === "return_authorized" && (
          <form onSubmit={submit}>
            <input type="hidden" name="action" value="return_shipped" /><input type="hidden" name="caseId" value={item.id} />
            <h4>Add return tracking</h4><p>Submit tracking by {longDate(item.buyerShipBy)} and keep the carrier receipt.</p>
            <input name="carrier" placeholder="Carrier" required maxLength={100} />
            <input name="trackingNumber" placeholder="Tracking number" required maxLength={200} />
            <button className="button dark small" disabled={busy || item.returnShipmentOverdue}>Mark return shipped</button>
          </form>
        )}
        {item.status !== "under_review" && <form onSubmit={submit}>
          <input type="hidden" name="action" value="escalate" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Ask Model Car Center to review</h4><p>{mayEscalate ? "Tell us what is still unresolved. We will review your messages and files." : `Available if the seller has not responded by ${longDate(item.sellerRespondBy)}.`}</p>
          <textarea name="message" rows={3} maxLength={1500} placeholder="Why review is needed" />
          <button className="button outline small" disabled={busy || !mayEscalate}>Request a review</button>
        </form>}
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="close_case" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Close as resolved</h4><p>Use this only when the problem has been resolved. A closed request cannot be reopened.</p>
          <input name="message" maxLength={1000} placeholder="Optional closing note" />
          <button className="button outline small" disabled={busy}>Close request</button>
        </form>
      </div>
    </section>
  );
}

function CaseDeadline({ item, compact = false }: { item: ResolutionCase; compact?: boolean }) {
  const buyer = item.viewerRole === "buyer";
  const deadline = (() => {
    if (item.status === "awaiting_seller") return { label: buyer ? "Seller response due" : "Reply to the buyer by", value: item.sellerRespondBy, overdue: item.sellerResponseOverdue, note: buyer ? item.sellerResponseOverdue ? "You can now ask Model Car Center to review your request." : "Check back for the seller’s reply. Add any photos or documents by the deadline below." : "Reply to the buyer, approve a return, or issue a refund." };
    if (item.status === "awaiting_buyer") return { label: buyer ? "Review the seller’s reply by" : "Buyer response due", value: item.buyerEscalateBy, note: buyer ? "If the problem is still unresolved, ask Model Car Center to review it by this deadline." : "The buyer is reviewing your reply." };
    if (item.status === "return_authorized") return { label: buyer ? "Ship your return and add tracking by" : "Buyer must ship the return by", value: item.buyerShipBy, overdue: item.returnShipmentOverdue, note: buyer ? item.returnShipmentOverdue ? "The return deadline has passed. Contact support if you need help." : "Use the return label and keep your carrier receipt." : "Wait for the buyer’s return tracking." };
    if (item.status === "return_in_transit") return { label: buyer ? "Waiting for your return to arrive" : "Check the return delivery", value: null, note: buyer ? "The seller needs to receive your return and issue the agreed refund." : "Once the return arrives, check it and issue the agreed refund." };
    if (item.status === "under_review") return { label: "Model Car Center is reviewing your request", value: null, note: "Check here for updates from support." };
    return { label: "Request completed", value: item.resolvedAt, note: item.resolutionSummary || "No further action is required." };
  })();
  const showEvidenceDeadline = ["awaiting_seller", "awaiting_buyer", "under_review"].includes(item.status) && (!compact || buyer);
  const Container = compact ? "span" : "div";
  return <Container className={`case-deadline${compact ? " case-deadline-compact" : ""}${deadline.overdue ? " overdue" : ""}${!isActiveCase(item) ? " completed" : ""}`}>
    <span className="case-deadline-label">{deadline.label}</span>
    {deadline.value && <b><time dateTime={deadline.value}>{longDate(deadline.value)}</time></b>}
    {deadline.overdue && <em>Deadline passed</em>}
    {!compact && <span className="case-next-action">{deadline.note}</span>}
    {showEvidenceDeadline && item.buyerEvidenceBy && <small>{buyer ? "Add photos or documents by " : "Buyer photos or documents due "}<time dateTime={item.buyerEvidenceBy}>{longDate(item.buyerEvidenceBy)}</time></small>}
  </Container>;
}

function CaseStatus({ status }: { status: string }) {
  const labels: Record<string, string> = { awaiting_seller: "Waiting for seller", awaiting_buyer: "Waiting for buyer", return_authorized: "Return approved", return_in_transit: "Return on its way", under_review: "In review", resolved: "Resolved", closed: "Closed", denied: "Declined" };
  return <span className={`status ${status}`}>{labels[status] ?? status.replaceAll("_", " ")}</span>;
}

function roleLabel(role: string) {
  return role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : role === "support" ? "Model Car Center" : "Case update";
}

function resolutionLabel(value: string) {
  return value === "return_refund" ? "Return for full refund" : value === "partial_refund" ? "Partial refund" : "Full refund";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function longDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
