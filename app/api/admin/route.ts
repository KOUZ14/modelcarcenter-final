import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  communitySubscribers,
  orderItems,
  orders,
  productImages,
  products,
  sellerApplications,
  sellers,
  wantedRequests,
} from "@/db/schema";
import { requireAdminApi } from "@/lib/admin-auth";
import {
  canApproveCollectorListing,
  isCollectorListingAwaitingReview,
} from "@/lib/account-rules";
import { commitInventoryCsv, previewInventoryCsv } from "@/lib/csv-import";
import { config } from "@/lib/config";
import {
  determineMarketplaceFee,
  foundingSellerRatePeriod,
  isEligibleForFoundingSellerRate,
} from "@/lib/fees";
import {
  escapeHtml,
  sendEmail,
  sendListingReviewEmail,
  sendModelHuntMatchEmail,
  sendShipmentEmail,
} from "@/lib/email";
import { readJsonObject, routeError } from "@/lib/http";
import {
  decideAdminResolutionCase,
  getAdminResolutionCases,
} from "@/lib/resolution";
import {
  createAccountOnboardingLink,
  createConnectedAccount,
  createFullRefund,
  retrieveStripeAccount,
} from "@/lib/stripe";
import {
  assertCollectibleListingReady,
  cleanText,
  integer,
  isEmail,
  legacyConditionFromCollectibleDetails,
  makeSlug,
  normalizeEmail,
  optionalHttpUrl,
  parseCollectibleDetails,
  requiredString,
  ValidationError,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try {
    const section =
      new URL(request.url).searchParams.get("section") ?? "overview";
    return Response.json(await loadAdminSection(section));
  } catch (error) {
    return routeError(error, "Admin data is temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 60);
    const result = await runAdminAction(action, payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return routeError(error, "The admin action could not be completed.");
  }
}

async function loadAdminSection(section: string) {
  const db = getDb();
  if (section === "overview") {
    const [
      activeProducts,
      activeSellers,
      openHunts,
      paidOrders,
      unfulfilledOrders,
      signups,
      applications,
      collectorListingsAwaitingReview,
    ] = await Promise.all([
      count(products, eq(products.status, "active")),
      count(sellers, eq(sellers.status, "active")),
      count(wantedRequests, eq(wantedRequests.status, "open")),
      count(orders, eq(orders.paymentStatus, "paid")),
      count(
        orders,
        and(
          eq(orders.paymentStatus, "paid"),
          eq(orders.fulfillmentStatus, "unfulfilled"),
        )!,
      ),
      count(communitySubscribers),
      count(sellerApplications, eq(sellerApplications.status, "pending")),
      count(products, eq(products.status, "pending_review")),
    ]);
    const [scaleDemand, makeDemand, manufacturerDemand] = await Promise.all([
      db
        .select({
          label: wantedRequests.preferredScale,
          count: sql<number>`count(*)`,
        })
        .from(wantedRequests)
        .where(eq(wantedRequests.status, "open"))
        .groupBy(wantedRequests.preferredScale)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
      db
        .select({
          label: wantedRequests.vehicleMake,
          count: sql<number>`count(*)`,
        })
        .from(wantedRequests)
        .where(eq(wantedRequests.status, "open"))
        .groupBy(wantedRequests.vehicleMake)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
      db
        .select({
          label: wantedRequests.modelManufacturer,
          count: sql<number>`count(*)`,
        })
        .from(wantedRequests)
        .where(
          and(
            eq(wantedRequests.status, "open"),
            sql`${wantedRequests.modelManufacturer} IS NOT NULL`,
          ),
        )
        .groupBy(wantedRequests.modelManufacturer)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
    ]);
    return {
      section,
      counts: {
        activeProducts,
        activeSellers,
        openHunts,
        paidOrders,
        unfulfilledOrders,
        signups,
        applications,
        collectorListingsAwaitingReview,
      },
      demand: {
        scales: scaleDemand,
        makes: makeDemand,
        manufacturers: manufacturerDemand,
      },
    };
  }
  if (section === "sellers") {
    const [sellerRows, applications] = await Promise.all([
      db.select().from(sellers).orderBy(desc(sellers.createdAt)),
      db
        .select()
        .from(sellerApplications)
        .orderBy(desc(sellerApplications.createdAt)),
    ]);
    return {
      section,
      sellers: sellerRows.map((seller) => ({
        ...seller,
        ...determineMarketplaceFee(seller),
      })),
      applications,
    };
  }
  if (section === "products") {
    const productRows = await db
      .select({
        id: products.id,
        sellerId: products.sellerId,
        sellerName: sellers.storeName,
        slug: products.slug,
        sellerSku: products.sellerSku,
        title: products.title,
        scale: products.scale,
        description: products.description,
        modelManufacturer: products.modelManufacturer,
        vehicleMake: products.vehicleMake,
        vehicleModel: products.vehicleModel,
        vehicleYear: products.vehicleYear,
        color: products.color,
        condition: products.condition,
        modelCondition: products.modelCondition,
        packagingCondition: products.packagingCondition,
        originalBoxStatus: products.originalBoxStatus,
        missingParts: products.missingParts,
        defects: products.defects,
        restorationCustomization: products.restorationCustomization,
        material: products.material,
        productNumber: products.productNumber,
        editionSerial: products.editionSerial,
        coaStatus: products.coaStatus,
        accessories: products.accessories,
        provenance: products.provenance,
        photoFrontChecked: products.photoFrontChecked,
        photoRearChecked: products.photoRearChecked,
        photoSidesChecked: products.photoSidesChecked,
        photoBaseChecked: products.photoBaseChecked,
        photoPackagingChecked: products.photoPackagingChecked,
        photoIssuesChecked: products.photoIssuesChecked,
        keywords: products.keywords,
        priceCents: products.priceCents,
        inventoryQuantity: products.inventoryQuantity,
        reservedQuantity: products.reservedQuantity,
        status: products.status,
        primaryImageUrl: products.primaryImageUrl,
        rejectionReason: products.rejectionReason,
        sellerType: sellers.sellerType,
        sellerEmail: sellers.contactEmail,
        sellerStatus: sellers.status,
        stripeChargesEnabled: sellers.stripeChargesEnabled,
        stripePayoutsEnabled: sellers.stripePayoutsEnabled,
      })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .orderBy(desc(products.updatedAt))
      .limit(250);
    const sellerRows = await db
      .select({ id: sellers.id, name: sellers.storeName })
      .from(sellers)
      .orderBy(asc(sellers.storeName));
    const images = await db
      .select()
      .from(productImages)
      .orderBy(asc(productImages.sortOrder));
    return {
      section,
      products: productRows.map((product) => ({
        ...product,
        images: images.filter((image) => image.productId === product.id),
      })),
      sellers: sellerRows,
    };
  }
  if (section === "hunts") {
    const hunts = await db
      .select()
      .from(wantedRequests)
      .orderBy(desc(wantedRequests.createdAt))
      .limit(250);
    const candidateProducts = await db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        vehicleMake: products.vehicleMake,
        vehicleModel: products.vehicleModel,
        scale: products.scale,
        modelManufacturer: products.modelManufacturer,
        priceCents: products.priceCents,
        currency: products.currency,
        sellerName: sellers.storeName,
      })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(and(eq(products.status, "active"), eq(sellers.status, "active")))
      .limit(500);
    return { section, hunts, candidateProducts };
  }
  if (section === "orders") {
    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        sellerName: sellers.storeName,
        buyerEmail: orders.buyerEmail,
        buyerName: orders.buyerName,
        shippingAddress: orders.shippingAddress,
        currency: orders.currency,
        subtotalCents: orders.subtotalCents,
        shippingCents: orders.shippingCents,
        taxCents: orders.taxCents,
        marketplaceFeeBps: orders.marketplaceFeeBps,
        platformFeeCents: orders.platformFeeCents,
        paymentProcessingFeeCents: orders.paymentProcessingFeeCents,
        sellerProceedsCents: orders.sellerProceedsCents,
        totalCents: orders.totalCents,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
      })
      .from(orders)
      .innerJoin(sellers, eq(orders.sellerId, sellers.id))
      .orderBy(desc(orders.createdAt))
      .limit(250);
    const items = await db
      .select()
      .from(orderItems)
      .orderBy(asc(orderItems.id));
    return {
      section,
      orders: orderRows.map((order) => ({
        ...order,
        items: items.filter((item) => item.orderId === order.id),
      })),
    };
  }
  if (section === "resolution") {
    return {
      section,
      cases: await getAdminResolutionCases(),
    };
  }
  throw new ValidationError("Unknown admin section.");
}

async function runAdminAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const db = getDb();
  if (action === "approve_application") {
    const applicationId = requiredString(
      payload.applicationId,
      "applicationId",
      100,
    );
    const application = await db
      .select()
      .from(sellerApplications)
      .where(eq(sellerApplications.id, applicationId))
      .limit(1);
    if (!application[0] || application[0].status !== "pending")
      throw new ValidationError("Pending application not found.");
    const sellerId = crypto.randomUUID();
    const slug = `${makeSlug(application[0].storeName)}-${sellerId.slice(0, 5)}`;
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO sellers
        (id, slug, store_name, contact_name, contact_email, website_url, seller_terms_version, seller_terms_accepted_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        )
        .bind(
          sellerId,
          slug,
          application[0].storeName,
          application[0].contactName,
          application[0].email,
          application[0].website,
          application[0].sellerTermsVersion,
          application[0].sellerTermsAcceptedAt,
        ),
      d1
        .prepare(
          "UPDATE seller_applications SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
        )
        .bind(applicationId),
    ]);
    const email = await sendEmail({
      to: application[0].email,
      subject: "Your Model Car Center store is approved",
      html: `<h1>Your store is approved</h1><p>${escapeHtml(application[0].storeName)} now has access to the Model Car Center Store Console.</p><p><a href="${escapeHtml(config.siteUrl)}/store">Sign in to your Store Console</a> with this email address to manage inventory, orders, and analytics.</p><p>We will guide you through Stripe payout onboarding separately.</p>`,
      text: `${application[0].storeName} is approved for Model Car Center. Sign in with this email address to manage inventory, orders, and analytics: ${config.siteUrl}/store\nWe will guide you through Stripe payout onboarding separately.`,
      idempotencyKey: `seller-approved-${sellerId}`,
    });
    return { sellerId, emailSent: email.sent };
  }
  if (action === "reject_application") {
    const applicationId = requiredString(
      payload.applicationId,
      "applicationId",
      100,
    );
    await db
      .update(sellerApplications)
      .set({ status: "rejected", updatedAt: new Date().toISOString() })
      .where(eq(sellerApplications.id, applicationId));
    return {};
  }
  if (action === "save_seller") return saveSeller(payload);
  if (action === "seller_status") {
    const sellerId = requiredString(payload.sellerId, "sellerId", 100);
    const status = requiredString(payload.status, "status", 30);
    if (!["approved", "onboarding", "active", "suspended"].includes(status))
      throw new ValidationError("Invalid seller status.");
    const seller = await db
      .select()
      .from(sellers)
      .where(eq(sellers.id, sellerId))
      .limit(1);
    if (!seller[0]) throw new ValidationError("Seller not found.");
    if (
      status === "active" &&
      (!seller[0].stripeChargesEnabled || !seller[0].stripePayoutsEnabled)
    )
      throw new ValidationError(
        "Stripe charges and payouts must both be enabled before activation.",
      );
    await db
      .update(sellers)
      .set({
        status: status as "approved" | "onboarding" | "active" | "suspended",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sellers.id, sellerId));
    return {};
  }
  if (action === "assign_founding_seller") {
    const sellerId = requiredString(payload.sellerId, "sellerId", 100);
    const seller = await db
      .select()
      .from(sellers)
      .where(eq(sellers.id, sellerId))
      .limit(1);
    if (!seller[0]) throw new ValidationError("Seller not found.");
    if (!isEligibleForFoundingSellerRate(seller[0])) {
      throw new ValidationError(
        "Only professional stores can receive the founding seller rate.",
      );
    }
    if (seller[0].isFoundingSeller) {
      return {
        foundingRateStartsAt: seller[0].foundingRateStartsAt,
        foundingRateEndsAt: seller[0].foundingRateEndsAt,
      };
    }
    const requestedStart = cleanText(payload.startsAt, 100);
    const start = requestedStart ? new Date(requestedStart) : new Date();
    if (Number.isNaN(start.getTime())) {
      throw new ValidationError("Choose a valid founding rate start date.");
    }
    const period = foundingSellerRatePeriod(start);
    await db
      .update(sellers)
      .set({
        isFoundingSeller: true,
        foundingRateStartsAt: period.startsAt,
        foundingRateEndsAt: period.endsAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sellers.id, sellerId));
    return period;
  }
  if (action === "stripe_onboarding")
    return startStripeOnboarding(
      requiredString(payload.sellerId, "sellerId", 100),
    );
  if (action === "refresh_stripe")
    return refreshStripe(requiredString(payload.sellerId, "sellerId", 100));
  if (action === "save_product") return saveProduct(payload);
  if (action === "product_review") return reviewCollectorListing(payload);
  if (action === "product_status") {
    const id = requiredString(payload.productId, "productId", 100);
    const status = requiredString(payload.status, "status", 20);
    if (!["draft", "active", "inactive", "rejected"].includes(status))
      throw new ValidationError("Invalid product status.");
    if (status === "active") await assertProductPublishReady(id);
    await db
      .update(products)
      .set({
        status: status as "draft" | "active" | "inactive" | "rejected",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, id));
    return {};
  }
  if (action === "preview_import") {
    requiredString(payload.sellerId, "sellerId", 100);
    const result = previewInventoryCsv(String(payload.csv ?? ""));
    return {
      preview: {
        valid: result.valid.slice(0, 100),
        errors: result.errors,
        validCount: result.valid.length,
      },
    };
  }
  if (action === "commit_import") {
    return commitInventoryCsv(
      requiredString(payload.sellerId, "sellerId", 100),
      String(payload.csv ?? ""),
    );
  }
  if (action === "link_hunt") {
    const huntId = requiredString(payload.huntId, "huntId", 100);
    const productId = requiredString(payload.productId, "productId", 100);
    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product[0]) throw new ValidationError("Product not found.");
    await db
      .update(wantedRequests)
      .set({
        matchedProductId: productId,
        status: "possible_match",
        matchedAt: new Date().toISOString(),
      })
      .where(eq(wantedRequests.id, huntId));
    return {};
  }
  if (action === "notify_hunt")
    return notifyHunt(requiredString(payload.huntId, "huntId", 100));
  if (action === "ship_order") return shipOrder(payload);
  if (action === "refund_order") return refundOrder(payload);
  if (action === "admin_case_decision")
    return decideAdminResolutionCase(payload);
  throw new ValidationError("Unknown admin action.");
}

async function assertProductPublishReady(productId: string) {
  const [productRows, imageRows] = await Promise.all([
    getDb().select().from(products).where(eq(products.id, productId)).limit(1),
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(productImages)
      .where(eq(productImages.productId, productId)),
  ]);
  if (!productRows[0]) throw new ValidationError("Product not found.");
  assertCollectibleListingReady(
    productRows[0],
    Number(imageRows[0]?.count ?? 0),
  );
}

async function reviewCollectorListing(payload: Record<string, unknown>) {
  const productId = requiredString(payload.productId, "productId", 100);
  const decision = requiredString(payload.decision, "decision", 20);
  if (!["approve", "reject"].includes(decision))
    throw new ValidationError("Choose approve or reject.");
  const rows = await getDb()
    .select({
      productId: products.id,
      title: products.title,
      slug: products.slug,
      status: products.status,
      sellerType: sellers.sellerType,
      sellerStatus: sellers.status,
      sellerEmail: sellers.contactEmail,
      stripeChargesEnabled: sellers.stripeChargesEnabled,
      stripePayoutsEnabled: sellers.stripePayoutsEnabled,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(eq(products.id, productId))
    .limit(1);
  const listing = rows[0];
  if (
    !listing ||
    !isCollectorListingAwaitingReview({
      sellerType: listing.sellerType,
      listingStatus: listing.status,
    })
  ) {
    throw new ValidationError(
      "Collector listing awaiting review was not found.",
    );
  }
  if (decision === "approve") {
    if (!canApproveCollectorListing(listing)) {
      throw new ValidationError(
        "Seller payout onboarding must be complete before approval.",
      );
    }
    await assertProductPublishReady(productId);
    await getDb()
      .update(products)
      .set({
        status: "active",
        rejectionReason: null,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId));
    await sendListingReviewEmail({
      email: listing.sellerEmail,
      title: listing.title,
      productSlug: listing.slug,
      approved: true,
      productId,
    });
    return { status: "active" };
  }
  const reason = cleanText(payload.reason, 1_000) || null;
  await getDb()
    .update(products)
    .set({
      status: "rejected",
      rejectionReason: reason,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(products.id, productId));
  await sendListingReviewEmail({
    email: listing.sellerEmail,
    title: listing.title,
    productSlug: listing.slug,
    approved: false,
    reason,
    productId,
  });
  return { status: "rejected" };
}

async function saveSeller(payload: Record<string, unknown>) {
  const id = cleanText(payload.id, 100) || crypto.randomUUID();
  const email = normalizeEmail(payload.contactEmail);
  if (!isEmail(email)) throw new ValidationError("Enter a valid seller email.");
  const rawWebsite = cleanText(payload.websiteUrl, 1_500);
  const websiteUrl = optionalHttpUrl(rawWebsite);
  if (rawWebsite && !websiteUrl)
    throw new ValidationError("Seller website must be an http or https URL.");
  const values = {
    id,
    slug:
      cleanText(payload.slug, 100) ||
      `${makeSlug(requiredString(payload.storeName, "storeName", 120))}-${id.slice(0, 5)}`,
    storeName: requiredString(payload.storeName, "storeName", 120),
    contactName: requiredString(payload.contactName, "contactName", 120),
    contactEmail: email,
    websiteUrl,
    logoUrl: optionalHttpUrl(payload.logoUrl),
    description: cleanText(payload.description, 2_000),
    defaultShippingCents: integer(
      payload.defaultShippingCents,
      "defaultShippingCents",
      0,
      1_000_000,
    ),
    shippingPolicySummary: cleanText(payload.shippingPolicySummary, 1_000),
    returnPolicySummary: cleanText(payload.returnPolicySummary, 1_000),
  };
  await getDb()
    .insert(sellers)
    .values({ ...values, status: "approved" })
    .onConflictDoUpdate({
      target: sellers.id,
      set: { ...values, updatedAt: new Date().toISOString() },
    });
  return { sellerId: id };
}

async function startStripeOnboarding(sellerId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(sellers)
    .where(eq(sellers.id, sellerId))
    .limit(1);
  const seller = rows[0];
  if (!seller || !["approved", "onboarding"].includes(seller.status))
    throw new ValidationError("Approve the seller before starting onboarding.");
  let accountId = seller.stripeAccountId;
  if (!accountId) {
    const account = await createConnectedAccount({
      sellerId,
      email: seller.contactEmail,
      storeName: seller.storeName,
    });
    accountId = account.id;
    await db
      .update(sellers)
      .set({
        stripeAccountId: accountId,
        status: "onboarding",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sellers.id, sellerId));
  }
  const link = await createAccountOnboardingLink(accountId);
  const email = await sendEmail({
    to: seller.contactEmail,
    subject: "Complete your Model Car Center payout setup",
    html: `<h1>Complete your payout setup</h1><p>Use Stripe's secure hosted onboarding to provide the business and payout details required to sell through Model Car Center.</p><p><a href="${escapeHtml(link.url)}">Complete Stripe onboarding</a></p><p>This single-use link expires soon. After onboarding, <a href="${escapeHtml(config.siteUrl)}/store">sign in to your Store Console</a> with this email address.</p>`,
    text: `Complete your secure Stripe onboarding for Model Car Center: ${link.url}\nThis single-use link expires soon. After onboarding, sign in to your Store Console with this email address: ${config.siteUrl}/store`,
    idempotencyKey: `onboarding-${sellerId}-${link.expires_at}`,
  });
  return { onboardingUrl: link.url, emailSent: email.sent };
}

async function refreshStripe(sellerId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(sellers)
    .where(eq(sellers.id, sellerId))
    .limit(1);
  const seller = rows[0];
  if (!seller?.stripeAccountId)
    throw new ValidationError("Seller has no Stripe account.");
  const account = await retrieveStripeAccount(seller.stripeAccountId);
  const ready = account.charges_enabled && account.payouts_enabled;
  const status =
    seller.status === "suspended"
      ? "suspended"
      : ready
        ? "active"
        : "onboarding";
  await db
    .update(sellers)
    .set({
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sellers.id, sellerId));
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    status,
  };
}

async function saveProduct(payload: Record<string, unknown>) {
  const id = cleanText(payload.id, 100) || crypto.randomUUID();
  const existing = await getDb()
    .select({ primaryImageUrl: products.primaryImageUrl })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const sellerId = requiredString(payload.sellerId, "sellerId", 100);
  const seller = await getDb()
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.id, sellerId))
    .limit(1);
  if (!seller[0]) throw new ValidationError("Select a valid seller.");
  const title = requiredString(payload.title, "title", 200);
  const sellerSku = requiredString(payload.sellerSku, "sellerSku", 100);
  const collectible = parseCollectibleDetails(payload);
  const values = {
    id,
    sellerId,
    sellerSku,
    title,
    slug:
      cleanText(payload.slug, 100) ||
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
    priceCents: integer(payload.priceCents, "priceCents", 0, 100_000_000),
    inventoryQuantity: integer(
      payload.inventoryQuantity,
      "inventoryQuantity",
      0,
      1_000_000,
    ),
    primaryImageUrl: existing[0]?.primaryImageUrl ?? null,
    keywords: cleanText(payload.keywords, 1_000),
  };
  await getDb()
    .insert(products)
    .values({ ...values, status: "draft", currency: "usd" })
    .onConflictDoUpdate({
      target: products.id,
      set: { ...values, updatedAt: new Date().toISOString() },
    });
  return { productId: id };
}

async function notifyHunt(huntId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: wantedRequests.id,
      referenceCode: wantedRequests.referenceCode,
      collectorEmail: wantedRequests.collectorEmail,
      vehicleMake: wantedRequests.vehicleMake,
      vehicleModel: wantedRequests.vehicleModel,
      matchedProductId: wantedRequests.matchedProductId,
      productTitle: products.title,
      productSlug: products.slug,
      priceCents: products.priceCents,
      currency: products.currency,
      sellerName: sellers.storeName,
    })
    .from(wantedRequests)
    .leftJoin(products, eq(wantedRequests.matchedProductId, products.id))
    .leftJoin(sellers, eq(products.sellerId, sellers.id))
    .where(eq(wantedRequests.id, huntId))
    .limit(1);
  const hunt = rows[0];
  if (
    !hunt?.matchedProductId ||
    !hunt.productTitle ||
    !hunt.productSlug ||
    hunt.priceCents == null ||
    !hunt.currency ||
    !hunt.sellerName
  )
    throw new ValidationError(
      "Link a valid product before notifying the collector.",
    );
  const email = await sendModelHuntMatchEmail({
    email: hunt.collectorEmail,
    referenceCode: hunt.referenceCode,
    requestedModel: `${hunt.vehicleMake} ${hunt.vehicleModel}`,
    productTitle: hunt.productTitle,
    sellerName: hunt.sellerName,
    priceCents: hunt.priceCents,
    currency: hunt.currency,
    productSlug: hunt.productSlug,
  });
  if (!email.sent)
    throw new Error(
      "Email is not configured; the collector was not marked as notified.",
    );
  await db
    .update(wantedRequests)
    .set({ status: "matched", notifiedAt: new Date().toISOString() })
    .where(eq(wantedRequests.id, huntId));
  return { emailSent: true };
}

async function shipOrder(payload: Record<string, unknown>) {
  const orderId = requiredString(payload.orderId, "orderId", 100);
  const carrier = requiredString(payload.carrier, "carrier", 100);
  const trackingNumber = requiredString(
    payload.trackingNumber,
    "trackingNumber",
    200,
  );
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (!order || order.paymentStatus !== "paid")
    throw new ValidationError("Only paid orders can be marked shipped.");
  await db
    .update(orders)
    .set({
      carrier,
      trackingNumber,
      fulfillmentStatus: "shipped",
      shippedAt: order.shippedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orders.id, orderId));
  const email = await sendShipmentEmail({
    buyerEmail: order.buyerEmail,
    orderNumber: order.orderNumber,
    carrier,
    trackingNumber,
  });
  return { emailSent: email.sent };
}

async function refundOrder(payload: Record<string, unknown>) {
  const orderId = requiredString(payload.orderId, "orderId", 100);
  const restock = payload.restock === true;
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (
    !order ||
    !["paid", "partially_refunded"].includes(order.paymentStatus) ||
    !order.stripePaymentIntentId
  )
    throw new ValidationError(
      "Only a paid, unrefunded Stripe order can be refunded.",
    );
  const refund = await createFullRefund({
    orderId,
    paymentIntentId: order.stripePaymentIntentId,
    chargeId: order.stripeChargeId,
  });
  if (refund.status !== "succeeded")
    return { refundId: refund.id, refundStatus: refund.status, pending: true };
  const d1 = getD1();
  const statements = [
    d1
      .prepare(
        `UPDATE orders SET payment_status = 'refunded', refunded_amount_cents = total_cents, stripe_refund_id = ?, fulfillment_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status IN ('paid', 'partially_refunded')`,
      )
      .bind(refund.id, orderId),
  ];
  if (restock) {
    const items = await db
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    items
      .filter((item) => item.productId)
      .forEach((item) =>
        statements.push(
          d1
            .prepare(
              `UPDATE products SET inventory_quantity = inventory_quantity + ?, status = CASE WHEN status = 'sold_out' THEN 'active' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(item.quantity, item.productId),
        ),
      );
  }
  await d1.batch(statements);
  return {
    refundId: refund.id,
    refundStatus: refund.status,
    restocked: restock,
  };
}

async function count(
  table:
    | typeof products
    | typeof sellers
    | typeof wantedRequests
    | typeof orders
    | typeof communitySubscribers
    | typeof sellerApplications,
  where?: ReturnType<typeof eq>,
) {
  const query = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(table as typeof products);
  const rows = where ? await query.where(where) : await query;
  return Number(rows[0]?.count ?? 0);
}
