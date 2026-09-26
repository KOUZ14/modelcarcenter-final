import assert from "node:assert/strict";
import test from "node:test";
import { buildSellerHubMetrics, matchesInventoryView, matchesOrderView, matchWantDemand, isTrending } from "../lib/seller-hub.ts";

const now = new Date("2026-09-16T12:00:00.000Z");
const product = (patch = {}) => ({ id: "p1", title: "Porsche 911", sellerSku: "P1", status: "active", inventoryQuantity: 4, reservedQuantity: 1, priceCents: 10000, availabilityType: "in_stock", createdAt: "2026-01-01T00:00:00Z", vehicleMake: "Porsche", vehicleModel: "911", scale: "1:18", modelManufacturer: "AUTOart", color: "Silver", condition: "new", ...patch });
const order = (patch = {}) => ({ id: "o1", buyerEmail: "buyer@example.com", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", createdAt: "2026-09-01T00:00:00Z", paidAt: "2026-09-01T00:00:00Z", subtotalCents: 10000, totalCents: 12000, refundedAmountCents: 0, sellerProceedsCents: 9000, paymentFlow: "separate", sellerTransferStatus: "pending", sellerTransferAmountCents: 0, sellerTransferReversedCents: 0, ...patch });
const item = (patch = {}) => ({ orderId: "o1", productId: "p1", productTitleSnapshot: "Porsche 911", quantity: 2, unitPriceCents: 10000, ...patch });

test("inventory queues separate low stock, reservations, preorders, and zero stock", () => {
  assert.equal(matchesInventoryView(product({ inventoryQuantity: 2, reservedQuantity: 0 }), "low", []), true);
  assert.equal(matchesInventoryView(product({ inventoryQuantity: 1, reservedQuantity: 1 }), "low", []), false);
  assert.equal(matchesInventoryView(product({ inventoryQuantity: 1, reservedQuantity: 1 }), "out", []), true);
  assert.equal(matchesInventoryView(product({ status: "draft", inventoryQuantity: 0 }), "out", []), false);
  assert.equal(matchesInventoryView(product({ availabilityType: "preorder", inventoryQuantity: 0 }), "out", []), false);
  assert.equal(matchesInventoryView(product({ availabilityType: "preorder" }), "preorders", []), true);
});

test("slow inventory is aged by creation and last paid sale, never last edit", () => {
  const inventory = [product(), product({ id: "new", createdAt: "2026-09-01" }), product({ id: "sold" }), product({ id: "unpaid" }), product({ id: "pre", availabilityType: "preorder" }), product({ id: "draft", status: "draft" })];
  const result = buildSellerHubMetrics([order(), order({ id: "pending", paymentStatus: "pending" })], [item({ productId: "sold" }), item({ orderId: "pending", productId: "unpaid" })], inventory, now);
  assert.deepEqual(result.slowIds, ["p1", "unpaid"]);
  assert.equal(result.slowValueCents, 60000);
});

test("sell-through uses matching in-stock catalog units and handles an empty store", () => {
  const result = buildSellerHubMetrics([order()], [item(), item({ productId: "pre", quantity: 100 }), item({ productId: null, quantity: 40 })], [product(), product({ id: "pre", availabilityType: "preorder" })], now);
  assert.equal(result.sellThroughPercent, 40);
  assert.equal(result.inventoryValueCents, 30000);
  assert.equal(result.availableUnits, 3);
  assert.equal(result.units90, 142);
  assert.equal(buildSellerHubMetrics([], [], [], now).sellThroughPercent, null);
});

test("performance is grouped by product ID and dated by payment", () => {
  const result = buildSellerHubMetrics([order({ createdAt: "2026-01-01", paidAt: "2026-09-01" }), order({ id: "old", paidAt: "2026-01-01" })], [item(), item({ productId: "p2", quantity: 1 }), item({ orderId: "old", quantity: 10 })], [product(), product({ id: "p2" })], now);
  assert.equal(result.performance.length, 2);
  assert.equal(result.units90, 3);
  assert.deepEqual(result.performance.map((row) => row.units), [2, 1]);
});

test("payout totals exclude staged and legacy transfers and adjust held proceeds for refunds", () => {
  const result = buildSellerHubMetrics([
    order({ sellerTransferStatus: "transferred", sellerTransferAmountCents: 9000, sellerTransferReversedCents: 1000 }),
    order({ id: "staged", sellerTransferStatus: "processing", sellerTransferAmountCents: 9000 }),
    order({ id: "legacy", paymentFlow: "destination", sellerTransferStatus: "transferred", sellerTransferAmountCents: 70000 }),
    order({ id: "partial", paymentStatus: "partially_refunded", refundedAmountCents: 6000 }),
    order({ id: "unknown", sellerProceedsCents: null }),
    order({ id: "reversed", paymentStatus: "refunded", sellerTransferStatus: "reversed", sellerTransferAmountCents: 9000, sellerTransferReversedCents: 9000 }),
  ], [], [], now);
  assert.equal(result.releasedCents, 8000);
  assert.equal(result.heldCents, 13500);
  assert.equal(result.pendingFeeOrders, 1);
});

test("repeat buyers normalize email and exclude unpaid and fully refunded orders", () => {
  const result = buildSellerHubMetrics([order(), order({ id: "repeat", buyerEmail: " BUYER@example.com " }), order({ id: "pending", buyerEmail: "other@example.com", paymentStatus: "pending" }), order({ id: "refund", buyerEmail: "other@example.com", paymentStatus: "refunded" })], [], [], now);
  assert.equal(result.repeatBuyers, 1);
  assert.equal(result.totalBuyers, 1);
});

test("return requests are separate from refunds and shipped includes delivery", () => {
  assert.equal(matchesOrderView(order(), "returns", ["o1"]), true);
  assert.equal(matchesOrderView(order({ paymentStatus: "refunded" }), "returns", []), false);
  assert.equal(matchesOrderView(order({ fulfillmentStatus: "delivered" }), "shipped", []), true);
  assert.equal(matchesOrderView(order({ paymentStatus: "pending" }), "open", []), false);
});

test("Want List matching respects exact models, scale, preferences, and budget", () => {
  const want = { vehicleMake: " porsche ", vehicleModel: "911", preferredScale: "1:18", modelManufacturer: "autoart", color: "silver", conditionPreference: "new", maxBudgetCents: 10000, requests: 1 };
  const inventory = [product(), product({ id: "expensive", priceCents: 11000 }), product({ id: "different", vehicleModel: "911 GT3" }), product({ id: "scale", scale: "1:43" }), product({ id: "used", condition: "used" }), product({ id: "rejected", status: "rejected" })];
  assert.deepEqual(matchWantDemand(want, inventory), ["p1"]);
  assert.equal(isTrending(2, 0), false);
  assert.equal(isTrending(3, 2), true);
  assert.equal(isTrending(3, 3), false);
});
