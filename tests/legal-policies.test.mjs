import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_VERSION,
  isCurrentPolicyVersion,
} from "../lib/legal.ts";
import { parseSellerApplication, ValidationError } from "../lib/validation.ts";

test("the current policy version has a matching effective date", () => {
  assert.equal(POLICY_VERSION, "2026-08-20-protection-v2");
  assert.equal(POLICY_EFFECTIVE_DATE, "August 20, 2026");
  assert.equal(isCurrentPolicyVersion(POLICY_VERSION), true);
  assert.equal(isCurrentPolicyVersion("2026-01-01"), false);
});

test("seller applications require acceptance of the current Seller Terms", () => {
  const payload = {
    storeName: "Collector Models",
    contactName: "Seller Name",
    email: "seller@example.com",
    currentSellingChannels: "Independent store",
    approximateInventorySize: 25,
    sellerTermsVersion: POLICY_VERSION,
  };
  assert.equal(parseSellerApplication(payload).storeName, "Collector Models");
  assert.throws(
    () => parseSellerApplication({ ...payload, sellerTermsVersion: "2025-01-01" }),
    ValidationError,
  );
});
