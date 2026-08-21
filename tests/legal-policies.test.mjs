import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_VERSION,
  isCurrentPolicyVersion,
  sellerAcceptedCurrentTerms,
} from "../lib/legal.ts";
import { parseSellerApplication, ValidationError } from "../lib/validation.ts";

test("the current policy version has a matching effective date", () => {
  assert.equal(POLICY_VERSION, "2026-08-20-protection-v2");
  assert.equal(POLICY_EFFECTIVE_DATE, "August 20, 2026");
  assert.equal(isCurrentPolicyVersion(POLICY_VERSION), true);
  assert.equal(isCurrentPolicyVersion("2026-01-01"), false);
});

test("seller access requires a recorded acceptance of the current terms", () => {
  assert.equal(
    sellerAcceptedCurrentTerms({
      sellerTermsVersion: POLICY_VERSION,
      sellerTermsAcceptedAt: "2026-08-21T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    sellerAcceptedCurrentTerms({
      sellerTermsVersion: POLICY_VERSION,
      sellerTermsAcceptedAt: null,
    }),
    false,
  );
  assert.equal(
    sellerAcceptedCurrentTerms({
      sellerTermsVersion: "2025-01-01",
      sellerTermsAcceptedAt: "2026-08-21T00:00:00.000Z",
    }),
    false,
  );
});

test("professional publishing and checkout enforce current Seller Terms", async () => {
  const [store, inventory, route, catalog, sitemap] = await Promise.all([
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/inventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
  ]);
  assert.match(store, /sellerAcceptedCurrentTerms\(store\)/);
  assert.match(inventory, /sellerAcceptedCurrentTerms\(seller\)/);
  assert.match(route, /accept_seller_terms/);
  assert.match(catalog, /eq\(sellers\.sellerTermsVersion, POLICY_VERSION\)/);
  assert.match(catalog, /isNotNull\(sellers\.sellerTermsAcceptedAt\)/);
  assert.match(sitemap, /eq\(sellers\.sellerTermsVersion, POLICY_VERSION\)/);
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
