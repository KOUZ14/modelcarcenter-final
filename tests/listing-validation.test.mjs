import assert from "node:assert/strict";
import test from "node:test";
import { assertCollectibleListingReady, parseCollectibleDetails, parseCollectorListing } from "../lib/validation.ts";
import { focusListingError, listingFormErrors } from "../lib/listing-form-validation.ts";

const condition = {
  modelCondition: "mint", packagingCondition: "excellent", originalBoxStatus: "included",
  coaStatus: "not_applicable", missingParts: "None known", defects: "None known",
  restorationCustomization: "None known", accessories: "None included",
};

test("condition validation reports all missing answers with field names and useful instructions", () => {
  assert.throws(() => parseCollectibleDetails({ ...condition, missingParts: "  ", defects: "", accessories: "", modelCondition: "" }), error => {
    assert.deepEqual(Object.keys(error.fields).sort(), ["defects", "missingParts", "modelCondition"]);
    assert.match(error.fields.missingParts, /Choose.*None known/);
    assert.equal(error.fields.accessories, undefined);
    assert.doesNotMatch(error.message, /missingParts/);
    return true;
  });
  assert.equal(parseCollectibleDetails(condition).missingParts, "None known");
});

test("mismatched box choices and missing photo evidence identify the controls to fix", () => {
  assert.throws(() => parseCollectibleDetails({ ...condition, originalBoxStatus: "not_included" }), error => {
    assert.deepEqual(Object.keys(error.fields).sort(), ["originalBoxStatus", "packagingCondition"]);
    return true;
  });
  assert.throws(() => assertCollectibleListingReady(condition, []), error => {
    assert.match(error.fields.images, /at least four photos/); return true;
  });
  assert.throws(() => assertCollectibleListingReady(condition, Array.from({ length: 4 }, () => ({ alt: "", url: "/photo.jpg" }))), error => {
    assert.match(error.fields.images, /Label the photos/); return true;
  });
});

test("price and parcel errors returned by the server identify their form controls", () => {
  const listing = { ...condition, title: "Model", vehicleMake: "Porsche", vehicleModel: "911", scale: "1:18", modelManufacturer: "AUTOart", price: "100", quantity: "1", sellerDisplayName: "Collector",
    packageLength: "12", packageWidth: "9", packageHeight: "6", packageWeight: "2",
    shippingOriginStreet1: "10 Model Lane", shippingOriginCity: "Boston", shippingOriginRegion: "MA", shippingOriginPostalCode: "02108", shippingOriginCountry: "US", shippingOriginPhone: "6175550100" };
  for (const [name, value] of [["price", "abc"], ["quantity", "1.5"], ["packageLength", "0"], ["packageWeight", "151"]]) {
    assert.throws(() => parseCollectorListing({ ...listing, [name]: value }), error => Boolean(error.fields[name]));
  }
  assert.equal(parseCollectorListing(listing).priceCents, 10000);
});

test("client validation catches whitespace and decimal errors while ignoring disabled fields", () => {
  const controls = [
    { name: "missingParts", value: "   ", required: true },
    { name: "defects", value: "None known", required: true },
    { name: "price", value: "12.123", required: true },
    { name: "packageWidth", value: "-2", required: true },
    { name: "disabledField", value: "", required: true, willValidate: false },
  ].map(field => ({ willValidate: true, validity: { valid: true }, ...field }));
  assert.deepEqual(Object.keys(listingFormErrors({ querySelectorAll: () => controls })), ["missingParts", "price", "packageWidth"]);
});

test("navigation follows form order, opens nested sections and supports summary links", () => {
  const shipping = { tagName: "DETAILS", open: false };
  const profile = { tagName: "DETAILS", open: false, parentElement: shipping };
  const calls = [];
  const control = (name, parentElement, type = "text") => ({
    parentElement, getAttribute: key => key === "name" ? name : key === "type" ? type : null,
    matches: () => false, focus() { calls.push(`focus:${name}`); }, scrollIntoView() { calls.push(`scroll:${name}`); },
  });
  const form = { querySelectorAll: () => [control("hidden", null, "hidden"), control("sellerDisplayName", profile), control("sellerDescription", profile)] };
  const errors = { hidden: "Ignore", sellerDescription: "Too short", sellerDisplayName: "Required" };
  focusListingError(form, errors);
  assert.deepEqual(calls, ["focus:sellerDisplayName", "scroll:sellerDisplayName"]);
  assert.equal(shipping.open, true); assert.equal(profile.open, true);
  focusListingError(form, errors, "sellerDescription");
  assert.deepEqual(calls.slice(-2), ["focus:sellerDescription", "scroll:sellerDescription"]);
});
