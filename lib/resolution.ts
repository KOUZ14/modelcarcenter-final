import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  orderItems,
  orders,
  resolutionCases,
  resolutionFiles,
  resolutionMessages,
  resolutionRefunds,
  sellers,
} from "@/db/schema";
import { config } from "./config";
import { POLICY_VERSION } from "./legal";
import {
  addCalendarDays,
  BUYER_ESCALATION_DAYS,
  BUYER_EVIDENCE_DAYS,
  canReportOrderProblem,
  isPastDeadline,
  makeCaseNumber,
  makeReturnAuthorizationNumber,
  protectionReasons,
  remainingRefundableCents,
  requestedResolutions,
  RETURN_SHIP_DAYS,
  SELLER_RESPONSE_DAYS,
  type ProtectionReason,
  type RequestedResolution,
} from "./protection";
import {
  prepareResolutionNotification,
  safelyDeliverResolutionNotifications,
} from "./resolution-notifications";
import { createOrderRefund } from "./stripe";
import {
  cleanText,
  moneyToCents,
  requiredString,
  ValidationError,
} from "./validation";

const MAX_RESOLUTION_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CASE_FILES = 12;

export type ResolutionStorage = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

type PreparedFile = {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

const closedStatuses = new Set(["resolved", "closed", "denied"]);

export async function getResolutionCenterData(userId: string) {
  const db = getDb();
  const accessibleOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerUserId: orders.buyerUserId,
      buyerName: orders.buyerName,
      buyerEmail: orders.buyerEmail,
      sellerId: orders.sellerId,
      sellerOwnerUserId: sellers.ownerUserId,
      sellerName: sellers.storeName,
      sellerSlug: sellers.slug,
      currency: orders.currency,
      totalCents: orders.totalCents,
      refundedAmountCents: orders.refundedAmountCents,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      carrier: orders.carrier,
      trackingNumber: orders.trackingNumber,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      shippedAt: orders.shippedAt,
    })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(
      or(eq(orders.buyerUserId, userId), eq(sellers.ownerUserId, userId)),
    )
    .orderBy(desc(orders.createdAt));

  const orderIds = accessibleOrders.map((order) => order.id);
  const [items, caseRows] = orderIds.length
    ? await Promise.all([
        db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds))
          .orderBy(asc(orderItems.id)),
        db
          .select()
          .from(resolutionCases)
          .where(inArray(resolutionCases.orderId, orderIds))
          .orderBy(desc(resolutionCases.updatedAt)),
      ])
    : [[], []];
  const caseIds = caseRows.map((item) => item.id);
  const [messages, files, refunds] = caseIds.length
    ? await Promise.all([
        db
          .select()
          .from(resolutionMessages)
          .where(inArray(resolutionMessages.caseId, caseIds))
          .orderBy(asc(resolutionMessages.createdAt)),
        db
          .select({
            id: resolutionFiles.id,
            caseId: resolutionFiles.caseId,
            uploaderRole: resolutionFiles.uploaderRole,
            kind: resolutionFiles.kind,
            originalName: resolutionFiles.originalName,
            mimeType: resolutionFiles.mimeType,
            sizeBytes: resolutionFiles.sizeBytes,
            caption: resolutionFiles.caption,
            createdAt: resolutionFiles.createdAt,
          })
          .from(resolutionFiles)
          .where(inArray(resolutionFiles.caseId, caseIds))
          .orderBy(asc(resolutionFiles.createdAt)),
        db
          .select()
          .from(resolutionRefunds)
          .where(inArray(resolutionRefunds.caseId, caseIds))
          .orderBy(asc(resolutionRefunds.createdAt)),
      ])
    : [[], [], []];
  const casesByOrder = new Map(caseRows.map((item) => [item.orderId, item]));

  const buyerOrders = accessibleOrders
    .filter((order) => order.buyerUserId === userId)
    .map((order) => {
      const eligibility = canReportOrderProblem(order);
      return {
        ...order,
        items: items.filter((item) => item.orderId === order.id),
        caseId: casesByOrder.get(order.id)?.id ?? null,
        ...eligibility,
      };
    });

  const cases = caseRows.map((item) => {
    const order = accessibleOrders.find((candidate) => candidate.id === item.orderId)!;
    return {
      ...item,
      viewerRole: order.buyerUserId === userId ? ("buyer" as const) : ("seller" as const),
      order: {
        ...order,
        items: items.filter((line) => line.orderId === order.id),
      },
      messages: messages.filter((message) => message.caseId === item.id),
      files: files.filter((file) => file.caseId === item.id),
      refunds: refunds.filter((refund) => refund.caseId === item.id),
      sellerResponseOverdue:
        item.status === "awaiting_seller" && isPastDeadline(item.sellerRespondBy),
      returnShipmentOverdue:
        item.status === "return_authorized" && isPastDeadline(item.buyerShipBy),
    };
  });

  return {
    buyerOrders,
    cases,
    activeCount: cases.filter((item) => !closedStatuses.has(item.status)).length,
    buyerCaseCount: cases.filter((item) => item.viewerRole === "buyer").length,
    sellerCaseCount: cases.filter((item) => item.viewerRole === "seller").length,
  };
}

export type ResolutionCenterData = Awaited<
  ReturnType<typeof getResolutionCenterData>
>;

export async function openResolutionCase(input: {
  userId: string;
  payload: Record<string, unknown>;
  files: File[];
  storage: ResolutionStorage;
}) {
  const orderId = requiredString(input.payload.orderId, "orderId", 100);
  const reason = requiredString(input.payload.reason, "reason", 40);
  const requestedResolution = requiredString(
    input.payload.requestedResolution,
    "requestedResolution",
    40,
  );
  if (!protectionReasons.includes(reason as ProtectionReason))
    throw new ValidationError("Choose a valid order problem.");
  if (!requestedResolutions.includes(requestedResolution as RequestedResolution))
    throw new ValidationError("Choose a valid requested resolution.");
  const details = requiredString(input.payload.details, "details", 4_000);
  if (details.length < 30)
    throw new ValidationError("Describe what happened in at least 30 characters.");

  const db = getDb();
  const rows = await db
    .select({
      order: orders,
      sellerName: sellers.storeName,
      sellerEmail: sellers.contactEmail,
    })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(and(eq(orders.id, orderId), eq(orders.buyerUserId, input.userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ValidationError("This order is not available in your account.");
  const existing = await db
    .select({ id: resolutionCases.id })
    .from(resolutionCases)
    .where(eq(resolutionCases.orderId, orderId))
    .limit(1);
  if (existing[0]) throw new ValidationError("A case already exists for this order.");
  const eligibility = canReportOrderProblem(row.order);
  if (!eligibility.eligible) throw new ValidationError(eligibility.reason);

  const evidenceRequired = [
    "damaged",
    "not_as_described",
    "wrong_item",
    "missing_item",
    "counterfeit",
  ].includes(reason);
  if (evidenceRequired && !input.files.length)
    throw new ValidationError("Add at least one clear evidence photo or PDF.");
  if (input.files.length > 5)
    throw new ValidationError("Add up to five evidence files when opening a case.");

  const refundableCents = remainingRefundableCents(row.order);
  let requestedRefundCents: number | null = null;
  if (requestedResolution === "partial_refund") {
    requestedRefundCents = moneyToCents(
      input.payload.requestedRefund,
      "requested refund",
    );
    if (requestedRefundCents < 1 || requestedRefundCents >= refundableCents)
      throw new ValidationError(
        "A partial refund must be greater than zero and less than the remaining paid balance.",
      );
  } else if (requestedResolution === "full_refund") {
    requestedRefundCents = refundableCents;
  }

  const now = new Date();
  const caseId = crypto.randomUUID();
  const caseNumber = makeCaseNumber(now);
  const notificationId = crypto.randomUUID();
  const prepared = await storeResolutionFiles({
    storage: input.storage,
    caseId,
    files: input.files,
  });
  try {
    const d1 = getD1();
    const statements = [
      d1
        .prepare(
          `INSERT INTO resolution_cases
          (id, case_number, order_id, opened_by_user_id, reason, requested_resolution,
           requested_refund_cents, details, status, policy_version, report_deadline,
           seller_respond_by, buyer_evidence_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_seller', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          caseId,
          caseNumber,
          orderId,
          input.userId,
          reason,
          requestedResolution,
          requestedRefundCents,
          details,
          POLICY_VERSION,
          eligibility.reportDeadline,
          addCalendarDays(now, SELLER_RESPONSE_DAYS),
          addCalendarDays(now, BUYER_EVIDENCE_DAYS),
          now.toISOString(),
          now.toISOString(),
        ),
      d1
        .prepare(
          `INSERT INTO resolution_messages
          (id, case_id, author_user_id, author_role, kind, body, created_at)
          VALUES (?, ?, ?, 'buyer', 'case_opened', ?, ?)`,
        )
        .bind(crypto.randomUUID(), caseId, input.userId, details, now.toISOString()),
      ...prepared.map((file) =>
        d1
          .prepare(
            `INSERT INTO resolution_files
            (id, case_id, uploaded_by_user_id, uploader_role, kind, storage_key,
             original_name, mime_type, size_bytes, caption, created_at)
            VALUES (?, ?, ?, 'buyer', 'evidence', ?, ?, ?, ?, '', ?)`,
          )
          .bind(
            file.id,
            caseId,
            input.userId,
            file.storageKey,
            file.originalName,
            file.mimeType,
            file.sizeBytes,
            now.toISOString(),
          ),
      ),
      prepareResolutionNotification(d1, {
        id: notificationId,
        caseId,
        eventKey: `resolution:${caseId}:case-opened`,
        kind: "case_opened",
        recipientRole: "seller",
        recipientEmail: row.sellerEmail,
        message: details,
        deadlineAt: addCalendarDays(now, SELLER_RESPONSE_DAYS),
      }),
    ];
    await d1.batch(statements);
  } catch (error) {
    await Promise.allSettled(
      prepared.map((file) => input.storage.delete(file.storageKey)),
    );
    throw error;
  }
  await safelyDeliverResolutionNotifications([notificationId]);
  return { caseId, caseNumber };
}

export async function addResolutionEvidence(input: {
  userId: string;
  caseId: string;
  caption: unknown;
  files: File[];
  storage: ResolutionStorage;
}) {
  const access = await requireCaseAccess(input.userId, input.caseId);
  assertCaseOpen(access.case.status);
  if (!input.files.length) throw new ValidationError("Choose an evidence file.");
  const existing = await getDb()
    .select({ id: resolutionFiles.id })
    .from(resolutionFiles)
    .where(eq(resolutionFiles.caseId, input.caseId));
  if (existing.length + input.files.length > MAX_CASE_FILES)
    throw new ValidationError(`A case can contain up to ${MAX_CASE_FILES} files.`);
  const caption = cleanText(input.caption, 500);
  const prepared = await storeResolutionFiles({
    storage: input.storage,
    caseId: input.caseId,
    files: input.files,
  });
  const notificationId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    const d1 = getD1();
    await d1.batch([
      ...prepared.map((file) =>
        d1
          .prepare(
            `INSERT INTO resolution_files
            (id, case_id, uploaded_by_user_id, uploader_role, kind, storage_key,
             original_name, mime_type, size_bytes, caption, created_at)
            VALUES (?, ?, ?, ?, 'evidence', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            file.id,
            input.caseId,
            input.userId,
            access.role,
            file.storageKey,
            file.originalName,
            file.mimeType,
            file.sizeBytes,
            caption,
            now,
          ),
      ),
      ...(caption
        ? [
            d1
              .prepare(
                `INSERT INTO resolution_messages
                (id, case_id, author_user_id, author_role, kind, body, created_at)
                VALUES (?, ?, ?, ?, 'message', ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                input.caseId,
                input.userId,
                access.role,
                caption,
                now,
              ),
          ]
        : []),
      d1
        .prepare(
          "UPDATE resolution_cases SET updated_at = ? WHERE id = ?",
        )
        .bind(now, input.caseId),
      prepareResolutionNotification(d1, {
        id: notificationId,
        caseId: input.caseId,
        eventKey: `resolution:${input.caseId}:evidence:${prepared[0].id}`,
        kind: "evidence",
        recipientRole: access.role === "buyer" ? "seller" : "buyer",
        recipientEmail:
          access.role === "buyer"
            ? access.seller.contactEmail
            : access.order.buyerEmail,
        message: `${prepared.length} evidence file${prepared.length === 1 ? " was" : "s were"} added${caption ? `: ${caption}` : "."}`,
      }),
    ]);
  } catch (error) {
    await Promise.allSettled(
      prepared.map((file) => input.storage.delete(file.storageKey)),
    );
    throw error;
  }
  await safelyDeliverResolutionNotifications([notificationId]);
  return { uploaded: prepared.length };
}

export async function respondToResolutionCase(
  userId: string,
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const access = await requireSellerCaseAccess(userId, caseId);
  assertCaseOpen(access.case.status);
  const response = requiredString(payload.message, "message", 3_000);
  if (response.length < 10)
    throw new ValidationError("Provide a clear response of at least 10 characters.");
  const now = new Date();
  const nextStatus =
    access.case.status === "under_review" ? "under_review" : "awaiting_buyer";
  const notificationId = crypto.randomUUID();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, ?, 'seller', 'seller_response', ?, ?)`,
      )
      .bind(crypto.randomUUID(), caseId, userId, response, now.toISOString()),
    d1
      .prepare(
        `UPDATE resolution_cases
        SET status = ?, buyer_escalate_by = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        nextStatus,
        addCalendarDays(now, BUYER_ESCALATION_DAYS),
        now.toISOString(),
        caseId,
      ),
    prepareResolutionNotification(d1, {
      id: notificationId,
      caseId,
      eventKey: `resolution:${caseId}:response:${notificationId}`,
      kind: "response",
      recipientRole: "buyer",
      recipientEmail: access.order.buyerEmail,
      message: response,
      deadlineAt: addCalendarDays(now, BUYER_ESCALATION_DAYS),
    }),
  ]);
  await safelyDeliverResolutionNotifications([notificationId]);
  return { caseId, status: nextStatus };
}

export async function authorizeResolutionReturn(input: {
  userId: string;
  payload: Record<string, unknown>;
  label: File | null;
  storage: ResolutionStorage;
}) {
  const caseId = requiredString(input.payload.caseId, "caseId", 100);
  const access = await requireSellerCaseAccess(input.userId, caseId);
  assertCaseOpen(access.case.status);
  if (!input.label)
    throw new ValidationError("Attach the prepaid return label as a PDF or image.");
  const instructions = requiredString(
    input.payload.instructions,
    "instructions",
    1_500,
  );
  const prepared = await storeResolutionFiles({
    storage: input.storage,
    caseId,
    files: [input.label],
  });
  const file = prepared[0];
  const now = new Date();
  const authorizationNumber = makeReturnAuthorizationNumber(access.case.caseNumber);
  const buyerShipBy = addCalendarDays(now, RETURN_SHIP_DAYS);
  const notificationId = crypto.randomUUID();
  try {
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO resolution_files
          (id, case_id, uploaded_by_user_id, uploader_role, kind, storage_key,
           original_name, mime_type, size_bytes, caption, created_at)
          VALUES (?, ?, ?, 'seller', 'return_label', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          file.id,
          caseId,
          input.userId,
          file.storageKey,
          file.originalName,
          file.mimeType,
          file.sizeBytes,
          instructions,
          now.toISOString(),
        ),
      d1
        .prepare(
          `INSERT INTO resolution_messages
          (id, case_id, author_user_id, author_role, kind, body, created_at)
          VALUES (?, ?, ?, 'seller', 'return_authorized', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          caseId,
          input.userId,
          `${authorizationNumber}: ${instructions}`,
          now.toISOString(),
        ),
      d1
        .prepare(
          `UPDATE resolution_cases SET status = 'return_authorized',
          return_authorization_number = ?, buyer_ship_by = ?, buyer_escalate_by = ?,
          updated_at = ? WHERE id = ?`,
        )
        .bind(
          authorizationNumber,
          buyerShipBy,
          addCalendarDays(now, BUYER_ESCALATION_DAYS),
          now.toISOString(),
          caseId,
        ),
      prepareResolutionNotification(d1, {
        id: notificationId,
        caseId,
        eventKey: `resolution:${caseId}:return-authorized:${authorizationNumber}`,
        kind: "return_authorized",
        recipientRole: "buyer",
        recipientEmail: access.order.buyerEmail,
        message: `${authorizationNumber}: ${instructions}`,
        deadlineAt: buyerShipBy,
      }),
    ]);
  } catch (error) {
    await input.storage.delete(file.storageKey);
    throw error;
  }
  await safelyDeliverResolutionNotifications([notificationId]);
  return { caseId, authorizationNumber, buyerShipBy };
}

export async function markResolutionReturnShipped(
  userId: string,
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const access = await requireBuyerCaseAccess(userId, caseId);
  if (access.case.status !== "return_authorized")
    throw new ValidationError("This case does not have an active return authorization.");
  if (isPastDeadline(access.case.buyerShipBy))
    throw new ValidationError(
      "The return-shipment deadline passed. Escalate the case for review.",
    );
  const carrier = requiredString(payload.carrier, "carrier", 100);
  const trackingNumber = requiredString(
    payload.trackingNumber,
    "trackingNumber",
    200,
  );
  const now = new Date().toISOString();
  await getD1().batch([
    getD1()
      .prepare(
        `UPDATE resolution_cases SET status = 'return_in_transit', return_carrier = ?,
        return_tracking_number = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(carrier, trackingNumber, now, caseId),
    getD1()
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, ?, 'buyer', 'return_shipped', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        caseId,
        userId,
        `Return shipped with ${carrier}. Tracking: ${trackingNumber}`,
        now,
      ),
  ]);
  return { caseId, status: "return_in_transit" };
}

export async function escalateResolutionCase(
  userId: string,
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const access = await requireBuyerCaseAccess(userId, caseId);
  assertCaseOpen(access.case.status);
  if (
    access.case.status === "awaiting_seller" &&
    !isPastDeadline(access.case.sellerRespondBy)
  )
    throw new ValidationError(
      "The seller still has time to respond. You can escalate after the response deadline.",
    );
  const reason = cleanText(payload.message, 1_500) || "Buyer requested platform review.";
  const now = new Date().toISOString();
  const sellerNotificationId = crypto.randomUUID();
  const supportNotificationId = crypto.randomUUID();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        "UPDATE resolution_cases SET status = 'under_review', updated_at = ? WHERE id = ?",
      )
      .bind(now, caseId),
    d1
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, ?, 'buyer', 'escalation', ?, ?)`,
      )
      .bind(crypto.randomUUID(), caseId, userId, reason, now),
    prepareResolutionNotification(d1, {
      id: sellerNotificationId,
      caseId,
      eventKey: `resolution:${caseId}:escalation:${sellerNotificationId}:seller`,
      kind: "escalation",
      recipientRole: "seller",
      recipientEmail: access.seller.contactEmail,
      message: reason,
    }),
    prepareResolutionNotification(d1, {
      id: supportNotificationId,
      caseId,
      eventKey: `resolution:${caseId}:escalation:${sellerNotificationId}:support`,
      kind: "escalation",
      recipientRole: "support",
      recipientEmail: config.supportEmail,
      message: reason,
    }),
  ]);
  await safelyDeliverResolutionNotifications([
    sellerNotificationId,
    supportNotificationId,
  ]);
  return { caseId, status: "under_review" };
}

export async function closeResolutionCase(
  userId: string,
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const access = await requireBuyerCaseAccess(userId, caseId);
  assertCaseOpen(access.case.status);
  const now = new Date().toISOString();
  const message = cleanText(payload.message, 1_000) || "Buyer closed the case.";
  await getD1().batch([
    getD1()
      .prepare(
        `UPDATE resolution_cases SET status = 'closed', resolution_summary = ?,
        resolved_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(message, now, now, caseId),
    getD1()
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, ?, 'buyer', 'case_closed', ?, ?)`,
      )
      .bind(crypto.randomUUID(), caseId, userId, message, now),
  ]);
  return { caseId, status: "closed" };
}

export async function issueResolutionRefund(
  userId: string,
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const access = await requireSellerCaseAccess(userId, caseId);
  assertCaseOpen(access.case.status);
  if (!access.order.stripePaymentIntentId)
    throw new ValidationError("Stripe payment details are unavailable for this order.");
  const remaining = remainingRefundableCents(access.order);
  if (remaining < 1) throw new ValidationError("This order is already fully refunded.");
  const requestedKind = requiredString(payload.refundKind, "refundKind", 20);
  if (!["partial", "full"].includes(requestedKind))
    throw new ValidationError("Choose a partial or full refund.");
  let amountCents = remaining;
  if (requestedKind === "partial") {
    amountCents = moneyToCents(payload.amount, "refund amount");
    if (amountCents < 1 || amountCents >= remaining)
      throw new ValidationError(
        "A partial refund must be greater than zero and less than the remaining balance.",
      );
  }
  const refund = await createOrderRefund({
    orderId: access.order.id,
    paymentIntentId: access.order.stripePaymentIntentId,
    chargeId: access.order.stripeChargeId,
    amountCents,
    idempotencyKey: `resolution-${caseId}-${access.order.refundedAmountCents}-${amountCents}`,
  });
  const succeeded = refund.status === "succeeded";
  const newRefundedAmount = Math.min(
    access.order.totalCents,
    access.order.refundedAmountCents + (succeeded ? amountCents : 0),
  );
  const full = newRefundedAmount >= access.order.totalCents;
  const now = new Date().toISOString();
  const summary = `${requestedKind === "full" ? "Full" : "Partial"} refund of ${formatRefundAmount(amountCents, access.order.currency)} ${succeeded ? "issued" : "submitted"} to the original payment method.`;
  const d1 = getD1();
  const notificationId = crypto.randomUUID();
  const statements = [
    d1
      .prepare(
        `INSERT INTO resolution_refunds
        (id, case_id, order_id, initiated_by_user_id, kind, amount_cents,
         stripe_refund_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stripe_refund_id) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        caseId,
        access.order.id,
        userId,
        full ? "full" : "partial",
        amountCents,
        refund.id,
        succeeded ? "succeeded" : "pending",
        now,
      ),
    d1
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, ?, 'seller', 'refund', ?, ?)`,
      )
      .bind(crypto.randomUUID(), caseId, userId, summary, now),
    d1
      .prepare(
        `UPDATE resolution_cases SET status = ?, resolution_summary = ?,
        resolved_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        succeeded ? "resolved" : "under_review",
        summary,
        succeeded ? now : null,
        now,
        caseId,
      ),
    prepareResolutionNotification(d1, {
      id: notificationId,
      caseId,
      eventKey: `resolution:${caseId}:refund:${refund.id}:buyer`,
      kind: "refund",
      recipientRole: "buyer",
      recipientEmail: access.order.buyerEmail,
      message: summary,
    }),
  ];
  if (succeeded) {
    statements.push(
      d1
        .prepare(
          `UPDATE orders SET refunded_amount_cents = ?, payment_status = ?,
          stripe_refund_id = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          newRefundedAmount,
          full ? "refunded" : "partially_refunded",
          refund.id,
          now,
          access.order.id,
        ),
    );
  }
  await d1.batch(statements);
  await safelyDeliverResolutionNotifications([notificationId]);
  return {
    caseId,
    refundId: refund.id,
    refundStatus: refund.status,
    amountCents,
    status: succeeded ? "resolved" : "under_review",
  };
}

export async function getResolutionFileForUser(userId: string, fileId: string) {
  const rows = await getDb()
    .select({
      id: resolutionFiles.id,
      storageKey: resolutionFiles.storageKey,
      originalName: resolutionFiles.originalName,
      mimeType: resolutionFiles.mimeType,
      buyerUserId: orders.buyerUserId,
      sellerOwnerUserId: sellers.ownerUserId,
    })
    .from(resolutionFiles)
    .innerJoin(resolutionCases, eq(resolutionFiles.caseId, resolutionCases.id))
    .innerJoin(orders, eq(resolutionCases.orderId, orders.id))
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(eq(resolutionFiles.id, fileId))
    .limit(1);
  const file = rows[0];
  if (
    !file ||
    (file.buyerUserId !== userId && file.sellerOwnerUserId !== userId)
  )
    return null;
  return file;
}

export async function getAdminResolutionCases() {
  const db = getDb();
  const caseRows = await db
    .select({
      case: resolutionCases,
      order: orders,
      sellerName: sellers.storeName,
    })
    .from(resolutionCases)
    .innerJoin(orders, eq(resolutionCases.orderId, orders.id))
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .orderBy(desc(resolutionCases.updatedAt))
    .limit(250);
  const caseIds = caseRows.map((row) => row.case.id);
  const [messages, files, refunds] = caseIds.length
    ? await Promise.all([
        db
          .select()
          .from(resolutionMessages)
          .where(inArray(resolutionMessages.caseId, caseIds))
          .orderBy(asc(resolutionMessages.createdAt)),
        db
          .select({
            id: resolutionFiles.id,
            caseId: resolutionFiles.caseId,
            kind: resolutionFiles.kind,
            uploaderRole: resolutionFiles.uploaderRole,
            originalName: resolutionFiles.originalName,
            mimeType: resolutionFiles.mimeType,
            sizeBytes: resolutionFiles.sizeBytes,
            caption: resolutionFiles.caption,
            createdAt: resolutionFiles.createdAt,
          })
          .from(resolutionFiles)
          .where(inArray(resolutionFiles.caseId, caseIds))
          .orderBy(asc(resolutionFiles.createdAt)),
        db
          .select()
          .from(resolutionRefunds)
          .where(inArray(resolutionRefunds.caseId, caseIds))
          .orderBy(asc(resolutionRefunds.createdAt)),
      ])
    : [[], [], []];
  return caseRows.map((row) => ({
    ...row.case,
    order: row.order,
    sellerName: row.sellerName,
    messages: messages.filter((message) => message.caseId === row.case.id),
    files: files.filter((file) => file.caseId === row.case.id),
    refunds: refunds.filter((refund) => refund.caseId === row.case.id),
  }));
}

export async function decideAdminResolutionCase(
  payload: Record<string, unknown>,
) {
  const caseId = requiredString(payload.caseId, "caseId", 100);
  const decision = requiredString(payload.decision, "decision", 30);
  if (!["resolved", "denied", "partial_refund", "full_refund"].includes(decision))
    throw new ValidationError("Choose a valid case outcome.");
  const summary = requiredString(payload.summary, "summary", 2_000);
  if (summary.length < 10)
    throw new ValidationError("Provide an outcome explanation of at least 10 characters.");
  const rows = await getDb()
    .select({ case: resolutionCases, order: orders, seller: sellers })
    .from(resolutionCases)
    .innerJoin(orders, eq(resolutionCases.orderId, orders.id))
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(eq(resolutionCases.id, caseId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ValidationError("Resolution case not found.");
  if (closedStatuses.has(row.case.status))
    throw new ValidationError("This case already has a final outcome.");
  const now = new Date().toISOString();
  const d1 = getD1();

  if (decision === "resolved" || decision === "denied") {
    await d1.batch([
      d1
        .prepare(
          `UPDATE resolution_cases SET status = ?, resolution_summary = ?,
          resolved_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(decision, summary, now, now, caseId),
      d1
        .prepare(
          `INSERT INTO resolution_messages
          (id, case_id, author_user_id, author_role, kind, body, created_at)
          VALUES (?, ?, NULL, 'support', 'case_closed', ?, ?)`,
        )
        .bind(crypto.randomUUID(), caseId, summary, now),
    ]);
    return { caseId, status: decision };
  }

  if (!row.order.stripePaymentIntentId)
    throw new ValidationError("Stripe payment details are unavailable for this order.");
  const remaining = remainingRefundableCents(row.order);
  if (remaining < 1) throw new ValidationError("This order is already fully refunded.");
  let amountCents = remaining;
  if (decision === "partial_refund") {
    amountCents = moneyToCents(payload.amount, "refund amount");
    if (amountCents < 1 || amountCents >= remaining)
      throw new ValidationError(
        "A partial refund must be greater than zero and less than the remaining balance.",
      );
  }
  const refund = await createOrderRefund({
    orderId: row.order.id,
    paymentIntentId: row.order.stripePaymentIntentId,
    chargeId: row.order.stripeChargeId,
    amountCents,
    idempotencyKey: `admin-resolution-${caseId}-${row.order.refundedAmountCents}-${amountCents}`,
  });
  const succeeded = refund.status === "succeeded";
  const newRefundedAmount = Math.min(
    row.order.totalCents,
    row.order.refundedAmountCents + (succeeded ? amountCents : 0),
  );
  const full = newRefundedAmount >= row.order.totalCents;
  const status = succeeded ? "resolved" : "under_review";
  const message = `${summary}\n\n${formatRefundAmount(amountCents, row.order.currency)} ${succeeded ? "refunded" : "refund submitted"} to the original payment method.`;
  const buyerNotificationId = crypto.randomUUID();
  const sellerNotificationId = crypto.randomUUID();
  const statements = [
    d1
      .prepare(
        `INSERT INTO resolution_refunds
        (id, case_id, order_id, initiated_by_user_id, kind, amount_cents,
         stripe_refund_id, status, created_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?) ON CONFLICT(stripe_refund_id) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        caseId,
        row.order.id,
        full ? "full" : "partial",
        amountCents,
        refund.id,
        succeeded ? "succeeded" : "pending",
        now,
      ),
    d1
      .prepare(
        `INSERT INTO resolution_messages
        (id, case_id, author_user_id, author_role, kind, body, created_at)
        VALUES (?, ?, NULL, 'support', 'refund', ?, ?)`,
      )
      .bind(crypto.randomUUID(), caseId, message, now),
    d1
      .prepare(
        `UPDATE resolution_cases SET status = ?, resolution_summary = ?,
        resolved_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(status, message, succeeded ? now : null, now, caseId),
    prepareResolutionNotification(d1, {
      id: buyerNotificationId,
      caseId,
      eventKey: `resolution:${caseId}:refund:${refund.id}:buyer`,
      kind: "refund",
      recipientRole: "buyer",
      recipientEmail: row.order.buyerEmail,
      message,
    }),
    prepareResolutionNotification(d1, {
      id: sellerNotificationId,
      caseId,
      eventKey: `resolution:${caseId}:refund:${refund.id}:seller`,
      kind: "refund",
      recipientRole: "seller",
      recipientEmail: row.seller.contactEmail,
      message,
    }),
  ];
  if (succeeded) {
    statements.push(
      d1
        .prepare(
          `UPDATE orders SET refunded_amount_cents = ?, payment_status = ?,
          stripe_refund_id = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          newRefundedAmount,
          full ? "refunded" : "partially_refunded",
          refund.id,
          now,
          row.order.id,
        ),
    );
  }
  await d1.batch(statements);
  await safelyDeliverResolutionNotifications([
    buyerNotificationId,
    sellerNotificationId,
  ]);
  return { caseId, status, refundId: refund.id, refundStatus: refund.status };
}

export async function getResolutionFileForAdmin(fileId: string) {
  const rows = await getDb()
    .select({
      id: resolutionFiles.id,
      storageKey: resolutionFiles.storageKey,
      originalName: resolutionFiles.originalName,
      mimeType: resolutionFiles.mimeType,
    })
    .from(resolutionFiles)
    .where(eq(resolutionFiles.id, fileId))
    .limit(1);
  return rows[0] ?? null;
}

async function requireCaseAccess(userId: string, caseId: string) {
  const rows = await getDb()
    .select({ case: resolutionCases, order: orders, seller: sellers })
    .from(resolutionCases)
    .innerJoin(orders, eq(resolutionCases.orderId, orders.id))
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(eq(resolutionCases.id, caseId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ValidationError("Resolution case not found.");
  if (row.order.buyerUserId === userId)
    return { ...row, role: "buyer" as const };
  if (row.seller.ownerUserId === userId)
    return { ...row, role: "seller" as const };
  throw new ValidationError("You do not have access to this case.");
}

async function requireBuyerCaseAccess(userId: string, caseId: string) {
  const access = await requireCaseAccess(userId, caseId);
  if (access.role !== "buyer")
    throw new ValidationError("Only the buyer can take this action.");
  return access;
}

async function requireSellerCaseAccess(userId: string, caseId: string) {
  const access = await requireCaseAccess(userId, caseId);
  if (access.role !== "seller")
    throw new ValidationError("Only the order seller can take this action.");
  return access;
}

function assertCaseOpen(status: string) {
  if (closedStatuses.has(status))
    throw new ValidationError("This case is closed and cannot be changed.");
}

async function storeResolutionFiles(input: {
  storage: ResolutionStorage;
  caseId: string;
  files: File[];
}) {
  const prepared: PreparedFile[] = [];
  try {
    for (const file of input.files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = detectResolutionFileType(bytes, file.type);
      if (!detected)
        throw new ValidationError("Evidence must be a PDF, JPG, PNG, or WebP file.");
      if (bytes.length < 1 || bytes.length > MAX_RESOLUTION_FILE_BYTES)
        throw new ValidationError("Each evidence or label file must be 10 MB or smaller.");
      const id = crypto.randomUUID();
      const storageKey = `resolution/${input.caseId}/${id}.${detected.extension}`;
      await input.storage.put(storageKey, bytes.buffer as ArrayBuffer, {
        httpMetadata: { contentType: detected.mimeType },
      });
      prepared.push({
        id,
        storageKey,
        originalName: safeFileName(file.name),
        mimeType: detected.mimeType,
        sizeBytes: bytes.length,
      });
    }
    return prepared;
  } catch (error) {
    await Promise.allSettled(
      prepared.map((file) => input.storage.delete(file.storageKey)),
    );
    throw error;
  }
}

function detectResolutionFileType(bytes: Uint8Array, declaredMime: string) {
  if (
    declaredMime === "application/pdf" &&
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  )
    return { mimeType: "application/pdf", extension: "pdf" };
  if (
    declaredMime === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return { mimeType: "image/jpeg", extension: "jpg" };
  if (
    declaredMime === "image/png" &&
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  )
    return { mimeType: "image/png", extension: "png" };
  if (
    declaredMime === "image/webp" &&
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return { mimeType: "image/webp", extension: "webp" };
  return null;
}

function safeFileName(value: string) {
  const cleaned = value.replace(/[\\/\0\r\n]/g, "_").trim().slice(0, 180);
  return cleaned || "evidence";
}

function formatRefundAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
