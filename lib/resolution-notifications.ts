import { getD1 } from "@/db";
import { config } from "./config";
import { sendEmail } from "./email";
import {
  renderResolutionNotificationContent,
  type ResolutionNotificationContentInput,
} from "./resolution-notification-content";

export type ResolutionNotificationKind =
  ResolutionNotificationContentInput["kind"];
export type ResolutionNotificationRecipientRole =
  ResolutionNotificationContentInput["recipientRole"];

type QueueResolutionNotificationInput = {
  id: string;
  caseId: string;
  eventKey: string;
  kind: ResolutionNotificationKind;
  recipientRole: ResolutionNotificationRecipientRole;
  recipientEmail: string;
  message?: string | null;
  deadlineAt?: string | null;
};

type PendingNotificationRow = ResolutionNotificationContentInput & {
  eventKey: string;
  recipientEmail: string;
};

const DEADLINE_REMINDER_HOURS = 24;

export function prepareResolutionNotification(
  database: D1Database,
  input: QueueResolutionNotificationInput,
) {
  return database
    .prepare(
      `INSERT INTO resolution_notifications
      (id, case_id, event_key, kind, recipient_role, recipient_email, message,
       deadline_at, status, attempt_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(event_key) DO NOTHING`,
    )
    .bind(
      input.id,
      input.caseId,
      input.eventKey,
      input.kind,
      input.recipientRole,
      input.recipientEmail.trim().toLowerCase(),
      input.message ?? null,
      input.deadlineAt ?? null,
    );
}

export async function deliverResolutionNotifications(
  notificationIds?: string[],
  database = getD1(),
) {
  if (notificationIds && !notificationIds.length)
    return { sent: 0, pending: 0 };
  const idFilter = notificationIds
    ? ` AND n.id IN (${notificationIds.map(() => "?").join(", ")})`
    : "";
  const rows = await database
    .prepare(
      `SELECT n.id, n.event_key AS eventKey, n.kind, n.recipient_role AS recipientRole,
       n.recipient_email AS recipientEmail, n.message, n.deadline_at AS deadlineAt,
       c.id AS caseId, c.case_number AS caseNumber, c.reason,
       o.order_number AS orderNumber, s.store_name AS sellerName
       FROM resolution_notifications n
       INNER JOIN resolution_cases c ON n.case_id = c.id
       INNER JOIN orders o ON c.order_id = o.id
       INNER JOIN sellers s ON o.seller_id = s.id
       WHERE n.status = 'pending'${idFilter}
       ORDER BY n.created_at ASC
       LIMIT 100`,
    )
    .bind(...(notificationIds ?? []))
    .all<PendingNotificationRow>();

  let sent = 0;
  for (const row of rows.results ?? []) {
    try {
      const content = renderResolutionNotificationContent(row, config.siteUrl);
      const result = await sendEmail({
        to: row.recipientEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
        idempotencyKey: row.eventKey,
      });
      if (!result.sent) {
        await markNotificationPending(
          database,
          row.id,
          "Email delivery is not configured.",
        );
        continue;
      }
      await database
        .prepare(
          `UPDATE resolution_notifications
           SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
               attempt_count = attempt_count + 1, last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(row.id)
        .run();
      sent += 1;
    } catch (error) {
      await markNotificationPending(database, row.id, errorMessage(error));
      console.error(
        `[resolution notification pending] ${row.eventKey}: ${errorMessage(error)}`,
      );
    }
  }
  return { sent, pending: (rows.results?.length ?? 0) - sent };
}

export async function safelyDeliverResolutionNotifications(
  notificationIds: string[],
  database = getD1(),
) {
  try {
    return await deliverResolutionNotifications(notificationIds, database);
  } catch (error) {
    console.error(
      `[resolution notification dispatch failed] ${errorMessage(error)}`,
    );
    return { sent: 0, pending: notificationIds.length };
  }
}

export async function processResolutionNotifications(input?: {
  database?: D1Database;
  now?: Date;
}) {
  const database = input?.database ?? getD1();
  const now = input?.now ?? new Date();
  await enqueueApproachingDeadlineNotifications(database, now);
  return deliverResolutionNotifications(undefined, database);
}

async function enqueueApproachingDeadlineNotifications(
  database: D1Database,
  now: Date,
) {
  const startsAt = now.toISOString();
  const endsAt = new Date(
    now.getTime() + DEADLINE_REMINDER_HOURS * 60 * 60 * 1_000,
  ).toISOString();
  const definitions = [
    {
      key: "seller-response",
      deadlineColumn: "seller_respond_by",
      statuses: ["awaiting_seller"],
      recipientRole: "seller",
      recipientColumn: "s.contact_email",
      message: "The seller response deadline is less than 24 hours away.",
    },
    {
      key: "buyer-evidence",
      deadlineColumn: "buyer_evidence_by",
      statuses: [
        "awaiting_seller",
        "awaiting_buyer",
        "return_authorized",
        "return_in_transit",
        "under_review",
      ],
      recipientRole: "buyer",
      recipientColumn: "o.buyer_email",
      message: "The buyer evidence deadline is less than 24 hours away.",
    },
    {
      key: "buyer-escalation",
      deadlineColumn: "buyer_escalate_by",
      statuses: ["awaiting_buyer"],
      recipientRole: "buyer",
      recipientColumn: "o.buyer_email",
      message: "The deadline to escalate this case is less than 24 hours away.",
    },
    {
      key: "return-shipment",
      deadlineColumn: "buyer_ship_by",
      statuses: ["return_authorized"],
      recipientRole: "buyer",
      recipientColumn: "o.buyer_email",
      message: "The deadline to ship the authorized return is less than 24 hours away.",
    },
  ] as const;

  await database.batch(
    definitions.map((definition) => {
      const statuses = definition.statuses.map(() => "?").join(", ");
      return database
        .prepare(
          `INSERT INTO resolution_notifications
          (id, case_id, event_key, kind, recipient_role, recipient_email,
           message, deadline_at, status, attempt_count, created_at, updated_at)
          SELECT lower(hex(randomblob(16))), c.id,
                 'resolution:' || c.id || ':deadline:${definition.key}:' || c.${definition.deadlineColumn},
                 'deadline', ?, ${definition.recipientColumn}, ?, c.${definition.deadlineColumn},
                 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM resolution_cases c
          INNER JOIN orders o ON c.order_id = o.id
          INNER JOIN sellers s ON o.seller_id = s.id
          WHERE c.status IN (${statuses})
            AND c.${definition.deadlineColumn} IS NOT NULL
            AND c.${definition.deadlineColumn} > ?
            AND c.${definition.deadlineColumn} <= ?
          ON CONFLICT(event_key) DO NOTHING`,
        )
        .bind(
          definition.recipientRole,
          definition.message,
          ...definition.statuses,
          startsAt,
          endsAt,
        );
    }),
  );
}

async function markNotificationPending(
  database: D1Database,
  notificationId: string,
  error: string,
) {
  await database
    .prepare(
      `UPDATE resolution_notifications
       SET attempt_count = attempt_count + 1, last_error = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(error.slice(0, 500), notificationId)
    .run();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
