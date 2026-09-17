import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  availabilityAlerts,
  orderItems,
  orders,
  products,
  sellers,
} from "@/db/schema";
import { config } from "./config";
import { sendEmail } from "./email";
import { unsubscribeUrl } from "./email-preferences";
import { isEmail, normalizeEmail, ValidationError } from "./validation";
import { addBusinessDays } from "./reputation-rules";
import {
  preorderShipAnchor,
  type AvailabilityType,
} from "./availability-rules";

export {
  parseProductAvailability,
  productIsPreorder,
} from "./availability-rules";
export type { AvailabilityType } from "./availability-rules";

export async function subscribeToRestock(input: {
  productId: string;
  email: unknown;
  userId?: string | null;
}) {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new ValidationError("Enter a valid email address.");
  const db = getDb();
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      status: products.status,
      inventoryQuantity: products.inventoryQuantity,
      reservedQuantity: products.reservedQuantity,
      sellerStatus: sellers.status,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.id, input.productId), eq(sellers.status, "active")))
    .limit(1);
  const product = rows[0];
  if (!product || !["active", "sold_out"].includes(product.status)) {
    throw new ValidationError("This model is not available for restock alerts.");
  }
  if (product.inventoryQuantity - product.reservedQuantity > 0) {
    return { subscribed: false as const, available: true as const, slug: product.slug };
  }
  const now = new Date().toISOString();
  await db
    .insert(availabilityAlerts)
    .values({
      id: crypto.randomUUID(),
      productId: product.id,
      userId: input.userId ?? null,
      email,
      unsubscribeToken: crypto.randomUUID(),
      status: "active",
      consentAt: now,
    })
    .onConflictDoUpdate({
      target: [availabilityAlerts.productId, availabilityAlerts.email],
      set: {
        userId: input.userId ?? null,
        unsubscribeToken: crypto.randomUUID(),
        status: "active",
        consentAt: now,
        notifiedAt: null,
        updatedAt: now,
      },
    });
  return { subscribed: true as const, available: false as const, slug: product.slug };
}

export async function unsubscribeAvailabilityAlert(token: string) {
  if (!token || token.length > 100) return false;
  const result = await getDb()
    .update(availabilityAlerts)
    .set({ status: "unsubscribed", updatedAt: new Date().toISOString() })
    .where(eq(availabilityAlerts.unsubscribeToken, token));
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function notifyRestockSubscribers(productId: string) {
  const db = getDb();
  const productRows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      priceCents: products.priceCents,
      currency: products.currency,
      inventoryQuantity: products.inventoryQuantity,
      reservedQuantity: products.reservedQuantity,
      sellerName: sellers.storeName,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.id, productId), eq(sellers.status, "active")))
    .limit(1);
  const product = productRows[0];
  if (!product || product.inventoryQuantity - product.reservedQuantity < 1) {
    return { notified: 0 };
  }
  const alerts = await db
    .select()
    .from(availabilityAlerts)
    .where(
      and(
        eq(availabilityAlerts.productId, productId),
        eq(availabilityAlerts.status, "active"),
      ),
    );
  let notified = 0;
  for (const alert of alerts) {
    try {
      const productUrl = `${config.siteUrl}/products/${encodeURIComponent(product.slug)}`;
      const stopUrl = await unsubscribeUrl("restock", alert.unsubscribeToken);
      const result = await sendEmail({
        to: alert.email,
        subject: `${product.title} is back in stock`,
        html: `<h1>Back in stock</h1><p><strong>${escapeHtml(product.title)}</strong> from ${escapeHtml(product.sellerName)} is available again.</p><p><a href="${escapeHtml(productUrl)}">View the model</a></p>`,
        text: `${product.title} from ${product.sellerName} is back in stock.\n${productUrl}`,
        unsubscribeUrl: stopUrl,
        idempotencyKey: `restock-${alert.id}-${product.inventoryQuantity}-${product.reservedQuantity}`,
      });
      if (!result.sent) continue;
      await db
        .update(availabilityAlerts)
        .set({
          status: "notified",
          notifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(availabilityAlerts.id, alert.id),
            eq(availabilityAlerts.status, "active"),
          ),
        );
      notified += 1;
    } catch (error) {
      console.error(`Restock alert ${alert.id} could not be sent.`, error);
    }
  }
  return { notified };
}

export async function syncPreorderReleaseSchedule(input: {
  productId: string;
  title: string;
  previousAvailabilityType: AvailabilityType;
  previousReleaseDate: string | null;
  availabilityType: AvailabilityType;
  releaseDate: string | null;
  handlingTimeBusinessDays: number;
}) {
  if (
    input.previousAvailabilityType !== "preorder" ||
    (input.availabilityType === "preorder" &&
      input.previousReleaseDate === input.releaseDate)
  ) {
    return { ordersUpdated: 0, notificationsSent: 0 };
  }
  const db = getDb();
  const affected = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      buyerEmail: orders.buyerEmail,
      paidAt: orders.paidAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orderItems.productId, input.productId),
        inArray(orders.paymentStatus, ["paid", "partially_refunded"]),
        inArray(orders.fulfillmentStatus, ["unfulfilled", "processing"]),
      ),
    );
  if (!affected.length) return { ordersUpdated: 0, notificationsSent: 0 };

  await db
    .update(orderItems)
    .set({
      availabilityTypeSnapshot: input.availabilityType,
      releaseDateSnapshot: input.releaseDate,
    })
    .where(
      and(
        eq(orderItems.productId, input.productId),
        inArray(
          orderItems.orderId,
          affected.map((order) => order.orderId),
        ),
      ),
    );

  const uniqueOrders = [...new Map(affected.map((order) => [order.orderId, order])).values()];
  let notificationsSent = 0;
  for (const order of uniqueOrders) {
    const itemSchedules = await db
      .select({
        availabilityType: orderItems.availabilityTypeSnapshot,
        releaseDate: orderItems.releaseDateSnapshot,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.orderId));
    const releaseAnchor = preorderShipAnchor(
      itemSchedules.map((item) =>
        item.availabilityType === "preorder" ? item.releaseDate : null,
      ),
    );
    const paidAt = order.paidAt ? new Date(order.paidAt) : new Date();
    const now = new Date();
    const base = releaseAnchor && releaseAnchor > now ? releaseAnchor : now;
    const shipByAt = addBusinessDays(
      base > paidAt ? base : paidAt,
      input.handlingTimeBusinessDays,
    );
    await db
      .update(orders)
      .set({ shipByAt: shipByAt.toISOString(), updatedAt: now.toISOString() })
      .where(eq(orders.id, order.orderId));

    const released = input.availabilityType === "in_stock";
    const releaseLabel = input.releaseDate
      ? formatReleaseDate(input.releaseDate)
      : "now";
    try {
      const result = await sendEmail({
        to: order.buyerEmail,
        subject: released
          ? `${input.title} has been released`
          : `Release date update for ${input.title}`,
        html: released
          ? `<h1>Your preorder has been released</h1><p><strong>${escapeHtml(input.title)}</strong> in order ${escapeHtml(order.orderNumber)} is now released. The seller is preparing it for shipment.</p><p><a href="${escapeHtml(`${config.siteUrl}/account`)}">View your order</a></p>`
          : `<h1>Release date updated</h1><p>The expected release date for <strong>${escapeHtml(input.title)}</strong> in order ${escapeHtml(order.orderNumber)} is now <strong>${escapeHtml(releaseLabel)}</strong>.</p><p>Release dates can change. Your seller’s fulfillment schedule has been updated automatically.</p><p><a href="${escapeHtml(`${config.siteUrl}/account`)}">View your order</a></p>`,
        text: released
          ? `${input.title} in order ${order.orderNumber} has been released. The seller is preparing it for shipment.\n${config.siteUrl}/account`
          : `The expected release date for ${input.title} in order ${order.orderNumber} is now ${releaseLabel}. Your fulfillment schedule has been updated.\n${config.siteUrl}/account`,
        idempotencyKey: `release-${order.orderId}-${input.productId}-${input.availabilityType}-${input.releaseDate ?? "released"}`,
      });
      if (result.sent) notificationsSent += 1;
    } catch (error) {
      console.error(`Release update for order ${order.orderId} could not be sent.`, error);
    }
  }
  return { ordersUpdated: uniqueOrders.length, notificationsSent };
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
