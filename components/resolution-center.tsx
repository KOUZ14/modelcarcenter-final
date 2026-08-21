"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  protectionReasonLabel,
  type RequestedResolution,
} from "@/lib/protection";
import type { ResolutionCenterData } from "@/lib/resolution";

type ResolutionCase = ResolutionCenterData["cases"][number];
type BuyerOrder = ResolutionCenterData["buyerOrders"][number];

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
    data.cases[0] ??
    null;
  const shouldReport = Boolean(
    initialOrderId && !data.cases.some((item) => item.order.id === initialOrderId),
  );
  const [mode, setMode] = useState<"cases" | "report">(
    shouldReport ? "report" : "cases",
  );
  const [selectedId, setSelectedId] = useState(initialCase?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected =
    data.cases.find((item) => item.id === selectedId) ?? data.cases[0] ?? null;
  const eligibleOrders = data.buyerOrders.filter(
    (order) => order.eligible && !order.caseId,
  );

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
        throw new Error(body.error || "The case update could not be saved.");
      setMessage("Case updated. Refreshing the shared timeline…");
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The case update could not be saved.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <section className="resolution-hero">
        <div className="shell resolution-hero-grid">
          <div>
            <p className="eyebrow">Order support · Buyer &amp; seller protection</p>
            <h1>Protection that stays with the order.</h1>
            <p>
              Report a problem, keep evidence and replies together, authorize a
              tracked return, and follow every deadline through resolution.
            </p>
          </div>
          <div className="resolution-hero-steps" aria-label="Resolution process">
            <article><span>01</span><b>Report</b><p>Choose the paid order and document the issue.</p></article>
            <article><span>02</span><b>Respond</b><p>The seller has three calendar days to act.</p></article>
            <article><span>03</span><b>Resolve</b><p>Return, refund, close, or escalate in one timeline.</p></article>
          </div>
        </div>
      </section>

      <section className="shell resolution-shell">
        <div className="resolution-summary">
          <article><span>Active cases</span><b>{data.activeCount}</b></article>
          <article><span>As buyer</span><b>{data.buyerCaseCount}</b></article>
          <article><span>As seller</span><b>{data.sellerCaseCount}</b></article>
          <article className="resolution-policy-card">
            <span>Protection standard</span>
            <Link href="/protection">Read the rules →</Link>
          </article>
        </div>

        {message && <p className="admin-message" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="resolution-tabs" role="tablist" aria-label="Resolution center views">
          <button className={mode === "cases" ? "active" : ""} onClick={() => setMode("cases")} type="button">
            Cases <span>{data.cases.length}</span>
          </button>
          <button className={mode === "report" ? "active" : ""} onClick={() => setMode("report")} type="button">
            Report a problem
          </button>
        </div>

        {mode === "report" ? (
          <ReportProblem
            orders={data.buyerOrders}
            eligibleOrders={eligibleOrders}
            initialOrderId={initialOrderId}
            busy={busy}
            submit={submit}
          />
        ) : data.cases.length ? (
          <div className="resolution-workspace">
            <aside className="case-list" aria-label="Your resolution cases">
              {data.cases.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected?.id === item.id ? "active" : ""}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span><b>{item.caseNumber}</b><em>{item.viewerRole}</em></span>
                  <strong>{protectionReasonLabel(item.reason)}</strong>
                  <small>{item.order.orderNumber} · Updated {shortDate(item.updatedAt)}</small>
                  <CaseStatus status={item.status} />
                </button>
              ))}
            </aside>
            {selected && <CaseDetail item={selected} busy={busy} submit={submit} />}
          </div>
        ) : (
          <div className="resolution-empty">
            <p className="eyebrow">No cases</p>
            <h2>Nothing needs resolving.</h2>
            <p>Your order-level problem reports and seller cases will appear here with their deadlines and full history.</p>
            <button className="button dark" type="button" onClick={() => setMode("report")}>Report an order problem</button>
          </div>
        )}
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
  if (!orders.length)
    return (
      <div className="resolution-empty">
        <p className="eyebrow">Order-level reporting</p>
        <h2>You do not have a paid order to report.</h2>
        <p>Orders paid through Model Car Center appear here after you sign in with the checkout email.</p>
        <Link className="button dark" href="/marketplace">Browse models</Link>
      </div>
    );
  if (!eligibleOrders.length)
    return (
      <div className="resolution-empty">
        <p className="eyebrow">Reporting windows</p>
        <h2>Every order already has a case or is outside its reporting window.</h2>
        <p>Open an existing case from the Cases tab. Non-waivable legal rights are not limited by the marketplace window.</p>
        <Link className="button outline" href="/protection">Review protection rules</Link>
      </div>
    );
  return (
    <div className="resolution-report-layout">
      <form className="resolution-form" onSubmit={submit}>
        <input type="hidden" name="action" value="open_case" />
        <div>
          <p className="eyebrow">Start a case</p>
          <h2>Tell us what went wrong.</h2>
          <p>The report, evidence, seller response, and outcome stay attached to this order.</p>
        </div>
        <label>
          Order
          <select name="orderId" defaultValue={defaultOrder} required>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {order.sellerName} · {formatMoney(order.totalCents, order.currency)} · report by {shortDate(order.reportDeadline)}
              </option>
            ))}
          </select>
        </label>
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
          <legend>Requested resolution</legend>
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
          Evidence files
          <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
          <span>JPG, PNG, WebP, or PDF · up to 5 files · 10 MB each. Evidence is required for damage, discrepancy, wrong/missing item, and authenticity claims.</span>
        </label>
        <label className="resolution-attestation">
          <input type="checkbox" required />
          <span>I confirm this report is accurate, I will preserve the item and packaging, and I have reviewed the <Link href="/protection">protection rules</Link>.</span>
        </label>
        <button className="button dark" disabled={busy}>{busy ? "Opening case…" : "Open case"}</button>
      </form>
      <aside className="resolution-rule-rail">
        <p className="eyebrow">What happens next</p>
        <ol>
          <li><b>Evidence due in 5 days.</b><span>Add clear photos of the model, packaging, shipping label, and issue.</span></li>
          <li><b>Seller response due in 3 days.</b><span>The seller can reply, authorize a prepaid return, or issue a refund.</span></li>
          <li><b>Escalation stays available.</b><span>If the response window passes or the response does not resolve the problem, request platform review.</span></li>
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
  const open = !["resolved", "closed", "denied"].includes(item.status);
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

      <CaseDeadline item={item} />

      {item.returnAuthorizationNumber && (
        <section className="return-authorization">
          <div><p className="eyebrow">Return authorized</p><h3>{item.returnAuthorizationNumber}</h3></div>
          <p>Ship by <b>{longDate(item.buyerShipBy)}</b>. Keep a carrier receipt and add tracking here.</p>
          {label && <a className="button dark small" href={`/api/resolution/files/${label.id}`}>Download return label</a>}
        </section>
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

      {open && item.viewerRole === "seller" && (
        <SellerActions item={item} busy={busy} submit={submit} refundable={refundable} />
      )}
      {open && item.viewerRole === "buyer" && (
        <BuyerActions item={item} busy={busy} submit={submit} />
      )}
      {!open && item.resolutionSummary && (
        <section className="case-outcome"><p className="eyebrow">Outcome</p><h3>{item.resolutionSummary}</h3><p>Closed {longDate(item.resolvedAt)}</p></section>
      )}
    </article>
  );
}

function SellerActions({ item, busy, submit, refundable }: { item: ResolutionCase; busy: boolean; submit(event: FormEvent<HTMLFormElement>): Promise<void>; refundable: number }) {
  return (
    <section className="case-actions">
      <div className="case-section-heading"><div><p className="eyebrow">Seller actions</p><h3>Respond by {longDate(item.sellerRespondBy)}</h3></div></div>
      <div className="case-action-grid">
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="seller_response" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Reply to the buyer</h4><p>Ask a focused question, explain your evidence, or propose a remedy.</p>
          <textarea name="message" rows={5} minLength={10} maxLength={3000} required />
          <button className="button outline small" disabled={busy}>Send response</button>
        </form>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="authorize_return" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Authorize a return</h4><p>An RMA is created and the buyer gets seven calendar days to ship.</p>
          <textarea name="instructions" rows={3} maxLength={1500} placeholder="Packing and drop-off instructions" required />
          <label>Prepaid return label<input name="files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
          <button className="button outline small" disabled={busy}>Issue RMA &amp; label</button>
        </form>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="issue_refund" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Issue a refund</h4><p>Refunds go to the original payment method. Remaining balance: {formatMoney(refundable, item.order.currency)}.</p>
          <select name="refundKind" required defaultValue="full"><option value="full">Full remaining refund</option><option value="partial">Partial refund</option></select>
          <input name="amount" inputMode="decimal" placeholder="Partial amount, e.g. 25.00" />
          <label className="resolution-attestation"><input type="checkbox" required /><span>I authorize this Stripe refund and understand a full refund closes the case.</span></label>
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
      <div className="case-section-heading"><div><p className="eyebrow">Buyer actions</p><h3>Keep the case moving</h3></div></div>
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
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="escalate" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Request platform review</h4><p>{mayEscalate ? "Explain what remains unresolved. The timeline and private files go with your request." : `Available if the seller has not responded by ${longDate(item.sellerRespondBy)}.`}</p>
          <textarea name="message" rows={3} maxLength={1500} placeholder="Why review is needed" />
          <button className="button outline small" disabled={busy || !mayEscalate}>Escalate case</button>
        </form>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="close_case" /><input type="hidden" name="caseId" value={item.id} />
          <h4>Close as resolved</h4><p>Use this only when the problem has been resolved. A closed case cannot be reopened.</p>
          <input name="message" maxLength={1000} placeholder="Optional closing note" />
          <button className="button outline small" disabled={busy}>Close case</button>
        </form>
      </div>
    </section>
  );
}

function CaseDeadline({ item }: { item: ResolutionCase }) {
  const deadline = useMemo(() => {
    if (item.status === "awaiting_seller") return { label: "Seller response due", value: item.sellerRespondBy, overdue: item.sellerResponseOverdue };
    if (item.status === "awaiting_buyer") return { label: "Buyer review / escalation due", value: item.buyerEscalateBy, overdue: false };
    if (item.status === "return_authorized") return { label: "Buyer must ship return by", value: item.buyerShipBy, overdue: item.returnShipmentOverdue };
    if (item.status === "return_in_transit") return { label: "Next step", value: null, note: "Seller confirms receipt and issues the approved refund." };
    if (item.status === "under_review") return { label: "Platform review", value: null, note: "Model Car Center is reviewing the order record, evidence, and responses." };
    return { label: "Case completed", value: item.resolvedAt, note: item.resolutionSummary || "No further action is required." };
  }, [item]);
  return <div className={`case-deadline ${deadline.overdue ? "overdue" : ""}`}><span>{deadline.label}</span><b>{deadline.value ? longDate(deadline.value) : deadline.note}</b>{deadline.overdue && <em>Deadline passed</em>}<small>Buyer evidence due {longDate(item.buyerEvidenceBy)} · Order reporting deadline {longDate(item.reportDeadline)}</small></div>;
}

function CaseStatus({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status.replaceAll("_", " ")}</span>;
}

function roleLabel(role: string) {
  return role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : role === "support" ? "Model Car Center" : "Case update";
}

function resolutionLabel(value: string) {
  return value === "return_refund" ? "Return for full refund" : value === "partial_refund" ? "Partial refund" : "Full refund";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function longDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
