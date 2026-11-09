import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { availabilityAlerts, orders, products, resolutionCases, wantedRequests, wishlistItems } from "@/db/schema";
import { isTrending, matchWantDemand, type DemandProduct } from "./seller-hub";

export async function getSellerHubDemand(sellerId: string, ownerUserId: string, inventory: DemandProduct[], now: Date) {
  const db = getDb();
  const recent = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const previous = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const results = await Promise.all([
    db.select({
      productId: wishlistItems.productId,
      saves: sql<number>`count(*)`.mapWith(Number),
      recent: sql<number>`sum(case when julianday(${wishlistItems.createdAt}) >= julianday(${recent}) then 1 else 0 end)`.mapWith(Number),
      previous: sql<number>`sum(case when julianday(${wishlistItems.createdAt}) >= julianday(${previous}) and julianday(${wishlistItems.createdAt}) < julianday(${recent}) then 1 else 0 end)`.mapWith(Number),
    }).from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId))
      .where(and(eq(products.sellerId, sellerId), ne(products.status, "rejected"), ne(wishlistItems.userId, ownerUserId))).groupBy(wishlistItems.productId),
    db.select({ count: sql<number>`count(distinct ${wishlistItems.userId})`.mapWith(Number) })
      .from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId))
      .where(and(eq(products.sellerId, sellerId), ne(products.status, "rejected"), ne(wishlistItems.userId, ownerUserId))),
    db.select({ productId: availabilityAlerts.productId, subscribers: sql<number>`count(*)`.mapWith(Number) })
      .from(availabilityAlerts).innerJoin(products, eq(products.id, availabilityAlerts.productId))
      .where(and(eq(products.sellerId, sellerId), ne(products.status, "rejected"), eq(availabilityAlerts.status, "active"))).groupBy(availabilityAlerts.productId),
    // Only aggregate model preferences leave the server; buyer contacts and notes remain private.
    db.select({
      vehicleMake: wantedRequests.vehicleMake, vehicleModel: wantedRequests.vehicleModel,
      preferredScale: wantedRequests.preferredScale, modelManufacturer: wantedRequests.modelManufacturer,
      color: wantedRequests.color, conditionPreference: wantedRequests.conditionPreference,
      maxBudgetCents: wantedRequests.maxBudgetCents, requests: sql<number>`count(*)`.mapWith(Number),
    }).from(wantedRequests).where(inArray(wantedRequests.status, ["open", "possible_match"]))
      .groupBy(wantedRequests.vehicleMake, wantedRequests.vehicleModel, wantedRequests.preferredScale, wantedRequests.modelManufacturer, wantedRequests.color, wantedRequests.conditionPreference, wantedRequests.maxBudgetCents),
    db.select({ orderId: resolutionCases.orderId }).from(resolutionCases)
      .innerJoin(orders, eq(orders.id, resolutionCases.orderId))
      .where(and(eq(orders.sellerId, sellerId), eq(resolutionCases.requestedResolution, "return_refund"))),
  ]);
  const [saves, buyers, restocks, wants, returns] = results;
  return {
    savedBuyers: buyers[0]?.count ?? 0,
    products: inventory.filter((product) => product.status !== "rejected").map((product) => {
      const interest = saves.find((row) => row.productId === product.id);
      return {
        productId: product.id, saves: interest?.saves ?? 0,
        recent: interest?.recent ?? 0, previous: interest?.previous ?? 0,
        trending: isTrending(interest?.recent ?? 0, interest?.previous ?? 0),
        restockSubscribers: restocks.find((row) => row.productId === product.id)?.subscribers ?? 0,
      };
    }).filter((row) => row.saves > 0 || row.restockSubscribers > 0).sort((a, b) => b.saves - a.saves),
    wants: wants.map((want) => ({ ...want, productIds: matchWantDemand(want, inventory) })).sort((a, b) => b.requests - a.requests),
    returnOrderIds: [...new Set(returns.map((row) => row.orderId))],
  };
}

export type SellerHubDemand = Awaited<ReturnType<typeof getSellerHubDemand>>;
