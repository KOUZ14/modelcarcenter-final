import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseProductAvailability,
  preorderShipAnchor,
  productIsPreorder,
} from "../lib/availability-rules.ts";

test("product availability defaults to in-stock and clears stray dates", () => {
  assert.deepEqual(parseProductAvailability({}), {
    availabilityType: "in_stock",
    releaseDate: null,
  });
  assert.deepEqual(
    parseProductAvailability({
      availabilityType: "in_stock",
      releaseDate: "2027-03-15",
    }),
    { availabilityType: "in_stock", releaseDate: null },
  );
});

test("preorders require a real calendar release date", () => {
  assert.deepEqual(
    parseProductAvailability({
      availabilityType: "preorder",
      releaseDate: "2027-03-15",
    }),
    { availabilityType: "preorder", releaseDate: "2027-03-15" },
  );
  assert.throws(
    () => parseProductAvailability({ availabilityType: "preorder" }),
    /release date/i,
  );
  assert.throws(
    () =>
      parseProductAvailability({
        availabilityType: "preorder",
        releaseDate: "2027-02-30",
      }),
    /release date/i,
  );
});

test("mixed preorder carts ship from the latest release date", () => {
  const dates = ["2027-03-15", null, "2027-05-01", "2027-04-20"];
  assert.equal(preorderShipAnchor(dates)?.toISOString(), "2027-05-01T12:00:00.000Z");
  assert.deepEqual(dates, ["2027-03-15", null, "2027-05-01", "2027-04-20"]);
  assert.equal(preorderShipAnchor([null]), null);
  assert.equal(
    productIsPreorder({
      availabilityType: "preorder",
      releaseDate: "2027-05-01",
    }),
    true,
  );
});

test("preorder schedule changes preserve closed and historical order snapshots", async () => {
  const source = await readFile(
    new URL("../lib/availability.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\.update\(orderItems\)|\.update\(orders\)/);
  assert.match(source, /Historical paid order snapshots cannot be rewritten/);
});
