import { and, eq, inArray, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  orders,
  sellers,
  shipmentOrders,
  shipments,
  shippingQuotes,
  trackingEvents,
} from "@/db/schema";
import { config } from "./config";
import { sendLabelCreatedEmail, sendShipmentEmail } from "./email";
import {
  createShippoShipment,
  purchaseShippoLabel,
  retrieveShippoTracking,
  retrieveShippoTransaction,
  ShippoApiError,
  type ShippoRate,
  type ShippoTracking,
  type ShippoTrackingEvent,
} from "./shippo";
import {
  highValueShippingRules,
  mapShippoTrackingStatus,
  parseParcel,
  parseStoredShippingAddress,
  rateMeetsShippingRequirement,
  shippingAddressKey,
} from "./shipping-rules";
import { cleanText, ValidationError } from "./validation";
import {
  parseStoredShipFromAddress,
  shipFromAddressKey,
} from "./ship-from-address";
import {
  reportDeadlineForOrder,
} from "./protection";

const MAX_COMBINED_ORDERS = 10;

export async function quoteOwnedOrders(
  userId: string,
  payload: Record<string, unknown>,
) {
  const orderIds = parseOrderIds(payload.orderIds);
  const rows = await loadOwnedOrders(userId, orderIds);
  const { store, origin, recipient, declaredValueCents } = validateOrdersForShipment(
    rows,
    orderIds,
  );
  const parcel = parseParcel(payload);
  const rules = highValueShippingRules(
    declaredValueCents,
    config.shippoInsuranceThresholdCents,
    config.shippoSignatureThresholdCents,
  );
  const metadata = `MCC ${rows.map((row) => row.order.orderNumber).join(",")}`;
  const result = await createShippoShipment({
    from: {
      name: store.contactName,
      company: store.storeName,
      street1: origin.street1,
      street2: origin.street2 ?? undefined,
      city: origin.city,
      state: origin.region ?? "",
      zip: origin.postalCode,
      country: origin.country,
      phone: origin.phone,
      email: store.contactEmail,
    },
    to: { ...recipient, email: rows[0].order.buyerEmail },
    parcel,
    metadata,
    insuranceAmountCents: rules.insuranceRequired ? declaredValueCents : 0,
    signatureRequired: rules.signatureRequired,
  });
  const requirements = selectedServiceRequirements(rows);
  const allowedRates = result.rates.filter(
    (rate) =>
      rate.amountCents <= config.shippoMaxLabelCostCents &&
      requirements.every((requirement) =>
        rateMeetsShippingRequirement(rate, requirement),
      ),
  );
  if (!allowedRates.length)
    throw new ValidationError(
      requirements.length
        ? "No current label matches or improves on the buyer-selected service. Refresh later or add compliant tracking manually."
        : "Available labels exceed the marketplace purchase limit. Buy a label elsewhere and add tracking manually.",
    );
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.shippoQuoteExpirationMinutes * 60_000,
  ).toISOString();
  const quoteId = crypto.randomUUID();
  await getDb().insert(shippingQuotes).values({
    id: quoteId,
    sellerId: store.id,
    createdByUserId: userId,
    shippoShipmentId: result.shippoShipmentId,
    orderIds: JSON.stringify(orderIds),
    rates: JSON.stringify(allowedRates),
    parcelLength: parcel.length,
    parcelWidth: parcel.width,
    parcelHeight: parcel.height,
    parcelWeight: parcel.weight,
    declaredValueCents,
    insuranceRequired: rules.insuranceRequired,
    signatureRequired: rules.signatureRequired,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return {
    quote: {
      id: quoteId,
      expiresAt,
      orderNumbers: rows.map((row) => row.order.orderNumber),
      declaredValueCents,
      insuranceRequired: rules.insuranceRequired,
      signatureRequired: rules.signatureRequired,
      parcel,
      selectedServices: requirements,
      rates: allowedRates,
    },
  };
}

export async function purchaseOwnedLabel(
  userId: string,
  payload: Record<string, unknown>,
) {
  const quoteId = cleanText(payload.quoteId, 100);
  const rateId = cleanText(payload.rateId, 100);
  if (!quoteId || !rateId) throw new ValidationError("Choose a current carrier rate.");
  const quoteRows = await getDb()
    .select({ quote: shippingQuotes, store: sellers })
    .from(shippingQuotes)
    .innerJoin(sellers, eq(shippingQuotes.sellerId, sellers.id))
    .where(
      and(
        eq(shippingQuotes.id, quoteId),
        eq(sellers.ownerUserId, userId),
      ),
    )
    .limit(1);
  const row = quoteRows[0];
  if (!row) throw new ValidationError("Shipping quote not found.");
  if (new Date(row.quote.expiresAt).getTime() <= Date.now()) {
    await getDb()
      .update(shippingQuotes)
      .set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(shippingQuotes.id, quoteId));
    throw new ValidationError("That shipping quote expired. Request fresh rates.");
  }
  const rates = parseStoredRates(row.quote.rates);
  const rate = rates.find((candidate) => candidate.id === rateId);
  if (!rate)
    throw new ValidationError("The selected rate does not belong to this shipping quote.");
  if (rate.amountCents > config.shippoMaxLabelCostCents)
    throw new ValidationError("The selected label exceeds the marketplace purchase limit.");
  const orderIds = parseStoredOrderIds(row.quote.orderIds);
  const orderRows = await loadOwnedOrders(userId, orderIds);
  validateOrdersForShipment(orderRows, orderIds);
  const requirements = selectedServiceRequirements(orderRows);
  if (
    !requirements.every((requirement) =>
      rateMeetsShippingRequirement(rate, requirement),
    )
  )
    throw new ValidationError(
      "The selected label would downgrade the buyer-selected shipping service. Request fresh rates.",
    );

  const now = new Date().toISOString();
  const claimed = await getDb()
    .update(shippingQuotes)
    .set({ status: "purchasing", updatedAt: now })
    .where(
      and(
        eq(shippingQuotes.id, quoteId),
        eq(shippingQuotes.status, "quoted"),
      ),
    )
    .returning({ id: shippingQuotes.id });
  if (!claimed[0])
    throw new ValidationError("This quote is already being purchased or has been used.");

  let transaction;
  try {
    transaction = await purchaseShippoLabel(
      rateId,
      `MCC ${orderRows.map((item) => item.order.orderNumber).join(",")}`,
    );
  } catch (error) {
    await markQuoteFailed(quoteId);
    throw error;
  }
  if (
    transaction.status !== "SUCCESS" ||
    transaction.object_state === "INVALID" ||
    !transaction.object_id ||
    !transaction.tracking_number
  ) {
    await markQuoteFailed(quoteId);
    const details = (transaction.messages ?? [])
      .map((message) => message.text?.trim())
      .filter(Boolean)
      .join(" ");
    throw new ShippoApiError(details ? `Shippo: ${details}` : "Shippo did not create the label.");
  }

  const shipmentId = crypto.randomUUID();
  const trackingUrl = safeHttpsUrl(transaction.tracking_url_provider);
  const trackingStatus = mapShippoTrackingStatus(transaction.tracking_status);
  const shipmentStatus =
    trackingStatus === "unknown" ? "label_created" : trackingStatus;
  const statements = [
    getD1()
      .prepare(`INSERT INTO shipments
        (id, seller_id, quote_id, shippo_shipment_id, shippo_transaction_id, shippo_rate_id,
         carrier, service_level, rate_amount_cents, currency, parcel_length, parcel_width,
         parcel_height, parcel_weight, declared_value_cents, insurance_required, signature_required,
         tracking_number, tracking_url, label_file_type, status, status_details, eta, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PDF_4x6', ?, '', ?, ?, ?)`)
      .bind(
        shipmentId,
        row.store.id,
        quoteId,
        row.quote.shippoShipmentId,
        transaction.object_id,
        rate.id,
        rate.provider,
        rate.serviceLevel,
        rate.amountCents,
        rate.currency,
        row.quote.parcelLength,
        row.quote.parcelWidth,
        row.quote.parcelHeight,
        row.quote.parcelWeight,
        row.quote.declaredValueCents,
        row.quote.insuranceRequired ? 1 : 0,
        row.quote.signatureRequired ? 1 : 0,
        transaction.tracking_number,
        trackingUrl,
        shipmentStatus,
        transaction.eta ?? null,
        now,
        now,
      ),
    getD1()
      .prepare("UPDATE shipping_quotes SET status = 'purchased', updated_at = ? WHERE id = ? AND status = 'purchasing'")
      .bind(now, quoteId),
    getD1()
      .prepare(`INSERT INTO tracking_events
        (id, shipment_id, event_key, status, status_details, status_date, location, source)
        VALUES (?, ?, ?, 'LABEL_CREATED', 'Shipping label purchased', ?, '{}', 'label')`)
      .bind(
        crypto.randomUUID(),
        shipmentId,
        `${shipmentId}:label-created`,
        now,
      ),
  ];
  for (const orderId of orderIds) {
    statements.push(
      getD1()
        .prepare("INSERT INTO shipment_orders (id, shipment_id, order_id) VALUES (?, ?, ?)")
        .bind(crypto.randomUUID(), shipmentId, orderId),
      getD1()
        .prepare(`UPDATE orders SET carrier = ?, tracking_number = ?, fulfillment_status = 'processing', updated_at = ?
          WHERE id = ? AND seller_id = ? AND fulfillment_status = 'unfulfilled'`)
        .bind(rate.provider, transaction.tracking_number, now, orderId, row.store.id),
    );
  }
  await getD1().batch(statements);
  await Promise.allSettled(
    orderRows.map(({ order }) =>
      sendLabelCreatedEmail({
        buyerEmail: order.buyerEmail,
        orderNumber: order.orderNumber,
        carrier: rate.provider,
        trackingNumber: transaction.tracking_number!,
        trackingUrl,
      }),
    ),
  );
  return {
    shipment: {
      id: shipmentId,
      carrier: rate.provider,
      serviceLevel: rate.serviceLevel,
      trackingNumber: transaction.tracking_number,
      trackingUrl,
      labelUrl: `/api/shipping/label?shipment_id=${encodeURIComponent(shipmentId)}`,
      combinedOrderCount: orderIds.length,
    },
  };
}

export async function syncOwnedShipment(userId: string, shipmentId: string) {
  const row = await loadOwnedShipment(userId, shipmentId);
  const tracking = await retrieveShippoTracking(
    row.shipment.carrier,
    row.shipment.trackingNumber,
  );
  await recordTrackingUpdate(row.shipment, tracking, "poll");
  return { shipmentId, synced: true };
}

export async function getOwnedLabelUrl(userId: string, shipmentId: string) {
  const row = await loadOwnedShipment(userId, shipmentId);
  const transaction = await retrieveShippoTransaction(
    row.shipment.shippoTransactionId,
  );
  if (transaction.status !== "SUCCESS" || !transaction.label_url)
    throw new ShippoApiError("The Shippo label is not available yet.");
  const url = new URL(transaction.label_url);
  if (url.protocol !== "https:")
    throw new ShippoApiError("Shippo returned an invalid label URL.");
  return url.toString();
}

export async function processShippoTrackingWebhook(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ValidationError("Invalid Shippo webhook payload.");
  const webhook = payload as {
    event?: string;
    test?: boolean;
    data?: ShippoTracking;
  };
  if (webhook.event !== "track_updated" || !webhook.data)
    return { ignored: true };
  if (config.shippoApiKey.startsWith("shippo_test_") && webhook.test === false)
    throw new ValidationError("Live Shippo events cannot update a test-mode integration.");
  const data = webhook.data;
  const db = getDb();
  const rows = data.transaction
    ? await db
        .select()
        .from(shipments)
        .where(eq(shipments.shippoTransactionId, data.transaction))
        .limit(1)
    : data.carrier && data.tracking_number
      ? await db
          .select()
          .from(shipments)
          .where(
            and(
              sql`lower(${shipments.carrier}) = ${data.carrier.toLowerCase()}`,
              eq(shipments.trackingNumber, data.tracking_number),
            ),
          )
          .limit(1)
      : [];
  if (!rows[0]) {
    const directOrders =
      data.carrier && data.tracking_number
        ? await db
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                sql`lower(${orders.carrier}) = ${data.carrier.toLowerCase()}`,
                eq(orders.trackingNumber, data.tracking_number),
              ),
            )
        : [];
    if (!directOrders.length) return { ignored: true };
    await recordOrderTrackingUpdate(
      directOrders.map((order) => order.id),
      data,
    );
    return { updated: true, orderIds: directOrders.map((order) => order.id) };
  }
  await recordTrackingUpdate(rows[0], data, "webhook");
  return { updated: true, shipmentId: rows[0].id };
}

async function recordTrackingUpdate(
  shipment: typeof shipments.$inferSelect,
  tracking: ShippoTracking,
  source: "poll" | "webhook",
) {
  const history = [...(tracking.tracking_history ?? [])];
  if (tracking.tracking_status) history.push(tracking.tracking_status);
  const unique = new Map<string, ShippoTrackingEvent>();
  for (const event of history) {
    const statusDate = validDate(event.status_date) ?? new Date().toISOString();
    const key =
      cleanText(event.object_id, 200) ||
      `${shipment.id}:${String(event.status ?? "UNKNOWN").toUpperCase()}:${statusDate}`;
    unique.set(key, { ...event, status_date: statusDate });
  }
  const db = getDb();
  for (const [eventKey, event] of unique) {
    await db
      .insert(trackingEvents)
      .values({
        id: crypto.randomUUID(),
        shipmentId: shipment.id,
        eventKey,
        status: String(event.status ?? "UNKNOWN").toUpperCase(),
        statusDetails:
          cleanText(event.status_details, 1_000) ||
          cleanText(event.substatus?.text, 1_000),
        statusDate: event.status_date!,
        location: JSON.stringify(event.location ?? {}),
        source,
      })
      .onConflictDoNothing();
  }
  const latest = tracking.tracking_status ?? history.at(-1);
  if (!latest) return;
  const nextStatus = mapShippoTrackingStatus(latest.status);
  const now = new Date().toISOString();
  const eventAt = validDate(latest.status_date) ?? now;
  const startedTransit =
    nextStatus === "in_transit" &&
    !["in_transit", "delivered"].includes(shipment.status);
  await db
    .update(shipments)
    .set({
      status: nextStatus,
      statusDetails:
        cleanText(latest.status_details, 1_000) ||
        cleanText(latest.substatus?.text, 1_000),
      eta: validDate(tracking.eta) ?? shipment.eta,
      shippedAt:
        ["in_transit", "delivered"].includes(nextStatus) && !shipment.shippedAt
          ? validDate(latest.status_date) ?? now
          : shipment.shippedAt,
      deliveredAt:
        nextStatus === "delivered" && !shipment.deliveredAt
          ? eventAt
          : shipment.deliveredAt,
      updatedAt: now,
    })
    .where(eq(shipments.id, shipment.id));
  const links = await db
    .select({ orderId: shipmentOrders.orderId })
    .from(shipmentOrders)
    .where(eq(shipmentOrders.shipmentId, shipment.id));
  const orderIds = links.map((link) => link.orderId);
  if (!orderIds.length) return;
  await applyOrderTrackingStatus({
    orderIds,
    nextStatus,
    eventAt,
    now,
  });
  if (startedTransit) {
    const relatedOrders = await db
      .select({
        buyerEmail: orders.buyerEmail,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(inArray(orders.id, orderIds));
    await Promise.allSettled(
      relatedOrders.map((order) =>
        sendShipmentEmail({
          ...order,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
        }),
      ),
    );
  }
}

export async function recordOrderTrackingUpdate(
  orderIds: string[],
  tracking: ShippoTracking,
) {
  const history = tracking.tracking_history ?? [];
  const latest = tracking.tracking_status ?? history.at(-1);
  if (!latest || !orderIds.length) return;
  const nextStatus = mapShippoTrackingStatus(latest.status);
  const now = new Date().toISOString();
  const eventAt = validDate(latest.status_date) ?? now;
  await applyOrderTrackingStatus({
    orderIds,
    nextStatus,
    eventAt,
    now,
  });
}

async function applyOrderTrackingStatus(input: {
  orderIds: string[];
  nextStatus: ReturnType<typeof mapShippoTrackingStatus>;
  eventAt: string;
  now: string;
}) {
  if (!["in_transit", "delivered"].includes(input.nextStatus)) return;
  const rows = await getDb().select().from(orders).where(inArray(orders.id, input.orderIds));
  for (const order of rows) {
    // A combined shipment can contain orders with different sold-under terms.
    const deliveryDeadline = input.nextStatus === "delivered"
      ? reportDeadlineForOrder({ ...order, deliveredAt: order.deliveredAt ?? input.eventAt }) : null;
    await getDb().update(orders).set({
      fulfillmentStatus: input.nextStatus === "delivered" ? "delivered" : sql`CASE WHEN ${orders.deliveredAt} IS NOT NULL THEN ${orders.fulfillmentStatus} ELSE 'shipped' END`,
      shippedAt: sql`COALESCE(${orders.shippedAt}, ${input.eventAt})`,
      deliveredAt: input.nextStatus === "delivered" ? sql`COALESCE(${orders.deliveredAt}, ${input.eventAt})` : orders.deliveredAt,
      refundRequestDeadline: input.nextStatus === "delivered" ? sql`COALESCE(${orders.refundRequestDeadline}, ${deliveryDeadline})` : orders.refundRequestDeadline,
      payoutEligibleAt: input.nextStatus === "delivered" ? sql`COALESCE(${orders.payoutEligibleAt}, ${deliveryDeadline})` : orders.payoutEligibleAt,
      updatedAt: input.now,
    }).where(eq(orders.id, order.id));
  }
}

async function loadOwnedOrders(userId: string, orderIds: string[]) {
  const db = getDb();
  const owned = await db
    .select({ order: orders })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(
      and(inArray(orders.id, orderIds), eq(sellers.ownerUserId, userId)),
    );
  if (!owned.length) return [];
  // Separate projections keep D1's 100-column result limit as records grow.
  const stores = await db.select().from(sellers).where(and(eq(sellers.ownerUserId, userId), inArray(sellers.id, [...new Set(owned.map(row => row.order.sellerId))])));
  return owned.flatMap(({ order }) => { const store = stores.find(row => row.id === order.sellerId); return store ? [{ order, store }] : []; });
}

function validateOrdersForShipment(
  rows: Awaited<ReturnType<typeof loadOwnedOrders>>,
  orderIds: string[],
) {
  if (rows.length !== orderIds.length)
    throw new ValidationError("One or more orders are unavailable or do not belong to this store.");
  const store = rows[0]?.store;
  if (!store) throw new ValidationError("Store not found.");
  if (new Set(rows.map(({ order }) => order.sellerId)).size !== 1)
    throw new ValidationError("Combined orders must belong to the same store.");
  for (const { order } of rows) {
    if (!['paid', 'partially_refunded'].includes(order.paymentStatus))
      throw new ValidationError("Only paid orders can be included in a shipment.");
    if (order.fulfillmentStatus !== "unfulfilled")
      throw new ValidationError("One of these orders is already in fulfillment.");
  }
  const addressKeys = new Set(
    rows.map(({ order }) =>
      shippingAddressKey(order.shippingAddress, order.buyerEmail),
    ),
  );
  if (addressKeys.size !== 1)
    throw new ValidationError("Combined shipping requires the same buyer email and delivery address.");
  if (new Set(rows.map(({ order }) => order.currency.toUpperCase())).size !== 1)
    throw new ValidationError("Combined orders must use the same currency.");
  if (rows[0].order.currency.toUpperCase() !== "USD")
    throw new ValidationError("Shippo label purchasing currently supports USD orders only.");
  const origins = rows.map(({ order }) =>
    parseStoredShipFromAddress(order.shipFromAddress, store),
  );
  if (new Set(origins.map(shipFromAddressKey)).size !== 1) {
    throw new ValidationError(
      "Combined shipping requires orders from the same ship-from address.",
    );
  }
  return {
    store,
    origin: origins[0],
    recipient: parseStoredShippingAddress(rows[0].order.shippingAddress),
    declaredValueCents: rows.reduce(
      (total, { order }) => total + order.subtotalCents,
      0,
    ),
  };
}

function selectedServiceRequirements(
  rows: Awaited<ReturnType<typeof loadOwnedOrders>>,
) {
  const unique = new Map<
    string,
    { carrier: string | null; serviceToken: string | null; estimatedDays: number | null }
  >();
  for (const { order } of rows) {
    if (order.shippingMode !== "calculated") continue;
    const requirement = {
      carrier: order.selectedShippingCarrier,
      serviceToken: order.selectedShippingServiceToken,
      estimatedDays: order.selectedShippingEstimatedDays,
    };
    if (!requirement.carrier && !requirement.serviceToken) continue;
    unique.set(
      `${requirement.carrier ?? ""}:${requirement.serviceToken ?? ""}:${requirement.estimatedDays ?? ""}`,
      requirement,
    );
  }
  return [...unique.values()];
}

function parseOrderIds(value: unknown) {
  if (!Array.isArray(value))
    throw new ValidationError("Choose at least one order to ship.");
  const ids = [...new Set(value.map((id) => cleanText(id, 100)).filter(Boolean))];
  if (!ids.length || ids.length > MAX_COMBINED_ORDERS)
    throw new ValidationError(`Choose between 1 and ${MAX_COMBINED_ORDERS} orders.`);
  return ids;
}

function parseStoredOrderIds(value: string) {
  try {
    return parseOrderIds(JSON.parse(value));
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("The stored quote contains invalid orders.");
  }
}

function parseStoredRates(value: string): ShippoRate[] {
  try {
    const parsed = JSON.parse(value) as ShippoRate[];
    if (!Array.isArray(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new ValidationError("The stored carrier rates are invalid. Request fresh rates.");
  }
}

async function loadOwnedShipment(userId: string, shipmentId: string) {
  const rows = await getDb()
    .select({ shipment: shipments, store: sellers })
    .from(shipments)
    .innerJoin(sellers, eq(shipments.sellerId, sellers.id))
    .where(
      and(eq(shipments.id, shipmentId), eq(sellers.ownerUserId, userId)),
    )
    .limit(1);
  if (!rows[0]) throw new ValidationError("Shipment not found.");
  return rows[0];
}

async function markQuoteFailed(quoteId: string) {
  await getDb()
    .update(shippingQuotes)
    .set({ status: "failed", updatedAt: new Date().toISOString() })
    .where(eq(shippingQuotes.id, quoteId));
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
