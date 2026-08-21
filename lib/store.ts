import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  orderItems,
  orders,
  productImages,
  products,
  sellers,
  shipmentOrders,
  shipments,
  trackingEvents,
} from "@/db/schema";
import { sendShipmentEmail } from "./email";
import { config } from "./config";
import { canClaimProfessionalStore } from "./account-rules";
import { buildStoreAnalytics } from "./store-rules";
import { determineMarketplaceFee } from "./fees";
import { parseParcel } from "./shipping-rules";
import {
  notifyRestockSubscribers,
  parseProductAvailability,
  syncPreorderReleaseSchedule,
} from "./availability";
import {
  assertCollectibleListingReady,
  cleanText,
  integer,
  legacyConditionFromCollectibleDetails,
  makeSlug,
  moneyToCents,
  normalizeEmail,
  optionalHttpUrl,
  parseCollectibleDetails,
  requiredString,
  ValidationError,
} from "./validation";

export type StoreAccountUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export async function claimProfessionalStoreForUser(user: StoreAccountUser) {
  const db = getDb();
  const owned = await db
    .select()
    .from(sellers)
    .where(eq(sellers.ownerUserId, user.id))
    .limit(1);
  if (owned[0] || !user.emailVerified) return owned[0] ?? null;

  const email = normalizeEmail(user.email);
  const candidates = await db
    .select()
    .from(sellers)
    .where(
      and(
        isNull(sellers.ownerUserId),
        eq(sellers.sellerType, "professional"),
        ne(sellers.status, "applicant"),
        sql`lower(trim(${sellers.contactEmail})) = ${email}`,
      ),
    )
    .limit(2);
  if (
    candidates.length !== 1 ||
    !canClaimProfessionalStore({
      authenticatedEmail: user.email,
      emailVerified: user.emailVerified,
      storeEmail: candidates[0].contactEmail,
      storeType: candidates[0].sellerType,
      currentOwnerUserId: candidates[0].ownerUserId,
    })
  )
    return null;

  await db
    .update(sellers)
    .set({ ownerUserId: user.id, updatedAt: new Date().toISOString() })
    .where(
      and(eq(sellers.id, candidates[0].id), isNull(sellers.ownerUserId)),
    );
  const claimed = await db
    .select()
    .from(sellers)
    .where(eq(sellers.ownerUserId, user.id))
    .limit(1);
  return claimed[0] ?? null;
}

export async function getProfessionalStoreForUser(userId: string) {
  const rows = await getDb()
    .select()
    .from(sellers)
    .where(
      and(
        eq(sellers.ownerUserId, userId),
        eq(sellers.sellerType, "professional"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getStoreDashboardData(userId: string) {
  const store = await getProfessionalStoreForUser(userId);
  if (!store) return null;
  const db = getDb();
  const [inventory, orderRows] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.sellerId, store.id))
      .orderBy(desc(products.updatedAt)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        buyerEmail: orders.buyerEmail,
        buyerName: orders.buyerName,
        shippingAddress: orders.shippingAddress,
        currency: orders.currency,
        subtotalCents: orders.subtotalCents,
        shippingCents: orders.shippingCents,
        shippingMode: orders.shippingMode,
        selectedShippingCarrier: orders.selectedShippingCarrier,
        selectedShippingService: orders.selectedShippingService,
        selectedShippingServiceToken: orders.selectedShippingServiceToken,
        selectedShippingEstimatedDays: orders.selectedShippingEstimatedDays,
        taxCents: orders.taxCents,
        marketplaceFeeBps: orders.marketplaceFeeBps,
        platformFeeCents: orders.platformFeeCents,
        paymentProcessingFeeCents: orders.paymentProcessingFeeCents,
        sellerProceedsCents: orders.sellerProceedsCents,
        totalCents: orders.totalCents,
        refundedAmountCents: orders.refundedAmountCents,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        shipByAt: orders.shipByAt,
        shippedAt: orders.shippedAt,
      })
      .from(orders)
      .where(eq(orders.sellerId, store.id))
      .orderBy(desc(orders.createdAt)),
  ]);
  const orderIds = orderRows.map((order) => order.id);
  const inventoryImages = inventory.length
    ? await db
        .select()
        .from(productImages)
        .where(inArray(productImages.productId, inventory.map((item) => item.id)))
        .orderBy(asc(productImages.sortOrder))
    : [];
  const items = orderIds.length
    ? await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .orderBy(asc(orderItems.id))
    : [];
  const shipmentLinks = orderIds.length
    ? await db
        .select({
          orderId: shipmentOrders.orderId,
          shipment: shipments,
        })
        .from(shipmentOrders)
        .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
        .where(inArray(shipmentOrders.orderId, orderIds))
    : [];
  const shipmentIds = [
    ...new Set(shipmentLinks.map((link) => link.shipment.id)),
  ];
  const events = shipmentIds.length
    ? await db
        .select()
        .from(trackingEvents)
        .where(inArray(trackingEvents.shipmentId, shipmentIds))
        .orderBy(desc(trackingEvents.statusDate))
    : [];
  const analytics = buildStoreAnalytics(orderRows, items, inventory);
  return {
    store,
    fee: determineMarketplaceFee(store),
    inventory: inventory.map((item) => ({
      ...item,
      images: inventoryImages.filter((image) => image.productId === item.id),
    })),
    orders: orderRows.map((order) => ({
      ...order,
      items: items.filter((item) => item.orderId === order.id),
      shipment: shipmentForOrder(order.id, shipmentLinks, events),
    })),
    analytics,
    shipping: {
      configured: Boolean(config.shippoApiKey),
      insuranceThresholdCents: config.shippoInsuranceThresholdCents,
      signatureThresholdCents: config.shippoSignatureThresholdCents,
    },
  };
}

export async function saveStoreProduct(
  store: typeof sellers.$inferSelect,
  payload: Record<string, unknown>,
) {
  assertStoreCanManage(store);
  const db = getDb();
  const requestedId = cleanText(payload.id, 100);
  const existingRows = requestedId
    ? await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, requestedId),
            eq(products.sellerId, store.id),
          ),
        )
        .limit(1)
    : [];
  if (requestedId && !existingRows[0])
    throw new ValidationError("Inventory item not found.");
  const existing = existingRows[0];
  const id = existing?.id ?? crypto.randomUUID();
  const sellerSku = requiredString(payload.sellerSku, "sellerSku", 100);
  const duplicate = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.sellerId, store.id),
        sql`lower(${products.sellerSku}) = ${sellerSku.toLowerCase()}`,
        ne(products.id, id),
      ),
    )
    .limit(1);
  if (duplicate[0])
    throw new ValidationError("That SKU is already used by another item.");

  const title = requiredString(payload.title, "title", 200);
  const inventoryQuantity = integer(
    payload.inventoryQuantity,
    "inventoryQuantity",
    existing?.reservedQuantity ?? 0,
    1_000_000,
  );
  const availability = parseProductAvailability(payload);
  const collectible = parseCollectibleDetails(payload);
  const hasPackageOverride = [
    payload.packageLength,
    payload.packageWidth,
    payload.packageHeight,
    payload.packageWeight,
  ].some((value) => cleanText(value, 40));
  const packageOverride = hasPackageOverride
    ? parseParcel({
        length: payload.packageLength,
        width: payload.packageWidth,
        height: payload.packageHeight,
        weight: payload.packageWeight,
      })
    : null;
  const values = {
    sellerId: store.id,
    sellerSku,
    title,
    slug:
      existing?.slug ??
      `${makeSlug(title)}-${makeSlug(sellerSku)}-${id.slice(0, 6)}`,
    description: cleanText(payload.description, 4_000),
    scale: requiredString(payload.scale, "scale", 30),
    modelManufacturer: requiredString(
      payload.modelManufacturer,
      "modelManufacturer",
      100,
    ),
    vehicleMake: requiredString(payload.vehicleMake, "vehicleMake", 100),
    vehicleModel: requiredString(payload.vehicleModel, "vehicleModel", 120),
    vehicleYear: cleanText(payload.vehicleYear, 20) || null,
    color: cleanText(payload.color, 80) || null,
    condition: legacyConditionFromCollectibleDetails(collectible),
    ...collectible,
    priceCents: moneyToCents(payload.price, "price"),
    packageLength: packageOverride?.length ?? null,
    packageWidth: packageOverride?.width ?? null,
    packageHeight: packageOverride?.height ?? null,
    packageWeight: packageOverride?.weight ?? null,
    inventoryQuantity,
    ...availability,
    primaryImageUrl: existing?.primaryImageUrl ?? null,
    keywords: cleanText(payload.keywords, 1_000),
  };

  if (existing) {
    const wasSoldOut =
      existing.inventoryQuantity - existing.reservedQuantity < 1;
    const nextStatus =
      existing.status === "sold_out" &&
      inventoryQuantity > existing.reservedQuantity
        ? "active"
        : existing.status;
    await db
      .update(products)
      .set({ ...values, status: nextStatus, updatedAt: new Date().toISOString() })
      .where(
        and(eq(products.id, existing.id), eq(products.sellerId, store.id)),
      );
    if (wasSoldOut && inventoryQuantity - existing.reservedQuantity > 0) {
      await notifyRestockSubscribers(existing.id);
    }
    await syncPreorderReleaseSchedule({
      productId: existing.id,
      title,
      previousAvailabilityType: existing.availabilityType,
      previousReleaseDate: existing.releaseDate,
      availabilityType: availability.availabilityType,
      releaseDate: availability.releaseDate,
      handlingTimeBusinessDays: store.handlingTimeBusinessDays,
    });
  } else {
    await db.insert(products).values({
      id,
      ...values,
      currency: "usd",
      status: "draft",
    });
  }
  return { productId: id };
}

export async function setStoreProductStatus(
  store: typeof sellers.$inferSelect,
  productId: string,
  requestedStatus: string,
) {
  assertStoreCanManage(store);
  const rows = await getDb()
    .select()
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.sellerId, store.id)),
    )
    .limit(1);
  const product = rows[0];
  if (!product) throw new ValidationError("Inventory item not found.");
  if (!['active', 'inactive'].includes(requestedStatus))
    throw new ValidationError("Choose a valid inventory status.");
  if (
    requestedStatus === "active" &&
    (store.status !== "active" ||
      !store.stripeChargesEnabled ||
      !store.stripePayoutsEnabled)
  )
    throw new ValidationError(
      "Complete store approval and Stripe onboarding before publishing.",
    );
  if (
    requestedStatus === "active" &&
    product.inventoryQuantity - product.reservedQuantity < 1
  )
    throw new ValidationError("Add available inventory before publishing.");
  if (requestedStatus === "active") {
    const imageCount = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    assertCollectibleListingReady(product, Number(imageCount[0]?.count ?? 0));
  }
  await getDb()
    .update(products)
    .set({
      status: requestedStatus as "active" | "inactive",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(eq(products.id, productId), eq(products.sellerId, store.id)),
    );
  return { productId, status: requestedStatus };
}

export async function archiveStoreProduct(
  store: typeof sellers.$inferSelect,
  productId: string,
) {
  assertStoreCanManage(store);
  const rows = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.sellerId, store.id)),
    )
    .limit(1);
  if (!rows[0]) throw new ValidationError("Inventory item not found.");
  await getDb()
    .update(products)
    .set({ status: "inactive", updatedAt: new Date().toISOString() })
    .where(
      and(eq(products.id, productId), eq(products.sellerId, store.id)),
    );
  return { productId, archived: true };
}

export async function saveStoreProfile(
  store: typeof sellers.$inferSelect,
  payload: Record<string, unknown>,
) {
  assertStoreCanManage(store);
  const rawWebsite = cleanText(payload.websiteUrl, 1_500);
  const websiteUrl = rawWebsite ? optionalHttpUrl(rawWebsite) : null;
  if (rawWebsite && !websiteUrl)
    throw new ValidationError("Website must be an http or https URL.");
  const rawLogo = cleanText(payload.logoUrl, 1_500);
  const logoUrl = rawLogo ? optionalHttpUrl(rawLogo) : null;
  if (rawLogo && !logoUrl)
    throw new ValidationError("Logo must be an http or https URL.");
  const parcel = parseParcel({
    length: payload.defaultPackageLength,
    width: payload.defaultPackageWidth,
    height: payload.defaultPackageHeight,
    weight: payload.defaultPackageWeight,
  });
  const shippingOriginCountry = requiredString(
    payload.shippingOriginCountry || "US",
    "shippingOriginCountry",
    2,
  ).toUpperCase();
  const shippingOriginRegion = cleanText(payload.shippingOriginRegion, 80) || null;
  if (["US", "CA"].includes(shippingOriginCountry) && !shippingOriginRegion)
    throw new ValidationError("State or region is required for US and Canadian ship-from addresses.");
  const shippingMode = cleanText(payload.shippingMode, 20);
  if (!["calculated", "flat", "free"].includes(shippingMode))
    throw new ValidationError("Choose calculated, flat-rate, or free shipping.");
  const values = {
    storeName: requiredString(payload.storeName, "storeName", 120),
    contactName: requiredString(payload.contactName, "contactName", 120),
    websiteUrl,
    logoUrl,
    description: cleanText(payload.description, 2_000),
    defaultShippingCents: moneyToCents(
      shippingMode === "flat" ? payload.defaultShipping : "0",
      "default shipping",
    ),
    shippingMode: shippingMode as "calculated" | "flat" | "free",
    handlingTimeBusinessDays: integer(
      payload.handlingTimeBusinessDays,
      "handling time",
      1,
      10,
    ),
    shippingOriginCountry,
    shippingOriginRegion,
    shippingOriginStreet1: requiredString(
      payload.shippingOriginStreet1,
      "shippingOriginStreet1",
      200,
    ),
    shippingOriginStreet2:
      cleanText(payload.shippingOriginStreet2, 200) || null,
    shippingOriginCity: requiredString(
      payload.shippingOriginCity,
      "shippingOriginCity",
      120,
    ),
    shippingOriginPostalCode: requiredString(
      payload.shippingOriginPostalCode,
      "shippingOriginPostalCode",
      20,
    ),
    shippingOriginPhone: requiredString(
      payload.shippingOriginPhone,
      "shippingOriginPhone",
      50,
    ),
    defaultPackageLength: parcel.length,
    defaultPackageWidth: parcel.width,
    defaultPackageHeight: parcel.height,
    defaultPackageWeight: parcel.weight,
    shippingPolicySummary: cleanText(payload.shippingPolicySummary, 1_000),
    returnPolicySummary: cleanText(payload.returnPolicySummary, 1_000),
    updatedAt: new Date().toISOString(),
  };
  await getDb().update(sellers).set(values).where(eq(sellers.id, store.id));
  return { store: { ...store, ...values } };
}

function shipmentForOrder(
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

export async function shipOwnedStoreOrder(
  userId: string,
  payload: Record<string, unknown>,
) {
  const orderId = requiredString(payload.orderId, "orderId", 100);
  const carrier = requiredString(payload.carrier, "carrier", 100);
  const trackingNumber = requiredString(
    payload.trackingNumber,
    "trackingNumber",
    200,
  );
  const rows = await getDb()
    .select({ order: orders, seller: sellers })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(
      and(eq(orders.id, orderId), eq(sellers.ownerUserId, userId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row || !["paid", "partially_refunded"].includes(row.order.paymentStatus))
    throw new ValidationError("Only your paid orders can be marked shipped.");
  if (row.seller.status === "suspended")
    throw new ValidationError(
      "This store is suspended. Contact Model Car Center support.",
    );
  const fulfillmentService = cleanText(payload.fulfillmentService, 150) || null;
  const fulfillmentEstimatedDays =
    cleanText(payload.fulfillmentEstimatedDays, 10)
      ? integer(
          payload.fulfillmentEstimatedDays,
          "fulfillmentEstimatedDays",
          0,
          60,
        )
      : null;
  if (row.order.shippingMode === "calculated") {
    if (!fulfillmentService)
      throw new ValidationError("Enter the carrier service used for this shipment.");
    const exactService =
      carrier.trim().toLowerCase() ===
        String(row.order.selectedShippingCarrier ?? "").trim().toLowerCase() &&
      fulfillmentService.trim().toLowerCase() ===
        String(row.order.selectedShippingService ?? "").trim().toLowerCase();
    if (
      !exactService &&
      (fulfillmentEstimatedDays == null ||
        row.order.selectedShippingEstimatedDays == null ||
        fulfillmentEstimatedDays > row.order.selectedShippingEstimatedDays)
    )
      throw new ValidationError(
        "Use the buyer-selected service or attest to an equal/faster transit time; shipping downgrades are not allowed.",
      );
  }
  await getDb()
    .update(orders)
    .set({
      carrier,
      trackingNumber,
      fulfillmentService,
      fulfillmentEstimatedDays,
      fulfillmentStatus: "shipped",
      shippedAt: row.order.shippedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(eq(orders.id, orderId), eq(orders.sellerId, row.seller.id)),
    );
  const email = await sendShipmentEmail({
    buyerEmail: row.order.buyerEmail,
    orderNumber: row.order.orderNumber,
    carrier,
    trackingNumber,
  });
  return { emailSent: email.sent };
}

function assertStoreCanManage(store: typeof sellers.$inferSelect) {
  if (store.status === "suspended")
    throw new ValidationError(
      "This store is suspended. Contact Model Car Center support.",
    );
}
