import assert from "node:assert/strict";
import test from "node:test";
import { renderResolutionNotificationContent } from "../lib/resolution-notification-content.ts";

const base = {
  id: "notification-1",
  caseId: "case-1",
  caseNumber: "MCC-RC-20260820-ABCDEF",
  recipientRole: "buyer",
  message: "The case has an important update.",
  deadlineAt: null,
  reason: "not_as_described",
  orderNumber: "MCC-1001",
  sellerName: "Scale & Speed",
};

test("resolution emails cover every requested case event", () => {
  const expectations = {
    case_opened: "New resolution case",
    response: "Seller responded",
    evidence: "New evidence",
    return_authorized: "Return authorized",
    escalation: "was escalated",
    refund: "Refund update",
    deadline: "Deadline approaching",
  };

  for (const [kind, subjectFragment] of Object.entries(expectations)) {
    const content = renderResolutionNotificationContent(
      { ...base, kind },
      "https://modelcarcenter.com/",
    );
    assert.match(content.subject, new RegExp(subjectFragment, "i"));
    assert.match(content.html, /MCC-RC-20260820-ABCDEF/);
    assert.match(content.html, /\/resolution\?case=case-1/);
    assert.match(content.text, /Order MCC-1001/);
  }
});

test("deadline reminders show the exact UTC deadline", () => {
  const content = renderResolutionNotificationContent(
    {
      ...base,
      kind: "deadline",
      message: "The seller response deadline is less than 24 hours away.",
      deadlineAt: "2026-08-21T18:30:00.000Z",
      recipientRole: "seller",
    },
    "https://modelcarcenter.com",
  );
  assert.match(content.html, /August 21, 2026 at 6:30 PM UTC/);
  assert.match(content.text, /less than 24 hours away/);
});

test("case updates are escaped before being added to an email", () => {
  const content = renderResolutionNotificationContent(
    { ...base, kind: "evidence", message: '<script>alert("x")</script>' },
    "https://modelcarcenter.com",
  );
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(content.html, /&lt;script&gt;/);
});

test("support escalation emails route to the admin case queue", () => {
  const content = renderResolutionNotificationContent(
    { ...base, kind: "escalation", recipientRole: "support" },
    "https://modelcarcenter.com",
  );
  assert.match(content.html, /href="https:\/\/modelcarcenter\.com\/admin"/);
  assert.doesNotMatch(content.html, /\/resolution\?case=/);
});
