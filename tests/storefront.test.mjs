import assert from "node:assert/strict";
import test from "node:test";
import { publicProfileText, readStorefrontFilters, sellerBioExcerpt, sellerSinceLabel, storefrontHref } from "../lib/storefront.ts";

test("storefront URLs preserve search, scale and sorting without accepting another seller", () => {
  const filters = readStorefrontFilters(new URLSearchParams("q=red+%26+blue&scale=1%3A18&sort=price_desc&page=3&seller=someone-else"));
  const url = new URL(storefrontHref("apex", filters), "https://mcc.test");
  assert.equal(url.pathname, "/sellers/apex");
  assert.equal(url.searchParams.get("q"), "red & blue");
  assert.equal(url.searchParams.has("seller"), false);
  assert.deepEqual(readStorefrontFilters(url.searchParams), filters);
  assert.equal(url.hash, "#seller-inventory");
  assert.deepEqual(readStorefrontFilters(new URLSearchParams("sort=invalid&page=-3")), { q: "", scale: "", sort: "newest", page: 1 });
  assert.equal(readStorefrontFilters(new URLSearchParams({ q: "a".repeat(400), page: "99999999" })).q.length, 200);
  assert.equal(readStorefrontFilters(new URLSearchParams("page=99999999")).page, 100000);
});

test("optional profile placeholders are omitted without stripping real seller descriptions", () => {
  for (const value of [null, "", "   ", "specialty", " Specialty ", "Not yet provided", "N/A"]) assert.equal(publicProfileText(value, "specialty"), "");
  for (const value of ["packing_approach", "Packing Approach", "packing-approach"]) assert.equal(publicProfileText(value, "packing_approach"), "");
  assert.equal(publicProfileText("Our specialty is 1:18 rally cars.", "specialty"), "Our specialty is 1:18 rally cars.");
  assert.equal(publicProfileText("Double-boxed with foam protection", "packing_approach"), "Double-boxed with foam protection");
  const description = "Carefully selected models. ".repeat(20);
  assert.ok(sellerBioExcerpt(description).length <= 150);
  assert.ok(sellerBioExcerpt(description).endsWith("…"));
  assert.equal(sellerSinceLabel("2026-06-01T00:00:00Z"), "Selling here since June 2026");
  assert.equal(sellerSinceLabel("unknown"), "");
});
