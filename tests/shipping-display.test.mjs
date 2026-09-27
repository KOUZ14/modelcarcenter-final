import assert from "node:assert/strict";
import test from "node:test";
import { additionalShippingPolicy } from "../lib/shipping-display.ts";

test("omits a seller note that only repeats the dispatch time", () => {
  assert.equal(additionalShippingPolicy("Ships in 3 business days", 3), "");
  assert.equal(additionalShippingPolicy("Ships within 3 business days.", 3), "");
  assert.equal(additionalShippingPolicy("Dispatches within 1 business day.", 1), "");
});

test("keeps additional seller instructions alongside a repeated dispatch sentence", () => {
  assert.equal(
    additionalShippingPolicy("Ships in 3 business days. Signature required on delivery.", 3),
    "Signature required on delivery.",
  );
  assert.equal(
    additionalShippingPolicy("Packed in a protective outer box.\nShips within 3 business days.", 3),
    "Packed in a protective outer box.",
  );
});

test("preserves delivery estimates, carrier details, and different dispatch times", () => {
  for (const summary of [
    "Delivery takes 3 business days.",
    "Ships in 3 business days via UPS.",
    "Ships in 5 business days.",
    "Ships in 3 days.",
    "Ships in 3 business days after payment clears.",
  ]) {
    assert.equal(additionalShippingPolicy(summary, 3), summary);
  }
});

test("handles empty seller policies", () => {
  assert.equal(additionalShippingPolicy("", 3), "");
  assert.equal(additionalShippingPolicy("  \n ", 3), "");
});
