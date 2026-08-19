import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const sellers = sqliteTable(
  "sellers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    storeName: text("store_name").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["applicant", "approved", "onboarding", "active", "suspended"],
    })
      .notNull()
      .default("applicant"),
    stripeAccountId: text("stripe_account_id"),
    stripeChargesEnabled: integer("stripe_charges_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    stripePayoutsEnabled: integer("stripe_payouts_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    defaultShippingCents: integer("default_shipping_cents").notNull().default(0),
    shippingPolicySummary: text("shipping_policy_summary").notNull().default(""),
    returnPolicySummary: text("return_policy_summary").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sellers_slug_unique").on(table.slug),
    uniqueIndex("sellers_stripe_account_unique").on(table.stripeAccountId),
    index("sellers_status_idx").on(table.status),
    check("sellers_shipping_nonnegative", sql`${table.defaultShippingCents} >= 0`),
  ],
);

export const sellerApplications = sqliteTable(
  "seller_applications",
  {
    id: text("id").primaryKey(),
    storeName: text("store_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    website: text("website"),
    currentSellingChannels: text("current_selling_channels").notNull(),
    approximateInventorySize: integer("approximate_inventory_size").notNull(),
    message: text("message").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    ...timestamps,
  },
  (table) => [index("seller_applications_status_idx").on(table.status)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sellerSku: text("seller_sku").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    scale: text("scale").notNull(),
    modelManufacturer: text("model_manufacturer").notNull(),
    vehicleMake: text("vehicle_make").notNull(),
    vehicleModel: text("vehicle_model").notNull(),
    vehicleYear: text("vehicle_year"),
    color: text("color"),
    condition: text("condition", { enum: ["new", "used", "preowned", "other"] })
      .notNull()
      .default("new"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    inventoryQuantity: integer("inventory_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    status: text("status", { enum: ["draft", "active", "sold_out", "inactive"] })
      .notNull()
      .default("draft"),
    primaryImageUrl: text("primary_image_url"),
    keywords: text("keywords").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    uniqueIndex("products_seller_sku_unique").on(table.sellerId, table.sellerSku),
    index("products_catalog_idx").on(table.status, table.sellerId, table.createdAt),
    index("products_scale_idx").on(table.scale),
    index("products_manufacturer_idx").on(table.modelManufacturer),
    check("products_price_nonnegative", sql`${table.priceCents} >= 0`),
    check("products_inventory_nonnegative", sql`${table.inventoryQuantity} >= 0`),
    check("products_reserved_nonnegative", sql`${table.reservedQuantity} >= 0`),
    check(
      "products_reserved_within_inventory",
      sql`${table.reservedQuantity} <= ${table.inventoryQuantity}`,
    ),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("product_images_product_idx").on(table.productId, table.sortOrder)],
);

export const wantedRequests = sqliteTable(
  "wanted_requests",
  {
    id: text("id").primaryKey(),
    referenceCode: text("reference_code").notNull(),
    vehicleMake: text("vehicle_make").notNull(),
    vehicleModel: text("vehicle_model").notNull(),
    preferredScale: text("preferred_scale").notNull(),
    modelManufacturer: text("model_manufacturer"),
    color: text("color"),
    conditionPreference: text("condition_preference"),
    maxBudgetCents: integer("max_budget_cents"),
    notes: text("notes").notNull().default(""),
    collectorEmail: text("collector_email").notNull(),
    status: text("status", { enum: ["open", "possible_match", "matched", "closed"] })
      .notNull()
      .default("open"),
    matchedProductId: text("matched_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    matchedAt: text("matched_at"),
    notifiedAt: text("notified_at"),
  },
  (table) => [
    uniqueIndex("wanted_requests_reference_unique").on(table.referenceCode),
    index("wanted_requests_status_idx").on(table.status, table.createdAt),
    index("wanted_requests_match_idx").on(
      table.vehicleMake,
      table.vehicleModel,
      table.preferredScale,
    ),
    check(
      "wanted_requests_budget_positive",
      sql`${table.maxBudgetCents} IS NULL OR ${table.maxBudgetCents} > 0`,
    ),
  ],
);

export const communitySubscribers = sqliteTable(
  "community_subscribers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    consentTimestamp: text("consent_timestamp").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("community_subscribers_email_unique").on(table.email)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeRefundId: text("stripe_refund_id"),
    buyerEmail: text("buyer_email").notNull(),
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    paymentStatus: text("payment_status", {
      enum: ["pending", "paid", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),
    fulfillmentStatus: text("fulfillment_status", {
      enum: ["unfulfilled", "processing", "shipped", "delivered", "cancelled"],
    })
      .notNull()
      .default("unfulfilled"),
    buyerName: text("buyer_name").notNull().default(""),
    shippingAddress: text("shipping_address").notNull().default("{}"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    paidAt: text("paid_at"),
    shippedAt: text("shipped_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    uniqueIndex("orders_checkout_session_unique").on(table.stripeCheckoutSessionId),
    index("orders_status_idx").on(table.paymentStatus, table.fulfillmentStatus),
    check("orders_money_nonnegative", sql`
      ${table.subtotalCents} >= 0 AND ${table.shippingCents} >= 0 AND
      ${table.platformFeeCents} >= 0 AND ${table.taxCents} >= 0 AND ${table.totalCents} >= 0
    `),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    sellerSkuSnapshot: text("seller_sku_snapshot").notNull(),
    scaleSnapshot: text("scale_snapshot").notNull(),
    manufacturerSnapshot: text("manufacturer_snapshot").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    imageUrlSnapshot: text("image_url_snapshot"),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_price_nonnegative", sql`${table.unitPriceCents} >= 0`),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const stripeEvents = sqliteTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    processedAt: text("processed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("stripe_events_type_idx").on(table.type, table.processedAt)],
);

export const checkoutReservations = sqliteTable(
  "checkout_reservations",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    status: text("status", { enum: ["pending", "completed", "released"] })
      .notNull()
      .default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    currency: text("currency").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("checkout_reservations_session_unique").on(table.stripeCheckoutSessionId),
    index("checkout_reservations_status_idx").on(table.status, table.expiresAt),
  ],
);

export const checkoutReservationItems = sqliteTable(
  "checkout_reservation_items",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => checkoutReservations.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    sellerSkuSnapshot: text("seller_sku_snapshot").notNull(),
    scaleSnapshot: text("scale_snapshot").notNull(),
    manufacturerSnapshot: text("manufacturer_snapshot").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    imageUrlSnapshot: text("image_url_snapshot"),
  },
  (table) => [
    index("checkout_reservation_items_reservation_idx").on(table.reservationId),
    uniqueIndex("checkout_reservation_product_unique").on(
      table.reservationId,
      table.productId,
    ),
    check("checkout_reservation_quantity_positive", sql`${table.quantity} > 0`),
  ],
);
