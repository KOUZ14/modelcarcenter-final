import assert from "node:assert/strict";
import test from "node:test";
import { sellerTransferReversalTarget } from "../lib/stripe.ts";

test("seller transfer reversals preserve the platform fee proportionally", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 5_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    4_500,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 10_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    9_000,
  );
});

test("seller transfer reversal targets are bounded", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 0,
      refundedAmountCents: 100,
      sellerTransferAmountCents: 90,
      sellerProceedsCents: 90,
    }),
    0,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 20_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    9_000,
  );
});

test("refunds issued before release reduce the transfer without being reversed twice", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 5_000,
      sellerTransferAmountCents: 4_500,
      sellerProceedsCents: 9_000,
    }),
    0,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 10_000,
      sellerTransferAmountCents: 4_500,
      sellerProceedsCents: 9_000,
    }),
    4_500,
  );
});
