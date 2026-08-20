import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user as authUser } from "./auth-schema.generated";

export {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema.generated";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const collectorProfiles = sqliteTable(
  "collector_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    handle: text("handle"),
    avatarUrl: text("avatar_url"),
    bio: text("bio").notNull().default(""),
    onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("collector_profiles_user_unique").on(table.userId),
    uniqueIndex("collector_profiles_handle_unique").on(table.handle),
  ],
);

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
    sellerType: text("seller_type", { enum: ["professional", "collector"] })
      .notNull()
      .default("professional"),
    isFoundingSeller: integer("is_founding_seller", { mode: "boolean" })
      .notNull()
      .default(false),
    foundingRateStartsAt: text("founding_rate_starts_at"),
    foundingRateEndsAt: text("founding_rate_ends_at"),
    ownerUserId: text("owner_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
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
    defaultShippingCents: integer("default_shipping_cents")
      .notNull()
      .default(0),
    shippingOriginCountry: text("shipping_origin_country")
      .notNull()
      .default("US"),
    shippingOriginRegion: text("shipping_origin_region"),
    shippingPolicySummary: text("shipping_policy_summary")
      .notNull()
      .default(""),
    returnPolicySummary: text("return_policy_summary").notNull().default(""),
    sellerTermsVersion: text("seller_terms_version"),
    sellerTermsAcceptedAt: text("seller_terms_accepted_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sellers_slug_unique").on(table.slug),
    uniqueIndex("sellers_stripe_account_unique").on(table.stripeAccountId),
    uniqueIndex("sellers_owner_user_unique").on(table.ownerUserId),
    index("sellers_status_idx").on(table.status),
    check(
      "sellers_shipping_nonnegative",
      sql`${table.defaultShippingCents} >= 0`,
    ),
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
    sellerTermsVersion: text("seller_terms_version"),
    sellerTermsAcceptedAt: text("seller_terms_accepted_at"),
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
    condition: text("condition", {
      enum: [
        "new",
        "used",
        "preowned",
        "other",
        "new_sealed",
        "new_opened",
        "displayed",
        "used_excellent",
        "used_good",
        "used_fair",
      ],
    })
      .notNull()
      .default("new"),
    modelCondition: text("model_condition", {
      enum: [
        "not_specified",
        "mint",
        "near_mint",
        "excellent",
        "good",
        "fair",
        "poor",
      ],
    })
      .notNull()
      .default("not_specified"),
    packagingCondition: text("packaging_condition", {
      enum: [
        "not_specified",
        "sealed",
        "mint",
        "excellent",
        "good",
        "fair",
        "poor",
        "not_included",
      ],
    })
      .notNull()
      .default("not_specified"),
    originalBoxStatus: text("original_box_status", {
      enum: ["not_specified", "included", "not_included", "reproduction"],
    })
      .notNull()
      .default("not_specified"),
    missingParts: text("missing_parts").notNull().default(""),
    defects: text("defects").notNull().default(""),
    restorationCustomization: text("restoration_customization")
      .notNull()
      .default(""),
    material: text("material").notNull().default(""),
    productNumber: text("product_number"),
    editionSerial: text("edition_serial"),
    coaStatus: text("coa_status", {
      enum: ["not_specified", "included", "not_included", "not_applicable"],
    })
      .notNull()
      .default("not_specified"),
    accessories: text("accessories").notNull().default(""),
    provenance: text("provenance").notNull().default(""),
    photoFrontChecked: integer("photo_front_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    photoRearChecked: integer("photo_rear_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    photoSidesChecked: integer("photo_sides_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    photoBaseChecked: integer("photo_base_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    photoPackagingChecked: integer("photo_packaging_checked", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    photoIssuesChecked: integer("photo_issues_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    inventoryQuantity: integer("inventory_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    status: text("status", {
      enum: [
        "draft",
        "pending_review",
        "active",
        "sold_out",
        "inactive",
        "rejected",
      ],
    })
      .notNull()
      .default("draft"),
    primaryImageUrl: text("primary_image_url"),
    rejectionReason: text("rejection_reason"),
    reviewedAt: text("reviewed_at"),
    keywords: text("keywords").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    uniqueIndex("products_seller_sku_unique").on(
      table.sellerId,
      table.sellerSku,
    ),
    index("products_catalog_idx").on(
      table.status,
      table.sellerId,
      table.createdAt,
    ),
    index("products_scale_idx").on(table.scale),
    index("products_manufacturer_idx").on(table.modelManufacturer),
    index("products_model_condition_idx").on(table.modelCondition),
    check("products_price_nonnegative", sql`${table.priceCents} >= 0`),
    check(
      "products_inventory_nonnegative",
      sql`${table.inventoryQuantity} >= 0`,
    ),
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
    source: text("source", { enum: ["external", "r2"] })
      .notNull()
      .default("external"),
    storageKey: text("storage_key"),
    uploadedByUserId: text("uploaded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "set null",
      },
    ),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at"),
  },
  (table) => [
    index("product_images_product_idx").on(table.productId, table.sortOrder),
  ],
);

export const wishlistItems = sqliteTable(
  "wishlist_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("wishlist_user_product_unique").on(
      table.userId,
      table.productId,
    ),
    index("wishlist_user_idx").on(table.userId, table.createdAt),
  ],
);

export const carts = sqliteTable(
  "carts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    sellerId: text("seller_id").references(() => sellers.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("carts_user_unique").on(table.userId),
    index("carts_seller_idx").on(table.sellerId),
  ],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_unique").on(
      table.cartId,
      table.productId,
    ),
    index("cart_items_cart_idx").on(table.cartId),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
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
    userId: text("user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["open", "possible_match", "matched", "closed"],
    })
      .notNull()
      .default("open"),
    matchedProductId: text("matched_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    matchedAt: text("matched_at"),
    notifiedAt: text("notified_at"),
  },
  (table) => [
    uniqueIndex("wanted_requests_reference_unique").on(table.referenceCode),
    index("wanted_requests_status_idx").on(table.status, table.createdAt),
    index("wanted_requests_user_idx").on(table.userId, table.createdAt),
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("community_subscribers_email_unique").on(table.email),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerUserId: text("buyer_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeRefundId: text("stripe_refund_id"),
    buyerEmail: text("buyer_email").notNull(),
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    marketplaceFeeBps: integer("marketplace_fee_bps")
      .notNull()
      .default(1000),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    paymentProcessingFeeCents: integer("payment_processing_fee_cents"),
    sellerProceedsCents: integer("seller_proceeds_cents"),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    paymentStatus: text("payment_status", {
      enum: ["pending", "paid", "failed", "partially_refunded", "refunded"],
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    paidAt: text("paid_at"),
    shippedAt: text("shipped_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    uniqueIndex("orders_checkout_session_unique").on(
      table.stripeCheckoutSessionId,
    ),
    index("orders_status_idx").on(table.paymentStatus, table.fulfillmentStatus),
    index("orders_buyer_user_idx").on(table.buyerUserId, table.createdAt),
    check(
      "orders_money_nonnegative",
      sql`
      ${table.subtotalCents} >= 0 AND ${table.shippingCents} >= 0 AND
      ${table.platformFeeCents} >= 0 AND ${table.taxCents} >= 0 AND ${table.totalCents} >= 0 AND
      ${table.refundedAmountCents} >= 0 AND ${table.refundedAmountCents} <= ${table.totalCents}
    `,
    ),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
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

export const resolutionCases = sqliteTable(
  "resolution_cases",
  {
    id: text("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    openedByUserId: text("opened_by_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    reason: text("reason", {
      enum: [
        "not_received",
        "damaged",
        "not_as_described",
        "wrong_item",
        "missing_item",
        "counterfeit",
        "other",
      ],
    }).notNull(),
    requestedResolution: text("requested_resolution", {
      enum: ["full_refund", "partial_refund", "return_refund"],
    }).notNull(),
    requestedRefundCents: integer("requested_refund_cents"),
    details: text("details").notNull(),
    status: text("status", {
      enum: [
        "awaiting_seller",
        "awaiting_buyer",
        "return_authorized",
        "return_in_transit",
        "under_review",
        "resolved",
        "closed",
        "denied",
      ],
    })
      .notNull()
      .default("awaiting_seller"),
    policyVersion: text("policy_version").notNull(),
    reportDeadline: text("report_deadline").notNull(),
    sellerRespondBy: text("seller_respond_by").notNull(),
    buyerEvidenceBy: text("buyer_evidence_by").notNull(),
    buyerEscalateBy: text("buyer_escalate_by"),
    buyerShipBy: text("buyer_ship_by"),
    returnAuthorizationNumber: text("return_authorization_number"),
    returnCarrier: text("return_carrier"),
    returnTrackingNumber: text("return_tracking_number"),
    resolutionSummary: text("resolution_summary"),
    resolvedAt: text("resolved_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("resolution_cases_number_unique").on(table.caseNumber),
    uniqueIndex("resolution_cases_order_unique").on(table.orderId),
    index("resolution_cases_status_idx").on(table.status, table.updatedAt),
    check(
      "resolution_cases_requested_refund_nonnegative",
      sql`${table.requestedRefundCents} IS NULL OR ${table.requestedRefundCents} > 0`,
    ),
  ],
);

export const resolutionMessages = sqliteTable(
  "resolution_messages",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    authorRole: text("author_role", {
      enum: ["buyer", "seller", "support", "system"],
    }).notNull(),
    kind: text("kind", {
      enum: [
        "case_opened",
        "message",
        "seller_response",
        "return_authorized",
        "return_shipped",
        "refund",
        "escalation",
        "case_closed",
      ],
    })
      .notNull()
      .default("message"),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("resolution_messages_case_idx").on(table.caseId, table.createdAt)],
);

export const resolutionFiles = sqliteTable(
  "resolution_files",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    uploaderRole: text("uploader_role", {
      enum: ["buyer", "seller", "support"],
    }).notNull(),
    kind: text("kind", { enum: ["evidence", "return_label"] })
      .notNull()
      .default("evidence"),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    caption: text("caption").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("resolution_files_storage_key_unique").on(table.storageKey),
    index("resolution_files_case_idx").on(table.caseId, table.createdAt),
    check("resolution_files_size_positive", sql`${table.sizeBytes} > 0`),
  ],
);

export const resolutionRefunds = sqliteTable(
  "resolution_refunds",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    initiatedByUserId: text("initiated_by_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: ["partial", "full"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    stripeRefundId: text("stripe_refund_id").notNull(),
    status: text("status", {
      enum: ["pending", "succeeded", "failed", "cancelled"],
    }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("resolution_refunds_stripe_unique").on(table.stripeRefundId),
    index("resolution_refunds_case_idx").on(table.caseId, table.createdAt),
    check("resolution_refunds_amount_positive", sql`${table.amountCents} > 0`),
  ],
);

export const stripeEvents = sqliteTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    processedAt: text("processed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("stripe_events_type_idx").on(table.type, table.processedAt),
  ],
);

export const checkoutReservations = sqliteTable(
  "checkout_reservations",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerUserId: text("buyer_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    status: text("status", { enum: ["pending", "completed", "released"] })
      .notNull()
      .default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    marketplaceFeeBps: integer("marketplace_fee_bps")
      .notNull()
      .default(1000),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    currency: text("currency").notNull(),
    policyVersion: text("policy_version"),
    policyAcceptedAt: text("policy_accepted_at"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("checkout_reservations_session_unique").on(
      table.stripeCheckoutSessionId,
    ),
    index("checkout_reservations_status_idx").on(table.status, table.expiresAt),
    index("checkout_reservations_buyer_idx").on(table.buyerUserId),
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
