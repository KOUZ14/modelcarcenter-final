import { protectionReasonLabel } from "./protection.ts";

export type ResolutionNotificationContentInput = {
  id: string;
  caseId: string;
  caseNumber: string;
  kind:
    | "case_opened"
    | "response"
    | "evidence"
    | "return_authorized"
    | "escalation"
    | "refund"
    | "deadline";
  recipientRole: "buyer" | "seller" | "support";
  message: string | null;
  deadlineAt: string | null;
  reason: string;
  orderNumber: string;
  sellerName: string;
};

export type ResolutionNotificationContent = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function notificationCopy(input: ResolutionNotificationContentInput) {
  const caseRef = input.caseNumber;
  switch (input.kind) {
    case "case_opened":
      return {
        subject: `New resolution case ${caseRef} for ${input.orderNumber}`,
        heading: "A buyer opened a resolution case",
        detail: `Review the reported ${protectionReasonLabel(input.reason).toLowerCase()} and respond by the deadline shown in the Resolution Center.`,
        action: "Review and respond",
      };
    case "response":
      return {
        subject: `Seller responded to resolution case ${caseRef}`,
        heading: "The seller responded",
        detail: "Review the response and the next deadline in your shared case timeline.",
        action: "Review the response",
      };
    case "evidence":
      return {
        subject: `New evidence in resolution case ${caseRef}`,
        heading: "New evidence was added",
        detail: "Review the new file or note in the shared case timeline.",
        action: "Review the evidence",
      };
    case "return_authorized":
      return {
        subject: `Return authorized for resolution case ${caseRef}`,
        heading: "Your return was authorized",
        detail: "Download the prepaid label, follow the seller's instructions, and add tracking before the return deadline.",
        action: "View return instructions",
      };
    case "escalation":
      return {
        subject: `Resolution case ${caseRef} was escalated`,
        heading: "The case was escalated for review",
        detail:
          input.recipientRole === "support"
            ? "The buyer requested platform review. Open the case to review the order, messages, and evidence."
            : "The buyer requested platform review. You can continue to follow the case and add relevant evidence.",
        action: "Review the escalated case",
      };
    case "refund":
      return {
        subject: `Refund update for resolution case ${caseRef}`,
        heading: "A refund update was recorded",
        detail: "Review the refund amount and status in the case timeline.",
        action: "View the refund update",
      };
    case "deadline":
      return {
        subject: `Deadline approaching for resolution case ${caseRef}`,
        heading: "A case deadline is approaching",
        detail: input.message || "Open the case now to review the action that is due.",
        action: "Review the deadline",
      };
  }
}

export function renderResolutionNotificationContent(
  input: ResolutionNotificationContentInput,
  siteUrl: string,
): ResolutionNotificationContent {
  const copy = notificationCopy(input);
  const caseUrl =
    input.recipientRole === "support"
      ? `${siteUrl.replace(/\/$/, "")}/admin`
      : `${siteUrl.replace(/\/$/, "")}/resolution?case=${encodeURIComponent(input.caseId)}`;
  const context = `Case ${input.caseNumber} · Order ${input.orderNumber} · ${input.sellerName}`;
  const deadline = input.deadlineAt
    ? `Deadline: ${formatDeadline(input.deadlineAt)}`
    : null;
  const message = input.message && input.kind !== "deadline" ? input.message : null;

  return {
    subject: copy.subject,
    html: `<h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(context)}</p><p>${escapeHtml(copy.detail)}</p>${message ? `<h2>Update</h2><p>${escapeHtml(message)}</p>` : ""}${deadline ? `<p><strong>${escapeHtml(deadline)}</strong></p>` : ""}<p><a href="${escapeHtml(caseUrl)}">${escapeHtml(copy.action)}</a></p>`,
    text: `${copy.heading}\n\n${context}\n\n${copy.detail}${message ? `\n\nUpdate: ${message}` : ""}${deadline ? `\n\n${deadline}` : ""}\n\n${copy.action}: ${caseUrl}`,
  };
}
