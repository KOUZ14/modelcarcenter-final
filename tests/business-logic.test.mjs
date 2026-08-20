import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInventoryReservation,
  availableQuantity,
  calculatePlatformFee,
  calculateServerTotals,
  cartSellerConflict,
  completeInventoryReservation,
  isStripeEventProcessed,
  normalizeSearch,
  releaseInventoryReservation,
} from "../lib/business.ts";
import { assertCollectibleListingReady, parseCollectibleDetails, parseCsv, parseModelHunt, planImportUpserts, validateImportRows, ValidationError } from "../lib/validation.ts";
import { verifyStripeWebhook } from "../lib/stripe.ts";

test("normalizes collector search and computes availability", () => {
  assert.equal(normalizeSearch("  1:18  Porsche—911   AUTOart "), "1:18 porsche 911 autoart");
  assert.equal(availableQuantity(5, 2), 3);
  assert.equal(availableQuantity(1, 3), 0);
});

test("server totals and platform fee use integer cents", () => {
  assert.equal(calculatePlatformFee(29_995, 1_000), 3_000);
  assert.deepEqual(calculateServerTotals([{ priceCents: 10_000, quantity: 2 }, { priceCents: 2_500, quantity: 1 }], 1_295, 750), {
    subtotalCents: 22_500,
    shippingCents: 1_295,
    platformFeeCents: 1_688,
    totalBeforeTaxCents: 23_795,
  });
});

test("single-seller cart restriction rejects a different seller", () => {
  const item = { productId: "p1", slug: "p1", sellerId: "seller-a", sellerName: "A", title: "Model", scale: "1:18", modelManufacturer: "Maker", imageUrl: null, priceCents: 1000, currency: "usd", availableQuantity: 2, shippingCents: 500, quantity: 1 };
  assert.equal(cartSellerConflict([item], "seller-a"), false);
  assert.equal(cartSellerConflict([item], "seller-b"), true);
});

test("Model Hunt validation normalizes valid input and rejects invalid email", () => {
  const parsed = parseModelHunt({ vehicleMake: " Porsche ", vehicleModel: " 911 ", preferredScale: "1:18", collectorEmail: "Collector@Example.com", maxBudget: "250.00" });
  assert.equal(parsed.collectorEmail, "collector@example.com");
  assert.equal(parsed.maxBudgetCents, 25_000);
  assert.throws(() => parseModelHunt({ vehicleMake: "Porsche", vehicleModel: "911", preferredScale: "1:18", collectorEmail: "bad" }), ValidationError);
});

test("CSV validation reports row errors and upsert planning reuses seller SKU identity", () => {
  const rows = parseCsv("seller_sku,title,description,scale,model_manufacturer,vehicle_make,vehicle_model,vehicle_year,color,model_condition,packaging_condition,original_box,missing_parts,defects,restoration_customization,material,product_number,edition_serial,coa,accessories,provenance,price,inventory_quantity,keywords\nSKU-1,911,,1:18,AUTOart,Porsche,911,1973,Silver,mint,excellent,included,None known,None known,None known,Die-cast,78123,147 of 500,included,Display base,Single owner,249.95,2,classic\nSKU-2,Bad,,1:18,,Porsche,911,,,invalid,invalid,included,,,,,,,,,,nope,-2,x\n");
  const validation = validateImportRows(rows);
  assert.equal(validation.valid.length, 1);
  assert.equal(validation.errors.length, 1);
  const plan = planImportUpserts([{ id: "existing-id", sellerSku: "sku-1", slug: "kept-slug" }], validation.valid, () => "new-id");
  assert.equal(plan[0].operation, "update");
  assert.equal(plan[0].id, "existing-id");
  assert.equal(plan[0].slug, "kept-slug");
});

test("collectible standard keeps model and packaging condition separate and requires photo coverage", () => {
  const details = parseCollectibleDetails({
    modelCondition: "near_mint",
    packagingCondition: "good",
    originalBoxStatus: "included",
    missingParts: "None known",
    defects: "Light shelf wear on box",
    restorationCustomization: "None known",
    material: "Die-cast metal",
    coaStatus: "not_applicable",
    accessories: "Display base",
    photoFrontChecked: "on",
    photoRearChecked: "on",
    photoSidesChecked: "on",
    photoBaseChecked: "on",
    photoPackagingChecked: "on",
    photoIssuesChecked: "on",
  });
  assert.equal(details.modelCondition, "near_mint");
  assert.equal(details.packagingCondition, "good");
  assert.doesNotThrow(() => assertCollectibleListingReady(details, 4));
  assert.throws(() => assertCollectibleListingReady({ ...details, photoBaseChecked: false }, 4), /photo checklist/i);
  assert.throws(() => assertCollectibleListingReady(details, 3), /at least four photos/i);
});

test("Stripe webhook event IDs are idempotent", () => {
  const processed = new Set(["evt_paid_once"]);
  assert.equal(isStripeEventProcessed(processed, "evt_paid_once"), true);
  assert.equal(isStripeEventProcessed(processed, "evt_new"), false);
});

test("Stripe webhook verification accepts the raw signed payload and rejects tampering", async () => {
  const secret = "whsec_unit_test";
  const payload = JSON.stringify({ id: "evt_verified", type: "checkout.session.completed", data: { object: {} } });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const event = await verifyStripeWebhook(payload, `t=${timestamp},v1=${signature}`, secret);
  assert.equal(event.id, "evt_verified");
  await assert.rejects(() => verifyStripeWebhook(`${payload} `, `t=${timestamp},v1=${signature}`, secret), /verification failed/);
});

test("inventory reserve, release, and completion preserve quantities", () => {
  const initial = { inventoryQuantity: 4, reservedQuantity: 1 };
  const reserved = applyInventoryReservation(initial, 2);
  assert.deepEqual(reserved, { inventoryQuantity: 4, reservedQuantity: 3 });
  assert.deepEqual(releaseInventoryReservation(reserved, 2), initial);
  assert.deepEqual(completeInventoryReservation(reserved, 2), { inventoryQuantity: 2, reservedQuantity: 1 });
  assert.throws(() => applyInventoryReservation(initial, 4), /Insufficient/);
});
