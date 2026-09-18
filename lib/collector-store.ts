import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  cartItems,
  carts,
  collectorProfiles,
  orderItems,
  orders,
  productImages,
  products,
  sellerFeedback,
  sellerAddresses,
  sellers,
  shipmentOrders,
  shipments,
  trackingEvents,
  wantedRequests,
  wishlistItems,
} from "@/db/schema";
import {
  mergeCartItems,
  uniqueWishlistIds,
} from "./account-rules";
import { loadAuthoritativeCartItems, type RequestedCartItem } from "./inventory";
import { POLICY_VERSION } from "./legal";
import { getVerifiedFeedbackEligibility } from "./reputation-rules";
import type { CartItem } from "./types";
import { normalizeEmail } from "./validation";

export type VerifiedCollectorUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

export async function ensureCollectorProfile(user: VerifiedCollectorUser) {
  const displayName =
    user.name.trim() || user.email.split("@")[0] || "Collector";
  await getDb()
    .insert(collectorProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      displayName: displayName.slice(0, 100),
      avatarUrl: user.image ?? null,
    })
    .onConflictDoNothing({ target: collectorProfiles.userId });
  const rows = await getDb()
    .select()
    .from(collectorProfiles)
    .where(eq(collectorProfiles.userId, user.id))
    .limit(1);
  if (!rows[0]) throw new Error("Collector profile could not be loaded.");
  return rows[0];
}

export async function claimGuestDataForUser(user: VerifiedCollectorUser) {
  if (!user.emailVerified) return { orders: 0, hunts: 0 };
  const email = normalizeEmail(user.email);
  const d1 = getD1();
  const [orderResult, huntResult] = await d1.batch([
    d1
      .prepare(
        `UPDATE orders SET buyer_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE buyer_user_id IS NULL AND lower(trim(buyer_email)) = ?`,
      )
      .bind(user.id, email),
    d1
      .prepare(
        `UPDATE wanted_requests SET user_id = ?
      WHERE user_id IS NULL AND lower(trim(collector_email)) = ?`,
      )
      .bind(user.id, email),
  ]);
  return {
    orders: Number(orderResult.meta?.changes ?? 0),
    hunts: Number(huntResult.meta?.changes ?? 0),
  };
}

const cartSelection = {
  productId: products.id,
  slug: products.slug,
  sellerId: products.sellerId,
  sellerName: sellers.storeName,
  title: products.title,
  scale: products.scale,
  modelManufacturer: products.modelManufacturer,
  imageUrl: products.primaryImageUrl,
  priceCents: products.priceCents,
  currency: products.currency,
  inventoryQuantity: products.inventoryQuantity,
  reservedQuantity: products.reservedQuantity,
  availabilityType: products.availabilityType,
  releaseDate: products.releaseDate,
  shippingCents: sellers.defaultShippingCents,
  shippingMode: sellers.shippingMode,
  sellerType: sellers.sellerType,
  quantity: cartItems.quantity,
};

export async function getAccountCart(userId: string): Promise<CartItem[]> {
  const rows = await getDb()
    .select(cartSelection)
    .from(carts)
    .innerJoin(cartItems, eq(carts.id, cartItems.cartId))
    .innerJoin(products, eq(cartItems.productId, products.id))
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(
      and(
        eq(carts.userId, userId),
        eq(products.status, "active"),
        eq(sellers.status, "active"),
        eq(sellers.sellerTermsVersion, POLICY_VERSION),
        isNotNull(sellers.sellerTermsAcceptedAt),
      ),
    )
    .orderBy(asc(cartItems.createdAt));
  return rows
    .map((row) => ({
      productId: row.productId,
      slug: row.slug,
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      title: row.title,
      scale: row.scale,
      modelManufacturer: row.modelManufacturer,
      imageUrl: row.imageUrl,
      priceCents: row.priceCents,
      currency: row.currency,
      availableQuantity: Math.max(
        0,
        row.inventoryQuantity - row.reservedQuantity,
      ),
      availabilityType: row.availabilityType,
      releaseDate: row.releaseDate,
      shippingCents: row.shippingCents,
      shippingMode: row.sellerType === "collector" ? "calculated" as const : row.shippingMode,
      quantity: Math.min(
        row.quantity,
        Math.max(0, row.inventoryQuantity - row.reservedQuantity),
      ),
    }))
    .filter((item) => item.availableQuantity > 0 && item.quantity > 0);
}

async function ensureCart(userId: string) {
  await getDb()
    .insert(carts)
    .values({ id: crypto.randomUUID(), userId })
    .onConflictDoNothing({ target: carts.userId });
  const rows = await getDb()
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  if (!rows[0]) throw new Error("Saved cart could not be created.");
  return rows[0].id;
}

function authoritativeToCart(
  input: Awaited<ReturnType<typeof loadAuthoritativeCartItems>>,
): CartItem[] {
  return input.map((item) => ({
    productId: item.id,
    slug: "",
    sellerId: item.sellerId,
    sellerName: item.sellerName,
    title: item.title,
    scale: item.scale,
    modelManufacturer: item.manufacturer,
    imageUrl: item.imageUrl,
    priceCents: item.priceCents,
    currency: item.currency,
    availableQuantity: item.inventoryQuantity - item.reservedQuantity,
    availabilityType: item.availabilityType,
    releaseDate: item.releaseDate,
    shippingCents: item.shippingCents,
    shippingMode: item.sellerType === "collector" ? "calculated" : item.shippingMode,
    quantity: item.quantity,
  }));
}

export async function saveAccountCart(
  userId: string,
  requested: RequestedCartItem[],
) {
  const cartId = await ensureCart(userId);
  if (!requested.length) {
    await getD1().batch([
      getD1().prepare("DELETE FROM cart_items WHERE cart_id = ?").bind(cartId),
      getD1()
        .prepare(
          "UPDATE carts SET seller_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(cartId),
    ]);
    return [];
  }
  const authoritative = await loadAuthoritativeCartItems(requested);
  const d1 = getD1();
  const statements = [
    d1.prepare("DELETE FROM cart_items WHERE cart_id = ?").bind(cartId),
    d1
      .prepare(
        "UPDATE carts SET seller_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(new Set(authoritative.map((item) => item.sellerId)).size === 1 ? authoritative[0].sellerId : null, cartId),
  ];
  for (const item of authoritative) {
    statements.push(
      d1
        .prepare(
          `INSERT INTO cart_items (id, cart_id, product_id, quantity)
      VALUES (?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), cartId, item.id, item.quantity),
    );
  }
  await d1.batch(statements);
  return getAccountCart(userId);
}

export async function setWishlistItem(
  userId: string,
  productId: string,
  saved: boolean,
) {
  if (!saved) {
    await getDb()
      .delete(wishlistItems)
      .where(
        and(
          eq(wishlistItems.userId, userId),
          eq(wishlistItems.productId, productId),
        ),
      );
    return;
  }
  const available = await getDb()
    .select({ id: products.id })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(
      and(
        eq(products.id, productId),
        eq(products.status, "active"),
        eq(sellers.status, "active"),
        eq(sellers.sellerTermsVersion, POLICY_VERSION),
        isNotNull(sellers.sellerTermsAcceptedAt),
      ),
    )
    .limit(1);
  if (!available[0])
    throw new Error("This model is no longer available to save.");
  await getDb()
    .insert(wishlistItems)
    .values({ id: crypto.randomUUID(), userId, productId })
    .onConflictDoNothing({
      target: [wishlistItems.userId, wishlistItems.productId],
    });
}

export async function getWishlistIds(userId: string) {
  const rows = await getDb()
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));
  return rows.map((row) => row.productId);
}

export async function mergeGuestData(
  userId: string,
  input: {
    wishlist: string[];
    cart: RequestedCartItem[];
  },
) {
  const wishlist = uniqueWishlistIds(input.wishlist);
  if (wishlist.length) {
    const valid = await getDb()
      .select({ id: products.id })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(
        and(
          inArray(products.id, wishlist),
          eq(products.status, "active"),
          eq(sellers.status, "active"),
          eq(sellers.sellerTermsVersion, POLICY_VERSION),
          isNotNull(sellers.sellerTermsAcceptedAt),
        ),
      );
    for (const item of valid) await setWishlistItem(userId, item.id, true);
  }
  let savedCart = await getAccountCart(userId);
  let guestCart: CartItem[] = [];
  if (input.cart.length) {
    guestCart = authoritativeToCart(await loadAuthoritativeCartItems(input.cart));
  }
  if (guestCart.length) {
    const combined = mergeCartItems(savedCart, guestCart);
    savedCart = await saveAccountCart(
      userId,
      combined.map(({ productId, quantity }) => ({ productId, quantity })),
    );
  }
  return {
    conflict: false as const,
    wishlist: await getWishlistIds(userId),
    cart: savedCart,
    guestCart: [],
  };
}

export async function getGarageData(userId: string) {
  const db = getDb();
  const [wishlist, orderRows, huntRows, sellerRows] = await Promise.all([
    getWishlistIds(userId),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        sellerName: sellers.storeName,
        sellerSlug: sellers.slug,
        currency: orders.currency,
        totalCents: orders.totalCents,
        refundedAmountCents: orders.refundedAmountCents,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        shippedAt: orders.shippedAt,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(sellers, eq(orders.sellerId, sellers.id))
      .where(eq(orders.buyerUserId, userId))
      .orderBy(desc(orders.createdAt)),
    db
      .select({
        id: wantedRequests.id,
        referenceCode: wantedRequests.referenceCode,
        vehicleMake: wantedRequests.vehicleMake,
        vehicleModel: wantedRequests.vehicleModel,
        preferredScale: wantedRequests.preferredScale,
        modelManufacturer: wantedRequests.modelManufacturer,
        color: wantedRequests.color,
        maxBudgetCents: wantedRequests.maxBudgetCents,
        status: wantedRequests.status,
        createdAt: wantedRequests.createdAt,
        matchedProductId: wantedRequests.matchedProductId,
        matchedProductTitle: products.title,
        matchedProductSlug: products.slug,
        matchedProductPriceCents: products.priceCents,
        matchedProductCurrency: products.currency,
        matchedSellerName: sellers.storeName,
      })
      .from(wantedRequests)
      .leftJoin(products, eq(wantedRequests.matchedProductId, products.id))
      .leftJoin(sellers, eq(products.sellerId, sellers.id))
      .where(eq(wantedRequests.userId, userId))
      .orderBy(desc(wantedRequests.createdAt)),
    db.select().from(sellers).where(eq(sellers.ownerUserId, userId)).limit(1),
  ]);
  const ids = orderRows.map((order) => order.id);
  const [items, feedbackRows, shipmentLinks] = ids.length
    ? await Promise.all([
        db.select().from(orderItems).where(inArray(orderItems.orderId, ids)),
        db
          .select({
            orderId: sellerFeedback.orderId,
            rating: sellerFeedback.rating,
            comment: sellerFeedback.comment,
            updatedAt: sellerFeedback.updatedAt,
          })
          .from(sellerFeedback)
          .where(inArray(sellerFeedback.orderId, ids)),
        db
          .select({
            orderId: shipmentOrders.orderId,
            shipment: shipments,
          })
          .from(shipmentOrders)
          .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
          .where(inArray(shipmentOrders.orderId, ids)),
      ])
    : [[], [], []];
  const shipmentIds = [
    ...new Set(shipmentLinks.map((link) => link.shipment.id)),
  ];
  const shipmentEvents = shipmentIds.length
    ? await db
        .select()
        .from(trackingEvents)
        .where(inArray(trackingEvents.shipmentId, shipmentIds))
        .orderBy(desc(trackingEvents.statusDate))
    : [];
  const seller = sellerRows[0] ?? null;
  const listingRows = seller
    ? await db
        .select()
        .from(products)
        .where(eq(products.sellerId, seller.id))
        .orderBy(desc(products.updatedAt))
    : [];
  const saleRows = seller
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          buyerName: orders.buyerName,
          shippingAddress: orders.shippingAddress,
          currency: orders.currency,
          subtotalCents: orders.subtotalCents,
          shippingCents: orders.shippingCents,
          shippingMode: orders.shippingMode,
          selectedShippingCarrier: orders.selectedShippingCarrier,
          selectedShippingService: orders.selectedShippingService,
          selectedShippingEstimatedDays: orders.selectedShippingEstimatedDays,
          taxCents: orders.taxCents,
          marketplaceFeeBps: orders.marketplaceFeeBps,
          platformFeeCents: orders.platformFeeCents,
          processingFeePayer: orders.processingFeePayer,
          paymentProcessingFeeCents: orders.paymentProcessingFeeCents,
          sellerProceedsCents: orders.sellerProceedsCents,
          paymentFlow: orders.paymentFlow,
          sellerTransferStatus: orders.sellerTransferStatus,
          sellerTransferAmountCents: orders.sellerTransferAmountCents,
          sellerTransferReversedCents: orders.sellerTransferReversedCents,
          totalCents: orders.totalCents,
          refundedAmountCents: orders.refundedAmountCents,
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
          carrier: orders.carrier,
          trackingNumber: orders.trackingNumber,
          createdAt: orders.createdAt,
          deliveredAt: orders.deliveredAt,
          payoutEligibleAt: orders.payoutEligibleAt,
          sellerTransferredAt: orders.sellerTransferredAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.sellerId, seller.id),
            inArray(orders.paymentStatus, ["paid", "partially_refunded"]),
          ),
        )
        .orderBy(desc(orders.createdAt))
    : [];
  const saleIds = saleRows.map((order) => order.id);
  const saleItems = saleIds.length
    ? await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, saleIds))
    : [];
  return {
    wishlist,
    orders: orderRows.map((order) => ({
      ...order,
      feedbackEligibility: getVerifiedFeedbackEligibility(order),
      items: items.filter((item) => item.orderId === order.id),
      feedback:
        feedbackRows.find((feedback) => feedback.orderId === order.id) ?? null,
      shipment: shipmentForBuyerOrder(
        order.id,
        shipmentLinks,
        shipmentEvents,
      ),
    })),
    hunts: huntRows,
    seller,
    listings: listingRows,
    sales: saleRows.map((order) => ({
      ...order,
      items: saleItems.filter((item) => item.orderId === order.id),
    })),
  };
}

function shipmentForBuyerOrder(
  orderId: string,
  links: Array<{ orderId: string; shipment: typeof shipments.$inferSelect }>,
  events: Array<typeof trackingEvents.$inferSelect>,
) {
  const shipment = links.find((link) => link.orderId === orderId)?.shipment;
  if (!shipment) return null;
  const combinedOrderIds = links
    .filter((link) => link.shipment.id === shipment.id)
    .map((link) => link.orderId);
  return {
    ...shipment,
    combinedOrderIds,
    events: events.filter((event) => event.shipmentId === shipment.id),
  };
}

export async function getOwnedProduct(userId: string, productId: string) {
  const rows = await getDb()
    .select({
      product: products,
      ownerUserId: sellers.ownerUserId,
      sellerStatus: sellers.status,
      sellerType: sellers.sellerType,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.id, productId), eq(sellers.ownerUserId, userId)))
    .limit(1);
  if (!rows[0] || rows[0].sellerType !== "collector") return null;
  const images = await getDb()
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder));
  return { ...rows[0], images };
}

export async function getCollectorShipFromAddresses(userId: string) {
  return getDb()
    .select({
      id: sellerAddresses.id,
      label: sellerAddresses.label,
      street1: sellerAddresses.street1,
      street2: sellerAddresses.street2,
      city: sellerAddresses.city,
      region: sellerAddresses.region,
      postalCode: sellerAddresses.postalCode,
      country: sellerAddresses.country,
      phone: sellerAddresses.phone,
      isDefault: sellerAddresses.isDefault,
    })
    .from(sellerAddresses)
    .innerJoin(sellers, eq(sellerAddresses.sellerId, sellers.id))
    .where(eq(sellers.ownerUserId, userId))
    .orderBy(desc(sellerAddresses.isDefault), asc(sellerAddresses.label));
}

export async function getOwnedProductForImages(
  userId: string,
  productId: string,
) {
  const rows = await getDb()
    .select({
      product: products,
      ownerUserId: sellers.ownerUserId,
      sellerStatus: sellers.status,
      sellerType: sellers.sellerType,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(and(eq(products.id, productId), eq(sellers.ownerUserId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteCollectorAccount(userId: string) {
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE collection_offers SET status='withdrawn' WHERE (buyer_id=? OR owner_id=?) AND status IN ('proposed','reserved')").bind(userId,userId),
    // End unpaid promises and release inspected stock before unlinking the user.
    // Accepted commercial evidence remains available for service and refunds.
    d1.prepare("UPDATE preorder_reservations SET status='cancelled',allocated_quantity=0,actor=?,reason='account_deleted',updated_at=CURRENT_TIMESTAMP WHERE buyer_user_id=? AND status IN ('hold','reserved','allocated','awaiting_payment')").bind(userId,userId),
    d1.prepare("UPDATE preorder_waitlist SET status='cancelled' WHERE buyer_user_id=? AND status IN ('waiting','invited')").bind(userId),
    // Remove optional/guest records before deleting the account's verified email.
    d1.prepare("DELETE FROM community_subscribers WHERE lower(email) = (SELECT lower(email) FROM user WHERE id = ?)").bind(userId),
    d1.prepare("DELETE FROM availability_alerts WHERE user_id = ? OR lower(email) = (SELECT lower(email) FROM user WHERE id = ?)").bind(userId, userId),
    d1.prepare("DELETE FROM wanted_requests WHERE user_id = ? OR lower(collector_email) = (SELECT lower(email) FROM user WHERE id = ?)").bind(userId, userId),
    d1
      .prepare(
        `UPDATE products SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
      WHERE seller_id IN (SELECT id FROM sellers WHERE owner_user_id = ?)`,
      )
      .bind(userId),
    d1
      .prepare(
        `UPDATE sellers SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?`,
      )
      .bind(userId),
    d1.prepare("DELETE FROM session WHERE user_id = ?").bind(userId),
    d1.prepare("DELETE FROM user WHERE id = ?").bind(userId),
  ]);
}
