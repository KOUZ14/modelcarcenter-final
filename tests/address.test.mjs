import assert from "node:assert/strict";
import test from "node:test";
import { addressErrors, normalizeState, shipFromAddressValues } from "../lib/address.ts";
import { lookupAddress, parsePlaceAddress } from "../lib/address-autocomplete.ts";
import { parseCheckoutShippingAddress } from "../lib/shipping-rules.ts";
import { validateShipFromFields } from "../lib/validation.ts";

const valid = { name: "Sam Collector", street1: "10 Model Lane", street2: "Unit 2", city: "Boston", state: "MA", zip: "02108", country: "US", phone: "617-555-0100" };

test("delivery errors identify every affected field without mutating valid entries", () => {
  const input = { ...valid, street1: "  ", city: "", zip: "123", state: "XX" };
  const copy = { ...input };
  assert.throws(() => parseCheckoutShippingAddress(input), (error) => {
    assert.deepEqual(Object.keys(error.fields).sort(), ["city", "state", "street1", "zip"]);
    return true;
  });
  assert.deepEqual(input, copy);
});

test("manual addresses accept leading-zero ZIPs, ZIP+4, PO boxes and military states", () => {
  assert.deepEqual(addressErrors(valid, { name: true, phone: true }), {});
  assert.deepEqual(addressErrors({ ...valid, zip: "02108-1234", street1: "PO Box 20", state: "AE" }), {});
  assert.equal(parseCheckoutShippingAddress({ ...valid, state: "Massachusetts" }).state, "MA");
  assert.equal(normalizeState(" california "), "CA");
  assert.equal(addressErrors({ ...valid, zip: "123456789" }).zip.includes("ZIP"), true);
});

test("ship-from errors use the actual form names and preserve international records", () => {
  assert.throws(() => validateShipFromFields({ shippingOriginCountry: "US" }), (error) => {
    assert.ok(error.fields.shippingOriginStreet1);
    assert.ok(error.fields.shippingOriginRegion);
    assert.ok(error.fields.shippingOriginPostalCode);
    assert.ok(error.fields.shippingOriginPhone);
    return true;
  });
  const canadian = { ...valid, state: "ON", zip: "M5V 3L9", country: "CA" };
  assert.deepEqual(addressErrors(canadian), {});
  assert.equal(shipFromAddressValues({ shippingOriginCountry: "CA" }).country, "CA");
});

const component = (type, longText, shortText = longText) => ({ types: [type], longText, shortText });
test("selected suggestions map address components, including boroughs and units", () => {
  assert.deepEqual(parsePlaceAddress({ addressComponents: [
    component("country", "United States", "US"), component("street_number", "10"),
    component("route", "Model Lane"), component("subpremise", "2"),
    component("sublocality_level_1", "Brooklyn"), component("administrative_area_level_1", "New York", "NY"),
    component("postal_code", "11201"), component("postal_code_suffix", "1234"),
  ] }), { street1: "10 Model Lane", street2: "2", city: "Brooklyn", state: "NY", zip: "11201-1234", country: "US" });
  assert.equal(parsePlaceAddress({ addressComponents: [component("country", "Canada", "CA")] }), null);
  assert.equal(parsePlaceAddress({ addressComponents: [component("country", "United States", "US")] }).zip, "");
});

test("suggestion and details requests share a session, restrict to US, and keep keys in headers", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url: String(url), ...options });
    return Response.json(calls.length === 1 ? { suggestions: [
      { placePrediction: { placeId: "place-123", text: { text: "10 Model Lane, Boston, MA" } } },
      { queryPrediction: { text: "ignored query" } },
    ] } : { addressComponents: [component("country", "United States", "US")] });
  };
  const result = await lookupAddress({ query: "10 Model", sessionToken: "test-session" }, "test-key", request);
  assert.equal(result.suggestions.length, 1);
  await lookupAddress({ placeId: result.suggestions[0].id, sessionToken: "test-session" }, "test-key", request);
  assert.deepEqual(JSON.parse(calls[0].body).includedRegionCodes, ["us"]);
  assert.equal(JSON.parse(calls[0].body).sessionToken, "test-session");
  assert.equal(new URL(calls[1].url).searchParams.get("sessionToken"), "test-session");
  assert.equal(calls[1].headers["X-Goog-FieldMask"], "addressComponents");
  assert.ok(calls.every((call) => call.headers["X-Goog-Api-Key"] === "test-key" && !call.url.includes("test-key")));
});

test("provider errors reject cleanly for manual fallback without leaking upstream messages", async () => {
  await assert.rejects(() => lookupAddress({ query: "10 Model", sessionToken: "session" }, "key",
    async () => Response.json({ error: "sensitive upstream details" }, { status: 429 })), /Address lookup unavailable/);
  assert.deepEqual(await lookupAddress({ query: "No match", sessionToken: "session" }, "key",
    async () => Response.json({})), { suggestions: [] });
});
