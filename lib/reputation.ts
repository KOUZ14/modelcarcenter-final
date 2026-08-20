import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  collectorProfiles,
  orders,
  resolutionCases,
  sellerFeedback,
  sellers,
} from "@/db/schema";
import {
  canLeaveVerifiedFeedback,
  percentage,
  publicCollectorName,
} from "./reputation-rules";
import {
  integer,
  requiredString,
  ValidationError,
} from "./validation";

export type SellerReputation = {
  completedTransactions: number;
  onTimeShipmentRate: number | null;
  onTimeShipments: number;
  trackedShipments: number;
  sellerSince: string;
  handlingTimeBusinessDays: number;
  feedbackCount: number;
  averageRating: number | null;
  totalCases: number;
  resolvedCases: number;
  recentFeedback: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    buyerName: string;
  }>;
};

export async function getSellerReputation(
  sellerId: string,
): Promise<SellerReputation | null> {
  const db = getDb();
  const [sellerRows, completedRows, shippingRows, caseRows, feedbackRows, recentRows] =
    await Promise.all([
      db
        .select({
          createdAt: sellers.createdAt,
          handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
        })
        .from(sellers)
        .where(eq(sellers.id, sellerId))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(
          and(
            eq(orders.sellerId, sellerId),
            inArray(orders.paymentStatus, ["paid", "partially_refunded"]),
            inArray(orders.fulfillmentStatus, ["shipped", "delivered"]),
          ),
        ),
      db
        .select({
          tracked: sql<number>`count(*)`,
          onTime: sql<number>`coalesce(sum(case when julianday(${orders.shippedAt}) <= julianday(${orders.shipByAt}) then 1 else 0 end), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.sellerId, sellerId),
            isNotNull(orders.shippedAt),
            isNotNull(orders.shipByAt),
          ),
        ),
      db
        .select({
          total: sql<number>`count(*)`,
          resolved: sql<number>`coalesce(sum(case when ${resolutionCases.status} in ('resolved', 'closed', 'denied') then 1 else 0 end), 0)`,
        })
        .from(resolutionCases)
        .innerJoin(orders, eq(resolutionCases.orderId, orders.id))
        .where(eq(orders.sellerId, sellerId)),
      db
        .select({
          count: sql<number>`count(*)`,
          average: sql<number | null>`avg(${sellerFeedback.rating})`,
        })
        .from(sellerFeedback)
        .where(eq(sellerFeedback.sellerId, sellerId)),
      db
        .select({
          id: sellerFeedback.id,
          rating: sellerFeedback.rating,
          comment: sellerFeedback.comment,
          createdAt: sellerFeedback.createdAt,
          displayName: collectorProfiles.displayName,
        })
        .from(sellerFeedback)
        .leftJoin(
          collectorProfiles,
          eq(sellerFeedback.buyerUserId, collectorProfiles.userId),
        )
        .where(eq(sellerFeedback.sellerId, sellerId))
        .orderBy(desc(sellerFeedback.createdAt))
        .limit(6),
    ]);
  const seller = sellerRows[0];
  if (!seller) return null;
  const trackedShipments = Number(shippingRows[0]?.tracked ?? 0);
  const onTimeShipments = Number(shippingRows[0]?.onTime ?? 0);
  const feedbackCount = Number(feedbackRows[0]?.count ?? 0);
  const average = feedbackRows[0]?.average;
  return {
    completedTransactions: Number(completedRows[0]?.count ?? 0),
    onTimeShipmentRate: percentage(onTimeShipments, trackedShipments),
    onTimeShipments,
    trackedShipments,
    sellerSince: seller.createdAt,
    handlingTimeBusinessDays: seller.handlingTimeBusinessDays,
    feedbackCount,
    averageRating:
      feedbackCount && average != null ? Math.round(Number(average) * 10) / 10 : null,
    totalCases: Number(caseRows[0]?.total ?? 0),
    resolvedCases: Number(caseRows[0]?.resolved ?? 0),
    recentFeedback: recentRows.map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      createdAt: item.createdAt,
      buyerName: publicCollectorName(item.displayName),
    })),
  };
}

export async function saveVerifiedPurchaseFeedback(
  buyerUserId: string,
  payload: Record<string, unknown>,
) {
  const orderId = requiredString(payload.orderId, "orderId", 100);
  const rating = integer(payload.rating, "rating", 1, 5);
  const comment = requiredString(payload.comment, "comment", 1_000);
  if (comment.length < 10)
    throw new ValidationError("Feedback must be at least 10 characters.");
  const db = getDb();
  const orderRows = await db
    .select({
      id: orders.id,
      sellerId: orders.sellerId,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.buyerUserId, buyerUserId)))
    .limit(1);
  const order = orderRows[0];
  if (!order)
    throw new ValidationError("This order is not connected to your account.");
  if (!canLeaveVerifiedFeedback(order))
    throw new ValidationError(
      "Verified feedback is available after the seller ships your paid order.",
    );
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .insert(sellerFeedback)
    .values({
      id,
      orderId,
      sellerId: order.sellerId,
      buyerUserId,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sellerFeedback.orderId,
      set: { rating, comment, updatedAt: now },
    });
  return { feedback: { orderId, rating, comment, updatedAt: now } };
}
