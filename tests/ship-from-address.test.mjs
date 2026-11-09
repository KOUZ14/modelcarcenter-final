import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStoredShipFromAddress,
  sellerOriginSnapshot,
  shipFromAddressKey,
} from "../lib/ship-from-address.ts";

const legacySeller = {
  shippingOriginStreet1: "10 Model Lane",
  shippingOriginStreet2: null,
  shippingOriginCity: "Los Angeles",
  shippingOriginRegion: "CA",
  shippingOriginPostalCode: "90001",
  shippingOriginCountry: "US",
  shippingOriginPhone: "+1 555 0100",
};

test("stored ship-from snapshots survive later seller-profile changes", () => {
  const stored = JSON.stringify({
    label: "Storage unit",
    street1: "20 Warehouse Road",
    street2: "Unit 4",
    city: "Burbank",
    region: "CA",
    postalCode: "91501",
    country: "US",
    phone: "+1 555 0200",
  });
  assert.equal(
    parseStoredShipFromAddress(stored, legacySeller).street1,
    "20 Warehouse Road",
  );
});

test("legacy orders fall back to the seller ship-from address", () => {
  assert.deepEqual(
    parseStoredShipFromAddress("{}", legacySeller),
    sellerOriginSnapshot(legacySeller),
  );
});

test("ship-from comparison normalizes capitalization and spacing", () => {
  const first = sellerOriginSnapshot(legacySeller);
  const second = {
    ...first,
    street1: "  10 MODEL   LANE ",
    city: "los angeles",
    country: "us",
  };
  assert.equal(shipFromAddressKey(first), shipFromAddressKey(second));
});
