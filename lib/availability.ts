import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  availabilityAlerts,
  products,
  sellers,
} from "@/db/schema";
import { config } from "./config";
import { sendEmail } from "./email";
import { unsubscribeUrl } from "./email-preferences";
import { isEmail, normalizeEmail, ValidationError } from "./validation";
import {
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
      availabilityType: products.availabilityType,
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
  if (product.availabilityType !== "preorder" && product.inventoryQuantity - product.reservedQuantity > 0) {
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
      availabilityType: products.availabilityType,
      status: products.status,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.id, productId), eq(sellers.status, "active")))
    .limit(1);
  const product = productRows[0];
  if (!product || product.status !== "active") {
    return { notified: 0 };
  }
  const upcoming = product.availabilityType === "preorder";
  if (upcoming) {
    const { publicPreorderOffers } = await import("./preorders");
    if (!(await publicPreorderOffers(productId)).some(offer => offer.canReserve)) {
      return { notified: 0 };
    }
  } else if (product.inventoryQuantity - product.reservedQuantity < 1) {
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
      const heading = upcoming ? "Reservations are open" : "Back in stock";
      const message = upcoming
        ? `${product.title} from ${product.sellerName} is accepting unpaid reservations. Review the current offer and accept its terms to reserve. This alert has not reserved a unit or given you queue priority.`
        : `${product.title} from ${product.sellerName} is back in stock.`;
      const result = await sendEmail({
        to: alert.email,
        subject: `${product.title}: ${heading.toLowerCase()}`,
        html: `<h1>${heading}</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(productUrl)}">View the model</a></p>`,
        text: `${message}\n${productUrl}`,
        unsubscribeUrl: stopUrl,
        idempotencyKey: `availability-${alert.id}-${alert.unsubscribeToken}`,
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
  throw new ValidationError("Use the incoming batch notice and consent workflow to change a preorder estimate. Historical paid order snapshots cannot be rewritten.");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
