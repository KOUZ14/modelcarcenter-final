import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveCollectorListing,
  canClaimGuestRecord,
  canClaimProfessionalStore,
  canFulfillSellerOrder,
  cartMergeDecision,
  isCollectorListingAwaitingReview,
  mergeCartItems,
  ownsProduct,
  safeReturnPath,
  uniqueWishlistIds,
} from "../lib/account-rules.ts";
import { buildStoreAnalytics } from "../lib/store-rules.ts";
import {
  detectListingImageType,
  MAX_LISTING_IMAGE_BYTES,
  validateListingImageBatch,
} from "../lib/listing-images.ts";
import {
  collectorAuthPolicy,
  secureAuthCookiesFor,
} from "../lib/auth-policy.ts";
import { readFile } from "node:fs/promises";

function cartItem(productId, sellerId, quantity = 1) {
  return {
    productId,
    slug: productId,
    sellerId,
    sellerName: sellerId,
    title: productId,
    scale: "1:18",
    modelManufacturer: "Maker",
    imageUrl: null,
    priceCents: 10_000,
    currency: "usd",
    availableQuantity: 10,
    shippingCents: 500,
    quantity,
  };
}

test("auth return paths reject external redirects", () => {
  assert.equal(safeReturnPath("/account?view=orders"), "/account?view=orders");
  assert.equal(safeReturnPath("https://attacker.example"), "/account");
  assert.equal(safeReturnPath("//attacker.example"), "/account");
});

test("collector auth uses short hashed magic links and production-only secure cookies", () => {
  assert.equal(collectorAuthPolicy.magicLinkExpiresInSeconds, 600);
  assert.equal(collectorAuthPolicy.magicLinkTokenStorage, "hashed");
  assert.equal(collectorAuthPolicy.cookieSameSite, "lax");
  assert.equal(secureAuthCookiesFor("production"), true);
  assert.equal(secureAuthCookiesFor("development"), false);
});

test("listing CRUD and fulfillment require the owning collector", () => {
  assert.equal(
    ownsProduct("collector-a", { ownerUserId: "collector-a" }),
    true,
  );
  assert.equal(
    ownsProduct("collector-b", { ownerUserId: "collector-a" }),
    false,
  );
  assert.equal(
    canFulfillSellerOrder("collector-a", {
      sellerOwnerUserId: "collector-a",
      paymentStatus: "paid",
    }),
    true,
  );
  assert.equal(
    canFulfillSellerOrder("collector-b", {
      sellerOwnerUserId: "collector-a",
      paymentStatus: "paid",
    }),
    false,
  );
  assert.equal(
    canFulfillSellerOrder("collector-a", {
      sellerOwnerUserId: "collector-a",
      paymentStatus: "unpaid",
    }),
    false,
  );
});

test("wishlist merging removes duplicates and invalid identifiers", () => {
  assert.deepEqual(uniqueWishlistIds(["p1", "p1", "", 42, "p2"]), ["p1", "p2"]);
});

test("guest cart merging combines one seller and surfaces cross-seller conflicts", () => {
  const saved = [cartItem("p1", "seller-a", 2)];
  const guest = [cartItem("p1", "seller-a", 3), cartItem("p2", "seller-a", 1)];
  assert.equal(cartMergeDecision(saved, guest), "merge");
  assert.deepEqual(
    mergeCartItems(saved, guest)?.map(({ productId, quantity }) => ({
      productId,
      quantity,
    })),
    [
      { productId: "p1", quantity: 5 },
      { productId: "p2", quantity: 1 },
    ],
  );
  assert.equal(
    cartMergeDecision(saved, [cartItem("p3", "seller-b")]),
    "conflict",
  );
  assert.equal(mergeCartItems(saved, [cartItem("p3", "seller-b")]), null);
});

test("legacy records are claimable only by a verified matching email and only once", () => {
  const base = {
    authenticatedEmail: "Collector@Example.com",
    recordEmail: "collector@example.com",
  };
  assert.equal(
    canClaimGuestRecord({
      ...base,
      emailVerified: true,
      currentOwnerUserId: null,
    }),
    true,
  );
  assert.equal(
    canClaimGuestRecord({
      ...base,
      emailVerified: false,
      currentOwnerUserId: null,
    }),
    false,
  );
  assert.equal(
    canClaimGuestRecord({
      ...base,
      authenticatedEmail: "other@example.com",
      emailVerified: true,
      currentOwnerUserId: null,
    }),
    false,
  );
  assert.equal(
    canClaimGuestRecord({
      ...base,
      emailVerified: true,
      currentOwnerUserId: "existing-owner",
    }),
    false,
  );
});

test("professional stores are claimed only by a verified matching contact email", () => {
  const base = {
    authenticatedEmail: "Owner@Store.example",
    emailVerified: true,
    storeEmail: "owner@store.example",
    storeType: "professional",
    currentOwnerUserId: null,
  };
  assert.equal(canClaimProfessionalStore(base), true);
  assert.equal(
    canClaimProfessionalStore({ ...base, emailVerified: false }),
    false,
  );
  assert.equal(
    canClaimProfessionalStore({ ...base, storeType: "collector" }),
    false,
  );
  assert.equal(
    canClaimProfessionalStore({
      ...base,
      authenticatedEmail: "other@store.example",
    }),
    false,
  );
  assert.equal(
    canClaimProfessionalStore({ ...base, currentOwnerUserId: "owner-1" }),
    false,
  );
});

test("store analytics include paid sales and seller-scoped inventory health", () => {
  const analytics = buildStoreAnalytics(
    [
      {
        id: "paid-1",
        paymentStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        subtotalCents: 30_000,
        platformFeeCents: 3_000,
        createdAt: "2026-08-10T12:00:00.000Z",
      },
      {
        id: "refunded-1",
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        subtotalCents: 90_000,
        platformFeeCents: 9_000,
        createdAt: "2026-08-11T12:00:00.000Z",
      },
    ],
    [
      {
        orderId: "paid-1",
        productTitleSnapshot: "Porsche 911",
        quantity: 2,
        unitPriceCents: 15_000,
      },
      {
        orderId: "refunded-1",
        productTitleSnapshot: "Refunded model",
        quantity: 1,
        unitPriceCents: 90_000,
      },
    ],
    [
      {
        status: "active",
        inventoryQuantity: 3,
        reservedQuantity: 1,
        priceCents: 15_000,
      },
      {
        status: "draft",
        inventoryQuantity: 10,
        reservedQuantity: 0,
        priceCents: 2_000,
      },
    ],
    new Date("2026-08-19T00:00:00.000Z"),
  );
  assert.equal(analytics.paidOrders, 1);
  assert.equal(analytics.unfulfilledOrders, 1);
  assert.equal(analytics.unitsSold, 2);
  assert.equal(analytics.grossSalesCents, 30_000);
  assert.equal(analytics.netSalesCents, 27_000);
  assert.equal(analytics.activeListings, 1);
  assert.equal(analytics.lowStock, 1);
  assert.equal(analytics.inventoryValueCents, 50_000);
  assert.deepEqual(analytics.topProducts, [
    { title: "Porsche 911", units: 2, revenueCents: 30_000 },
  ]);
  assert.deepEqual(analytics.monthlySales.at(-1), {
    key: "2026-08",
    label: "Aug 2026",
    orders: 1,
    grossCents: 30_000,
  });
});

test("collector moderation only reviews pending submissions and gates approval on payouts", () => {
  assert.equal(
    isCollectorListingAwaitingReview({
      sellerType: "collector",
      listingStatus: "pending_review",
    }),
    true,
  );
  assert.equal(
    isCollectorListingAwaitingReview({
      sellerType: "professional",
      listingStatus: "pending_review",
    }),
    false,
  );
  assert.equal(
    isCollectorListingAwaitingReview({
      sellerType: "collector",
      listingStatus: "draft",
    }),
    false,
  );
  assert.equal(
    canApproveCollectorListing({
      sellerStatus: "active",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    }),
    true,
  );
  assert.equal(
    canApproveCollectorListing({
      sellerStatus: "onboarding",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    }),
    false,
  );
  assert.equal(
    canApproveCollectorListing({
      sellerStatus: "active",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: false,
    }),
    false,
  );
});

test("listing image validation enforces count, size, declared MIME, and file signature", () => {
  assert.equal(
    validateListingImageBatch({ currentCount: 7, incomingSizes: [10] }),
    null,
  );
  assert.match(
    validateListingImageBatch({ currentCount: 8, incomingSizes: [10] }),
    /up to 8/,
  );
  assert.match(
    validateListingImageBatch({
      currentCount: 0,
      incomingSizes: [MAX_LISTING_IMAGE_BYTES + 1],
    }),
    /10 MB/,
  );
  assert.deepEqual(
    detectListingImageType(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg"),
    { mime: "image/jpeg", extension: "jpg" },
  );
  assert.equal(
    detectListingImageType(Uint8Array.from([0xff, 0xd8, 0xff]), "image/png"),
    null,
  );
  assert.equal(
    detectListingImageType(
      new TextEncoder().encode("plain text"),
      "image/jpeg",
    ),
    null,
  );
});

test("the account migration is additive and detaches retained records on deletion", async () => {
  const migration = await readFile(
    new URL("../drizzle/0001_spicy_prism.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.match(
    migration,
    /orders` ADD `buyer_user_id` text REFERENCES user\(id\) ON DELETE SET NULL/i,
  );
  assert.match(
    migration,
    /sellers` ADD `owner_user_id` text REFERENCES user\(id\) ON DELETE SET NULL/i,
  );
});

test("buyer-owned orders surface the protected shipment timeline in My Garage", async () => {
  const [collectorStore, accountDashboard, shipmentTimeline] = await Promise.all([
    readFile(new URL("../lib/collector-store.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/account-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/shipment-timeline.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(collectorStore, /eq\(orders\.buyerUserId, userId\)/);
  assert.match(collectorStore, /innerJoin\(shipments,/);
  assert.match(collectorStore, /shipmentForBuyerOrder/);
  assert.match(
    accountDashboard,
    /<ShipmentTimeline shipment=\{order\.shipment\}/,
  );
  assert.match(shipmentTimeline, /Estimated delivery/);
  assert.match(shipmentTimeline, /Package state/);
  assert.match(shipmentTimeline, /Insurance/);
  assert.match(shipmentTimeline, /Signature/);
  assert.match(shipmentTimeline, /Tracking timeline/);
  assert.doesNotMatch(accountDashboard, /api\/shipping\/label/);
});
