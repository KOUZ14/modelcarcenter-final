import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { user as authUser } from "./auth-schema.generated";
export * from "./community-schema";
export * from "./measurement-schema";

export {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema.generated";

export const promotionSettings = sqliteTable("promotion_settings", {
  id: text("id").primaryKey(), settings: text("settings").notNull(), updatedAt: integer("updated_at").notNull(),
});

export const promotionCampaigns = sqliteTable("promotion_campaigns", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull().references((): AnySQLiteColumn => sellers.id, { onDelete: "restrict" }),
  productId: text("product_id").notNull().references((): AnySQLiteColumn => products.id, { onDelete: "restrict" }),
  title: text("title").notNull(), status: text("status").notNull().default("pending_payment"),
  reason: text("reason").notNull().default(""), priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(), taxMode: text("tax_mode").notNull(), taxCode: text("tax_code").notNull(),
  termsVersion: text("terms_version").notNull(), durationMs: integer("duration_ms").notNull(),
  startsAt: integer("starts_at"), endsAt: integer("ends_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [
  uniqueIndex("promotion_live_listing").on(t.productId).where(sql`${t.status} IN ('pending_payment','active','paused')`),
  index("promotion_seller_date").on(t.sellerId, t.createdAt), index("promotion_serving").on(t.status, t.endsAt),
  check("promotion_campaign_status", sql`${t.status} IN ('pending_payment','active','paused','ended','expired')`),
  check("promotion_price_duration", sql`${t.priceCents} >= 50 AND ${t.durationMs} > 0`),
]);

export const promotionPayments = sqliteTable("promotion_payments", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().unique().references(() => promotionCampaigns.id, { onDelete: "restrict" }),
  sellerId: text("seller_id").notNull(), requestKey: text("request_key").notNull(),
  sessionId: text("session_id").unique(), paymentIntentId: text("payment_intent_id").unique(), chargeId: text("charge_id").unique(),
  status: text("status").notNull().default("pending"), totalCents: integer("total_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0), feeCents: integer("fee_cents"), refundedCents: integer("refunded_cents").notNull().default(0),
  disputeStatus: text("dispute_status").notNull().default("none"), error: text("error").notNull().default(""),
  createdAt: integer("created_at").notNull(), checkedAt: integer("checked_at").notNull().default(0),
}, t => [uniqueIndex("promotion_purchase_request").on(t.sellerId, t.requestKey),
  check("promotion_payment_status", sql`${t.status} IN ('pending','paid','failed','expired')`),
  check("promotion_payment_amounts", sql`${t.totalCents} >= 0 AND ${t.taxCents} >= 0 AND ${t.refundedCents} >= 0`),
]);

export const promotionRefunds = sqliteTable("promotion_refunds", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => promotionCampaigns.id, { onDelete: "restrict" }),
  operationKey: text("operation_key").notNull().unique(), stripeRefundId: text("stripe_refund_id").unique(),
  amountCents: integer("amount_cents").notNull(), status: text("status").notNull().default("queued"),
  reason: text("reason").notNull(), error: text("error").notNull().default(""),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("promotion_refund_recovery").on(t.status, t.updatedAt), check("promotion_refund_amount", sql`${t.amountCents} > 0`)]);

export const promotionEvents = sqliteTable("promotion_events", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => promotionCampaigns.id),
  nonce: text("nonce").notNull(), kind: text("kind").notNull(), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("promotion_event_once").on(t.campaignId, t.nonce, t.kind), index("promotion_event_retention").on(t.createdAt), check("promotion_event_kind", sql`${t.kind} IN ('impression','click')`)]);

export const promotionDailyMetrics = sqliteTable("promotion_daily_metrics", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull().references(() => promotionCampaigns.id),
  day: text("day").notNull(), impressions: integer("impressions").notNull().default(0), clicks: integer("clicks").notNull().default(0),
}, t => [uniqueIndex("promotion_metrics_day").on(t.campaignId, t.day)]);

export const promotionAudit = sqliteTable("promotion_audit", {
  id: text("id").primaryKey(), campaignId: text("campaign_id"), actor: text("actor").notNull(),
  action: text("action").notNull(), detail: text("detail").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("promotion_audit_campaign").on(t.campaignId, t.createdAt)]);

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const preorderPolicies = sqliteTable("preorder_policies", {
  version: text("version").primaryKey(),
  terms: text("terms").notNull(),
  delayResponseDays: integer("delay_response_days").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  enabled: integer("enabled").notNull().default(0),
}, t => [check("preorder_policy_days", sql`${t.delayResponseDays} BETWEEN 1 AND 30`)]);

export const preorderSellerAccess = sqliteTable("preorder_seller_access", {
  sellerId: text("seller_id").primaryKey().references(() => sellers.id, { onDelete: "restrict" }),
  approved: integer("approved").notNull().default(0),
  supplySource: text("supply_source").notNull(),
  reason: text("reason").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const incomingBatches = sqliteTable("incoming_batches", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  supplierReference: text("supplier_reference").notNull(),
  requestedQuantity: integer("requested_quantity").notNull(),
  confirmedAllocation: integer("confirmed_allocation").notNull(),
  capacity: integer("capacity").notNull(),
  safetyBuffer: integer("safety_buffer").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  evidenceState: text("evidence_state").notNull().default("supplied"),
  evidenceReviewedBy: text("evidence_reviewed_by"),
  terms: text("terms").notNull(),
  dispatchEnd: text("dispatch_end"),
  opensAt: text("opens_at").notNull(),
  cutoffAt: text("cutoff_at").notNull(),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("closed"),
  supplyState: text("supply_state").notNull().default("expected"),
  receivedQuantity: integer("received_quantity").notNull().default(0),
  sellableQuantity: integer("sellable_quantity").notNull().default(0),
  damagedQuantity: integer("damaged_quantity").notNull().default(0),
  receivedAt: text("received_at"),
  inspectedAt: text("inspected_at"),
  revision: integer("revision").notNull().default(1),
  shortage: integer("shortage").notNull().default(0),
  ...timestamps,
}, t => [index("incoming_listing_idx").on(t.listingId), check("incoming_quantities", sql`${t.capacity} >= 0 AND ${t.confirmedAllocation} >= ${t.capacity} AND ${t.requestedQuantity} >= ${t.confirmedAllocation} AND ${t.safetyBuffer} BETWEEN 0 AND ${t.capacity} AND ${t.sellableQuantity} >= 0 AND ${t.damagedQuantity} >= 0 AND ${t.receivedQuantity} >= ${t.sellableQuantity} + ${t.damagedQuantity}`)]);

export const preorderReservations = sqliteTable("preorder_reservations", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => incomingBatches.id, { onDelete: "restrict" }),
  buyerUserId: text("buyer_user_id").references(() => authUser.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("hold"),
  acceptedSequence: integer("accepted_sequence"),
  terms: text("terms").notNull(),
  acceptedAt: text("accepted_at"),
  holdExpiresAt: text("hold_expires_at").notNull(),
  consentState: text("consent_state").notNull().default("accepted"),
  consentDeadline: text("consent_deadline"),
  acceptedRevision: integer("accepted_revision").notNull(),
  allocatedQuantity: integer("allocated_quantity").notNull().default(0),
  paymentDeadline: text("payment_deadline"),
  checkoutReservationId: text("checkout_reservation_id"),
  orderId: text("order_id").references(() => orders.id, { onDelete: "restrict" }),
  contactEmail: text("contact_email").notNull(),
  address: text("address"),
  reason: text("reason"),
  actor: text("actor").notNull(),
  ...timestamps,
}, t => [uniqueIndex("preorder_idempotency_idx").on(t.buyerUserId, t.idempotencyKey), uniqueIndex("preorder_sequence_idx").on(t.acceptedSequence), index("preorder_queue_idx").on(t.batchId, t.status, t.acceptedSequence), index("preorder_buyer_idx").on(t.buyerUserId), check("preorder_quantity", sql`${t.quantity} > 0 AND ${t.allocatedQuantity} BETWEEN 0 AND ${t.quantity}`), check("preorder_status", sql`${t.status} IN ('hold','reserved','allocated','awaiting_payment','converted','cancelled','expired')`)]);

export const preorderEvents = sqliteTable("preorder_events", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").references(() => incomingBatches.id, { onDelete: "restrict" }),
  reservationId: text("reservation_id").references(() => preorderReservations.id, { onDelete: "restrict" }),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  detail: text("detail").notNull(),
  recipient: text("recipient"),
  noticeVersion: text("notice_version").notNull().default("preorder-notice-v1"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [index("preorder_event_delivery_idx").on(t.deliveryStatus, t.nextAttemptAt), index("preorder_event_reservation_idx").on(t.reservationId, t.createdAt)]);

export const preorderPaymentLedger = sqliteTable("preorder_payment_ledger", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => preorderReservations.id, { onDelete: "restrict" }),
  sessionId: text("session_id").notNull(),
  paymentIntentId: text("payment_intent_id").notNull(),
  chargeId: text("charge_id"),
  amountCents: integer("amount_cents").notNull(),
  kind: text("kind").notNull().default("balance"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  processingFeeCents: integer("processing_fee_cents"),
  refundedCents: integer("refunded_cents").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  refundId: text("refund_id"),
  refundStatus: text("refund_status").notNull().default("not_required"),
  error: text("error"),
  ...timestamps,
}, t => [uniqueIndex("preorder_payment_session_idx").on(t.sessionId)]);

export const preorderDepositCheckouts = sqliteTable("preorder_deposit_checkouts", {
  reservationId: text("reservation_id").primaryKey().references(() => preorderReservations.id, { onDelete: "restrict" }),
  sessionId: text("session_id").unique(),
  request: text("request").notNull(),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  disputeStatus: text("dispute_status").notNull().default("none"),
  sellerTransferId: text("seller_transfer_id"),
  sellerTransferAmountCents: integer("seller_transfer_amount_cents").notNull().default(0),
  sellerTransferReversedCents: integer("seller_transfer_reversed_cents").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const preorderRefundRequests = sqliteTable("preorder_refund_requests", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  targetCents: integer("target_cents").notNull(),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("preorder_refund_target").on(t.orderId,t.targetCents), uniqueIndex("preorder_refund_pending_order").on(t.orderId).where(sql`${t.status} = 'pending'`)]);

export const preorderCheckouts = sqliteTable("preorder_checkouts", {
  checkoutId: text("checkout_id").primaryKey().references(() => checkoutReservations.id, { onDelete: "restrict" }),
  reservationId: text("reservation_id").notNull().references(() => preorderReservations.id, { onDelete: "restrict" }),
  acceptedQuote: text("accepted_quote").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [index("preorder_checkout_reservation_idx").on(t.reservationId)]);

export const preorderWaitlist = sqliteTable("preorder_waitlist", {
  sequence: integer("sequence").primaryKey({autoIncrement:true}),
  id: text("id").notNull(),
  batchId: text("batch_id").notNull().references(() => incomingBatches.id, {onDelete:"restrict"}),
  buyerUserId: text("buyer_user_id").references(() => authUser.id, {onDelete:"set null"}),
  contactEmail: text("contact_email").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("waiting"),
  reservationId: text("reservation_id").references(() => preorderReservations.id, {onDelete:"restrict"}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [uniqueIndex("preorder_waitlist_id").on(t.id),index("preorder_waitlist_queue").on(t.batchId,t.status,t.sequence),check("waitlist_quantity",sql`${t.quantity} BETWEEN 1 AND 10`)]);

export const securityRateLimits = sqliteTable("security_rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("security_rate_limits_expiry_idx").on(table.expiresAt)]);

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
    specialty: text("specialty").notNull().default(""),
    packingApproach: text("packing_approach").notNull().default(""),
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
    shippingMode: text("shipping_mode", {
      enum: ["calculated", "flat", "free"],
    })
      .notNull()
      .default("flat"),
    handlingTimeBusinessDays: integer("handling_time_business_days")
      .notNull()
      .default(3),
    shippingOriginCountry: text("shipping_origin_country")
      .notNull()
      .default("US"),
    shippingOriginRegion: text("shipping_origin_region"),
    shippingOriginStreet1: text("shipping_origin_street_1"),
    shippingOriginStreet2: text("shipping_origin_street_2"),
    shippingOriginCity: text("shipping_origin_city"),
    shippingOriginPostalCode: text("shipping_origin_postal_code"),
    shippingOriginPhone: text("shipping_origin_phone"),
    defaultPackageLength: text("default_package_length")
      .notNull()
      .default("12"),
    defaultPackageWidth: text("default_package_width")
      .notNull()
      .default("9"),
    defaultPackageHeight: text("default_package_height")
      .notNull()
      .default("6"),
    defaultPackageWeight: text("default_package_weight")
      .notNull()
      .default("2"),
    shippingPolicySummary: text("shipping_policy_summary")
      .notNull()
      .default(""),
    returnPolicySummary: text("return_policy_summary").notNull().default(""),
    sellerTermsVersion: text("seller_terms_version"),
    sellerTermsAcceptedAt: text("seller_terms_accepted_at"),
    taxInfoStatus: text("tax_info_status", {
      enum: ["not_checked", "collecting", "ready", "needs_attention"],
    })
      .notNull()
      .default("not_checked"),
    taxInfoVerifiedAt: text("tax_info_verified_at"),
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
    check(
      "sellers_handling_time_range",
      sql`${table.handlingTimeBusinessDays} BETWEEN 1 AND 10`,
    ),
  ],
);

export const sellerAddresses = sqliteTable(
  "seller_addresses",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    street1: text("street_1").notNull(),
    street2: text("street_2"),
    city: text("city").notNull(),
    region: text("region"),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("US"),
    phone: text("phone").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    index("seller_addresses_seller_idx").on(
      table.sellerId,
      table.isDefault,
      table.createdAt,
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

// Shared model identity. Prices, stock, condition and seller photos live on listings.
export const catalogProducts = sqliteTable(
  "catalog_products",
  {
    id: text("id").primaryKey(),
    modelManufacturer: text("model_car_manufacturer").notNull(),
    manufacturerKey: text("manufacturer_key").notNull(),
    manufacturerSku: text("manufacturer_sku"),
    skuKey: text("sku_key"),
    scale: text("scale").notNull(),
    vehicleMake: text("vehicle_make").notNull(),
    vehicleModel: text("vehicle_model").notNull(),
    vehicleVariant: text("vehicle_variant"),
    vehicleYear: text("vehicle_year"),
    color: text("color"),
    livery: text("livery"),
    releaseYear: text("release_year"),
    edition: text("edition"),
    packagingVariant: text("packaging_variant"),
    versionKind: text("version_kind").notNull().default("regular"),
    setContents: text("set_contents"),
    releaseStatus: text("release_status").notNull().default("unknown"),
    manufacturerRelease: text("manufacturer_release"),
    releaseSource: text("release_source"),
    releaseCheckedAt: text("release_checked_at"),
    previewMedia: integer("preview_media", { mode: "boolean" }).notNull().default(false),
    material: text("material").notNull().default(""),
    upc: text("upc"),
    ean: text("ean"),
    gtinKey: text("gtin_key"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    primaryImageUrl: text("primary_image_url"),
    createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "set null" }),
    catalogStatus: text("catalog_status", { enum: ["unverified", "verified", "needs_review", "archived"] }).notNull().default("unverified"),
    mergedIntoId: text("merged_into_id").references((): AnySQLiteColumn => catalogProducts.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("catalog_manufacturer_sku_idx").on(table.manufacturerKey, table.skuKey),
    uniqueIndex("catalog_sku_identity_unique").on(table.manufacturerKey, table.skuKey,
      sql`lower(${table.scale})`, sql`lower(${table.vehicleMake})`, sql`lower(${table.vehicleModel})`,
      sql`lower(coalesce(${table.vehicleVariant}, ''))`, sql`lower(coalesce(${table.color}, ''))`,
      sql`lower(coalesce(${table.livery}, ''))`, sql`lower(coalesce(${table.edition}, ''))`,
      sql`lower(coalesce(${table.packagingVariant}, ''))`, table.versionKind, sql`lower(coalesce(${table.setContents}, ''))`),
    uniqueIndex("catalog_gtin_unique").on(table.gtinKey),
    index("catalog_attributes_idx").on(table.manufacturerKey, table.scale, table.vehicleMake, table.vehicleModel),
    index("catalog_status_idx").on(table.catalogStatus, table.createdAt),
  ],
);

// The historical `products` table is seller inventory, not the canonical catalog.
// Keep its IDs stable for carts, orders, messages, and photos. Migration triggers
// require catalog_product_id on every insert/update after backfilling old rows.
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    catalogProductId: text("catalog_product_id").references(() => catalogProducts.id, { onDelete: "restrict" }),
    conditionNotes: text("condition_notes").notNull().default(""),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    shipFromAddressId: text("ship_from_address_id").references(
      () => sellerAddresses.id,
      { onDelete: "set null" },
    ),
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
    packageLength: text("package_length"),
    packageWidth: text("package_width"),
    packageHeight: text("package_height"),
    packageWeight: text("package_weight"),
    currency: text("currency").notNull().default("usd"),
    inventoryQuantity: integer("inventory_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    availabilityType: text("availability_type", {
      enum: ["in_stock", "preorder"],
    })
      .notNull()
      .default("in_stock"),
    releaseDate: text("release_date"),
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
    index("listings_catalog_product_idx").on(table.catalogProductId, table.status),
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
    index("products_ship_from_address_idx").on(table.shipFromAddressId),
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

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    buyerUserId: text("buyer_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productSlugSnapshot: text("product_slug_snapshot").notNull(),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    productImageUrlSnapshot: text("product_image_url_snapshot"),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    lastMessageAt: text("last_message_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    buyerLastReadAt: text("buyer_last_read_at"),
    sellerLastReadAt: text("seller_last_read_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversations_buyer_seller_product_unique").on(
      table.buyerUserId,
      table.sellerId,
      table.productId,
    ),
    index("conversations_buyer_activity_idx").on(
      table.buyerUserId,
      table.lastMessageAt,
    ),
    index("conversations_seller_activity_idx").on(
      table.sellerId,
      table.lastMessageAt,
    ),
  ],
);

export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("conversation_messages_thread_idx").on(
      table.conversationId,
      table.createdAt,
    ),
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

export const availabilityAlerts = sqliteTable(
  "availability_alerts",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    status: text("status", {
      enum: ["active", "notified", "unsubscribed"],
    })
      .notNull()
      .default("active"),
    consentAt: text("consent_at").notNull(),
    notifiedAt: text("notified_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("availability_alerts_product_email_unique").on(
      table.productId,
      table.email,
    ),
    uniqueIndex("availability_alerts_token_unique").on(table.unsubscribeToken),
    index("availability_alerts_product_status_idx").on(
      table.productId,
      table.status,
    ),
    index("availability_alerts_user_idx").on(table.userId, table.createdAt),
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

export const taxProfiles = sqliteTable("tax_profiles", {
  id: text("id").primaryKey(),
  businessStartedAt: text("business_started_at"),
  businessApprovedAt: text("business_approved_at"),
  businessLaunchStatus: text("business_launch_status", { enum: ["not_set", "prelaunch", "launched"] }).notNull().default("not_set"),
  legalStructure: text("legal_structure", {
    enum: ["sole_proprietor"],
  })
    .notNull()
    .default("sole_proprietor"),
  homeState: text("home_state").notNull().default("CA"),
  productTaxCode: text("product_tax_code")
    .notNull()
    .default("txcd_99999999"),
  sellerPermitStatus: text("seller_permit_status", {
    enum: ["not_checked", "active", "needs_attention"],
  })
    .notNull()
    .default("not_checked"),
  marketplaceFacilitatorStatus: text("marketplace_facilitator_status", {
    enum: ["not_checked", "confirmed", "needs_attention"],
  })
    .notNull()
    .default("not_checked"),
  stripeCaliforniaRegistrationStatus: text(
    "stripe_california_registration_status",
    { enum: ["not_checked", "active", "needs_attention"] },
  )
    .notNull()
    .default("not_checked"),
  salesTaxFilingFrequency: text("sales_tax_filing_frequency", {
    enum: ["not_set", "monthly", "quarterly", "annual"],
  })
    .notNull()
    .default("not_set"),
  nextSalesTaxDueAt: text("next_sales_tax_due_at"),
  caAccountVerifiedAt: text("ca_account_verified_at"),
  sellerDocumentationIssued: integer("seller_documentation_issued", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  w9CollectionReady: integer("w9_collection_ready", { mode: "boolean" })
    .notNull()
    .default(false),
  stripeTaxReportingReady: integer("stripe_tax_reporting_ready", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  incomeTaxReserveBps: integer("income_tax_reserve_bps")
    .notNull()
    .default(0),
  notes: text("notes").notNull().default(""),
  updatedBy: text("updated_by"),
  ...timestamps,
});

export const taxTasks = sqliteTable(
  "tax_tasks",
  {
    id: text("id").primaryKey(),
    kind: text("kind", {
      enum: [
        "ca_sales_tax",
        "federal_estimated_tax",
        "ca_estimated_tax",
        "annual_income_tax",
        "seller_reporting",
        "other",
      ],
    }).notNull(),
    title: text("title").notNull(),
    jurisdiction: text("jurisdiction").notNull().default(""),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    dueAt: text("due_at").notNull(),
    status: text("status", {
      enum: ["upcoming", "ready", "filed", "paid", "not_required"],
    })
      .notNull()
      .default("upcoming"),
    amountDueCents: integer("amount_due_cents"),
    amountPaidCents: integer("amount_paid_cents"),
    filedAt: text("filed_at"),
    paidAt: text("paid_at"),
    confirmationReference: text("confirmation_reference")
      .notNull()
      .default(""),
    notes: text("notes").notNull().default(""),
    calendarKey: text("calendar_key"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tax_tasks_calendar_key_unique").on(table.calendarKey),
    index("tax_tasks_due_idx").on(table.status, table.dueAt),
    check(
      "tax_tasks_amounts_nonnegative",
      sql`(${table.amountDueCents} IS NULL OR ${table.amountDueCents} >= 0) AND (${table.amountPaidCents} IS NULL OR ${table.amountPaidCents} >= 0)`,
    ),
  ],
);

export const businessLedgerEntries = sqliteTable(
  "business_ledger_entries",
  {
    id: text("id").primaryKey(),
    entryType: text("entry_type", {
      enum: ["expense", "owner_draw", "other_income"],
    }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    vendor: text("vendor").notNull().default(""),
    occurredAt: text("occurred_at").notNull(),
    amountCents: integer("amount_cents").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["active", "voided"] })
      .notNull()
      .default("active"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    index("business_ledger_date_idx").on(table.status, table.occurredAt),
    check("business_ledger_amount_positive", sql`${table.amountCents} > 0`),
  ],
);

export const taxActivity = sqliteTable(
  "tax_activity",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    summary: text("summary").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("tax_activity_created_idx").on(table.createdAt)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    isTestOrder: integer("is_test_order", { mode: "boolean" }).notNull().default(false),
    testOrderReason: text("test_order_reason"),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerUserId: text("buyer_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    checkoutGroupId: text("checkout_group_id").references(() => checkoutGroups.id),
    checkoutReservationId: text("checkout_reservation_id").references(() => checkoutReservations.id),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeRefundId: text("stripe_refund_id"),
    preorderDepositCents: integer("preorder_deposit_cents").notNull().default(0),
    paymentFlow: text("payment_flow", {
      enum: ["destination", "separate"],
    })
      .notNull()
      .default("destination"),
    stripeTransferGroup: text("stripe_transfer_group"),
    stripeTransferId: text("stripe_transfer_id"),
    sellerTransferStatus: text("seller_transfer_status", {
      enum: [
        "pending",
        "processing",
        "transferred",
        "failed",
        "cancelled",
        "reversed",
      ],
    })
      .notNull()
      .default("transferred"),
    sellerTransferAmountCents: integer("seller_transfer_amount_cents")
      .notNull()
      .default(0),
    sellerTransferReversedCents: integer("seller_transfer_reversed_cents")
      .notNull()
      .default(0),
    sellerTransferProcessingAt: text("seller_transfer_processing_at"),
    sellerTransferredAt: text("seller_transferred_at"),
    sellerTransferLastError: text("seller_transfer_last_error"),
    buyerEmail: text("buyer_email").notNull(),
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    shippingMode: text("shipping_mode", {
      enum: ["calculated", "flat", "free"],
    })
      .notNull()
      .default("flat"),
    selectedShippingCarrier: text("selected_shipping_carrier"),
    selectedShippingService: text("selected_shipping_service"),
    selectedShippingServiceToken: text("selected_shipping_service_token"),
    selectedShippingEstimatedDays: integer("selected_shipping_estimated_days"),
    fulfillmentService: text("fulfillment_service"),
    fulfillmentEstimatedDays: integer("fulfillment_estimated_days"),
    marketplaceFeeBps: integer("marketplace_fee_bps")
      .notNull()
      .default(1000),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    paymentProcessingFeeCents: integer("payment_processing_fee_cents"),
    processingFeePayer: text("processing_fee_payer", { enum: ["platform", "seller"] }).notNull().default("platform"),
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
    shipFromAddress: text("ship_from_address").notNull().default("{}"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    paidAt: text("paid_at"),
    shipByAt: text("ship_by_at"),
    shippedAt: text("shipped_at"),
    deliveredAt: text("delivered_at"),
    refundRequestDeadline: text("refund_request_deadline"),
    protectionPolicyVersion: text("protection_policy_version").notNull().default("delivery-3-v1"),
    payoutEligibleAt: text("payout_eligible_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    index("orders_checkout_session_idx").on(
      table.stripeCheckoutSessionId,
    ),
    uniqueIndex("orders_checkout_reservation_unique").on(table.checkoutReservationId),
    uniqueIndex("orders_stripe_transfer_unique").on(table.stripeTransferId),
    index("orders_status_idx").on(table.paymentStatus, table.fulfillmentStatus),
    index("orders_transfer_release_idx").on(
      table.paymentFlow,
      table.sellerTransferStatus,
      table.payoutEligibleAt,
    ),
    index("orders_buyer_user_idx").on(table.buyerUserId, table.createdAt),
    check(
      "orders_money_nonnegative",
      sql`
      ${table.subtotalCents} >= 0 AND ${table.shippingCents} >= 0 AND
      ${table.platformFeeCents} >= 0 AND ${table.taxCents} >= 0 AND ${table.totalCents} >= 0 AND
      ${table.refundedAmountCents} >= 0 AND ${table.refundedAmountCents} <= ${table.totalCents} AND
      ${table.sellerTransferAmountCents} >= 0 AND ${table.sellerTransferReversedCents} >= 0 AND
      ${table.sellerTransferReversedCents} <= ${table.sellerTransferAmountCents}
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
    availabilityTypeSnapshot: text("availability_type_snapshot", {
      enum: ["in_stock", "preorder"],
    })
      .notNull()
      .default("in_stock"),
    releaseDateSnapshot: text("release_date_snapshot"),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_price_nonnegative", sql`${table.unitPriceCents} >= 0`),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const shippingQuotes = sqliteTable(
  "shipping_quotes",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    shippoShipmentId: text("shippo_shipment_id").notNull(),
    orderIds: text("order_ids").notNull(),
    rates: text("rates").notNull(),
    parcelLength: text("parcel_length").notNull(),
    parcelWidth: text("parcel_width").notNull(),
    parcelHeight: text("parcel_height").notNull(),
    parcelWeight: text("parcel_weight").notNull(),
    declaredValueCents: integer("declared_value_cents").notNull(),
    insuranceRequired: integer("insurance_required", { mode: "boolean" })
      .notNull()
      .default(false),
    signatureRequired: integer("signature_required", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", {
      enum: ["quoted", "purchasing", "purchased", "failed", "expired"],
    })
      .notNull()
      .default("quoted"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("shipping_quotes_shippo_unique").on(table.shippoShipmentId),
    index("shipping_quotes_seller_status_idx").on(
      table.sellerId,
      table.status,
      table.expiresAt,
    ),
    check(
      "shipping_quotes_value_nonnegative",
      sql`${table.declaredValueCents} >= 0`,
    ),
  ],
);

export const checkoutShippingQuotes = sqliteTable(
  "checkout_shipping_quotes",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    buyerUserId: text("buyer_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    shippoShipmentId: text("shippo_shipment_id").notNull(),
    cartFingerprint: text("cart_fingerprint").notNull(),
    destinationAddress: text("destination_address").notNull(),
    rates: text("rates").notNull(),
    parcelLength: text("parcel_length").notNull(),
    parcelWidth: text("parcel_width").notNull(),
    parcelHeight: text("parcel_height").notNull(),
    parcelWeight: text("parcel_weight").notNull(),
    declaredValueCents: integer("declared_value_cents").notNull(),
    status: text("status", {
      enum: ["active", "used", "expired"],
    })
      .notNull()
      .default("active"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("checkout_shipping_quotes_shippo_unique").on(
      table.shippoShipmentId,
    ),
    index("checkout_shipping_quotes_seller_status_idx").on(
      table.sellerId,
      table.status,
      table.expiresAt,
    ),
    check(
      "checkout_shipping_quotes_value_nonnegative",
      sql`${table.declaredValueCents} >= 0`,
    ),
  ],
);

export const shipments = sqliteTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => shippingQuotes.id),
    shippoShipmentId: text("shippo_shipment_id").notNull(),
    shippoTransactionId: text("shippo_transaction_id").notNull(),
    shippoRateId: text("shippo_rate_id").notNull(),
    carrier: text("carrier").notNull(),
    serviceLevel: text("service_level").notNull(),
    rateAmountCents: integer("rate_amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    parcelLength: text("parcel_length").notNull(),
    parcelWidth: text("parcel_width").notNull(),
    parcelHeight: text("parcel_height").notNull(),
    parcelWeight: text("parcel_weight").notNull(),
    declaredValueCents: integer("declared_value_cents").notNull(),
    insuranceRequired: integer("insurance_required", { mode: "boolean" })
      .notNull()
      .default(false),
    signatureRequired: integer("signature_required", { mode: "boolean" })
      .notNull()
      .default(false),
    trackingNumber: text("tracking_number").notNull(),
    trackingUrl: text("tracking_url"),
    labelFileType: text("label_file_type").notNull().default("PDF_4x6"),
    status: text("status", {
      enum: [
        "label_created",
        "pre_transit",
        "in_transit",
        "delivered",
        "returned",
        "failure",
        "unknown",
      ],
    })
      .notNull()
      .default("label_created"),
    statusDetails: text("status_details").notNull().default(""),
    eta: text("eta"),
    shippedAt: text("shipped_at"),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("shipments_quote_unique").on(table.quoteId),
    uniqueIndex("shipments_transaction_unique").on(table.shippoTransactionId),
    index("shipments_seller_status_idx").on(
      table.sellerId,
      table.status,
      table.createdAt,
    ),
    index("shipments_tracking_idx").on(table.carrier, table.trackingNumber),
    check(
      "shipments_money_nonnegative",
      sql`${table.rateAmountCents} >= 0 AND ${table.declaredValueCents} >= 0`,
    ),
  ],
);

export const shipmentOrders = sqliteTable(
  "shipment_orders",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("shipment_orders_order_unique").on(table.orderId),
    uniqueIndex("shipment_orders_pair_unique").on(
      table.shipmentId,
      table.orderId,
    ),
  ],
);

export const trackingEvents = sqliteTable(
  "tracking_events",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    status: text("status").notNull(),
    statusDetails: text("status_details").notNull().default(""),
    statusDate: text("status_date").notNull(),
    location: text("location").notNull().default("{}"),
    source: text("source", { enum: ["label", "poll", "webhook"] })
      .notNull()
      .default("webhook"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("tracking_events_key_unique").on(table.eventKey),
    index("tracking_events_shipment_idx").on(table.shipmentId, table.statusDate),
  ],
);

export const sellerFeedback = sqliteTable(
  "seller_feedback",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    buyerUserId: text("buyer_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("seller_feedback_order_unique").on(table.orderId),
    index("seller_feedback_seller_idx").on(table.sellerId, table.createdAt),
    check(
      "seller_feedback_rating_range",
      sql`${table.rating} BETWEEN 1 AND 5`,
    ),
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

export const resolutionNotifications = sqliteTable(
  "resolution_notifications",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    kind: text("kind", {
      enum: [
        "case_opened",
        "response",
        "evidence",
        "return_authorized",
        "escalation",
        "refund",
        "deadline",
      ],
    }).notNull(),
    recipientRole: text("recipient_role", {
      enum: ["buyer", "seller", "support"],
    }).notNull(),
    recipientEmail: text("recipient_email").notNull(),
    message: text("message"),
    deadlineAt: text("deadline_at"),
    status: text("status", { enum: ["pending", "sent"] })
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("resolution_notifications_event_unique").on(table.eventKey),
    index("resolution_notifications_pending_idx").on(
      table.status,
      table.createdAt,
    ),
    index("resolution_notifications_case_idx").on(
      table.caseId,
      table.createdAt,
    ),
    check(
      "resolution_notifications_attempts_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
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

export const disputes = sqliteTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    stripeChargeId: text("stripe_charge_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: text("status").notNull(),
    reason: text("reason").notNull().default(""),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    evidenceDueBy: text("evidence_due_by"),
    closedAt: text("closed_at"),
    ...timestamps,
  },
  (table) => [
    index("disputes_order_idx").on(table.orderId),
    index("disputes_status_idx").on(table.status, table.updatedAt),
  ],
);

export const sellerAlerts = sqliteTable(
  "seller_alerts",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["account_updated", "payout_failed", "external_account_updated"],
    }).notNull(),
    severity: text("severity", { enum: ["info", "warning", "critical"] })
      .notNull()
      .default("info"),
    message: text("message").notNull(),
    sourceObjectId: text("source_object_id"),
    stripeEventId: text("stripe_event_id").notNull(),
    acknowledged: integer("acknowledged", { mode: "boolean" })
      .notNull()
      .default(false),
    acknowledgedAt: text("acknowledged_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("seller_alerts_stripe_event_unique").on(table.stripeEventId),
    index("seller_alerts_seller_idx").on(
      table.sellerId,
      table.acknowledged,
      table.createdAt,
    ),
    index("seller_alerts_type_idx").on(table.type, table.createdAt),
  ],
);

export const checkoutGroups = sqliteTable("checkout_groups", {
  id: text("id").primaryKey(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
  status: text("status", { enum: ["pending", "completed", "released"] }).notNull().default("pending"),
  currency: text("currency").notNull(),
  totalBeforeTaxCents: integer("total_before_tax_cents").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const combinedShippingRequests = sqliteTable("combined_shipping_requests", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull().references(() => sellers.id),
  buyerUserId: text("buyer_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "quoted", "declined", "cancelled", "used"] }).notNull().default("pending"),
  items: text("items").notNull(),
  cartFingerprint: text("cart_fingerprint").notNull(),
  destinationAddress: text("destination_address").notNull(),
  currency: text("currency").notNull(),
  amountCents: integer("amount_cents"),
  carrier: text("carrier"),
  service: text("service"),
  estimatedDays: integer("estimated_days"),
  sellerNote: text("seller_note").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("combined_shipping_buyer_idx").on(table.buyerUserId, table.createdAt),
  index("combined_shipping_seller_idx").on(table.sellerId, table.status),
  check("combined_shipping_amount_valid", sql`${table.amountCents} IS NULL OR ${table.amountCents} >= 0`),
]);

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
    checkoutGroupId: text("checkout_group_id").references(() => checkoutGroups.id),
    combinedShippingRequestId: text("combined_shipping_request_id").references(() => combinedShippingRequests.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "completed", "released"] })
      .notNull()
      .default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    shippingMode: text("shipping_mode", {
      enum: ["calculated", "flat", "free"],
    })
      .notNull()
      .default("flat"),
    checkoutShippingQuoteId: text("checkout_shipping_quote_id").references(
      () => checkoutShippingQuotes.id,
    ),
    selectedShippingRateId: text("selected_shipping_rate_id"),
    selectedShippingCarrier: text("selected_shipping_carrier"),
    selectedShippingService: text("selected_shipping_service"),
    selectedShippingServiceToken: text("selected_shipping_service_token"),
    selectedShippingEstimatedDays: integer("selected_shipping_estimated_days"),
    quotedShippingAddress: text("quoted_shipping_address"),
    shipFromAddress: text("ship_from_address").notNull().default("{}"),
    marketplaceFeeBps: integer("marketplace_fee_bps")
      .notNull()
      .default(1000),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    currency: text("currency").notNull(),
    policyVersion: text("policy_version"),
    protectionPolicyVersion: text("protection_policy_version").notNull().default("delivery-3-v1"),
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
    index("checkout_reservations_session_idx").on(
      table.stripeCheckoutSessionId,
    ),
    index("checkout_reservations_group_idx").on(table.checkoutGroupId),
    uniqueIndex("checkout_reservations_combined_shipping_unique").on(table.combinedShippingRequestId),
    index("checkout_reservations_status_idx").on(table.status, table.expiresAt),
    index("checkout_reservations_buyer_idx").on(table.buyerUserId),
    uniqueIndex("checkout_reservations_shipping_quote_unique").on(
      table.checkoutShippingQuoteId,
    ),
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
    availabilityTypeSnapshot: text("availability_type_snapshot", {
      enum: ["in_stock", "preorder"],
    })
      .notNull()
      .default("in_stock"),
    releaseDateSnapshot: text("release_date_snapshot"),
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
