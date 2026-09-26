import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { photoViewsFromAlt, photoAltForViews, listingPhotoEvidence, requiredPhotoViews } from "../lib/listing-evidence.ts";
import { parseCollectibleDetails, assertCollectibleListingReady } from "../lib/validation.ts";
import { listingEditorProgress } from "../lib/listing-editor-progress.ts";

const condition = { modelCondition: "near_mint", packagingCondition: "excellent", originalBoxStatus: "included", coaStatus: "not_included", missingParts: "None known", defects: "None known", restorationCustomization: "None known", accessories: "" };
const photos = ["front", "rear", "left", "right", "top", "underside", "packaging"].map((view, i) => ({ id: `p${i}`, url: `/photo${i}.jpg`, alt: photoAltForViews([view], "Actual item") }));

test("photo coverage aggregates independent viewpoints and retains legacy labels", () => {
  assert.deepEqual(photoViewsFromAlt("Front view · Both sides · Top and base - Actual item"), ["front", "left", "right", "top", "underside"]);
  const incomplete = listingPhotoEvidence(condition, photos.filter(photo => photo.id !== "p3"));
  assert.deepEqual(incomplete.missing, ["Right side"]);
  assert.equal(listingPhotoEvidence(condition, photos).complete, true);
  assert.deepEqual(photoViewsFromAlt(photoAltForViews(["left", "details"], "My item")), ["left", "details"]);
  assert.equal(listingPhotoEvidence({ ...condition, defects: "Chipped paint" }, photos).complete, false);
});

test("physical packaging grade survives a factory seal and optional accessories stay optional", () => {
  const sealed = parseCollectibleDetails({ ...condition, packagingCondition: "sealed_poor", defects: "Not sure" });
  assert.equal(sealed.packagingCondition, "sealed_poor");
  assert.equal(sealed.accessories, "");
  assert.equal(sealed.defects, "Not sure");
  assert.deepEqual(requiredPhotoViews(sealed), ["packaging", "seal"]);
  assert.doesNotThrow(() => assertCollectibleListingReady(sealed, ["packaging", "seal"].map(view => ({ alt: photoAltForViews([view], "Sealed box") }))));
  assert.throws(() => parseCollectibleDetails({ ...sealed, originalBoxStatus: "not_included" }), /must agree/);
  assert.throws(() => parseCollectibleDetails({ ...condition, defects: "" }), error => Boolean(error.fields.defects));
});

test("progress checks the current values, photo evidence and reusable seller setup", () => {
  const values = { ...condition, price: "125.00", quantity: "1", packageLength: "12", packageWidth: "9", packageHeight: "6", packageWeight: "2", sellerDisplayName: "Alex", sellerDescription: "Independent collector of carefully displayed cars.", sellerSpecialty: "1:18", sellerPackingApproach: "Padded models packed in a sturdy outer carton.", shippingOriginStreet1: "10 Model Lane", shippingOriginCity: "Burbank", shippingOriginRegion: "CA", shippingOriginPostalCode: "91501", shippingOriginCountry: "US", shippingOriginPhone: "8185550100" };
  const complete = listingEditorProgress(values, photos);
  for (const key of ["conditionComplete", "priceComplete", "packageComplete", "addressComplete", "profileComplete"]) assert.equal(complete[key], true, key);
  const changed = listingEditorProgress({ ...values, defects: "Paint chip", price: "bad", packageWeight: "0", sellerPackingApproach: "Short" }, photos);
  assert.equal(changed.priceComplete, false); assert.equal(changed.packageComplete, false); assert.equal(changed.profileComplete, false);
  assert.ok(changed.photo.missing.includes("Disclosed defects / repairs"));
});

test("editor renders one photo-label panel, five steps, live fees and a private-address-free buyer preview", async t => {
  const scratch = await mkdtemp(join(process.cwd(), ".sites-runtime/listing-editor-test-")); const file = join(scratch, "ui.mjs");
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(scratch); });
  const output = await build({ stdin: { contents: "export {CollectorListingForm} from './components/collector-listing-form.tsx'; export {SellerFeeDisclosure} from './components/seller-fee-disclosure.tsx'; export {ListingBuyerPreview} from './components/listing-buyer-preview.tsx'; export {CollectibleListingFields} from './components/collectible-listing-fields.tsx';", resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "next-ui", setup(b) { b.onResolve({ filter: /^next\/(image|link)$/ }, ({ path }) => ({ path, namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "next/link" ? "export default 'a'" : "import React from 'react'; export default function Image({unoptimized,...props}) { return React.createElement('img',props); }", resolveDir: process.cwd() })); } }],
  });
  await writeFile(file, output.outputFiles[0].contents);
  const ui = await import(pathToFileURL(file).href);
  const html = renderToStaticMarkup(React.createElement(ui.CollectorListingForm, { initial: { product: { ...condition, id: "draft", catalogProductId: "catalog", title: "McLaren F1", priceCents: 12500 }, images: photos.slice(0,6) }, seller: null, shipFromAddresses: [], displayName: "Alex", prefill: {}, marketplaceFeeBps: 850 }));
  const shared = renderToStaticMarkup(React.createElement(ui.CollectibleListingFields, { product: { ...condition, conditionNotes: "Existing notes" } }));
  assert.doesNotMatch(shared, /name="conditionNotes"/, "Store and admin editors already provide their own notes field");
  const legacy = renderToStaticMarkup(React.createElement(ui.CollectibleListingFields, { product: { ...condition, conditionNotes: "Existing notes" }, includeLegacyNotes: true }));
  assert.equal((legacy.match(/name="conditionNotes"/g) || []).length, 1);
  assert.equal((html.match(/class="listing-section"/g) || []).length, 5);
  assert.equal((html.match(/class="photo-view-labels"/g) || []).length, 1);
  assert.ok(html.indexOf('class="listing-action-bar"') > html.lastIndexOf('</details>'), "Save and submit are outside every collapsible section");
  assert.ok(html.indexOf('Views buyers need') < html.indexOf('Add photos'));
  assert.doesNotMatch(html, /Both sides|Top and base|Fill common|Connect payment method/);
  const fee = renderToStaticMarkup(React.createElement(ui.SellerFeeDisclosure, { marketplaceFeeBps: 850, price: "125.00" }));
  assert.match(fee, /\$10.63/); assert.match(fee, /\$114.37/); assert.doesNotMatch(fee, /\$200.00|2.9%/);
  const preview = renderToStaticMarkup(React.createElement(ui.ListingBuyerPreview, { values: { ...condition, packagingCondition: "sealed_poor", price: "125.00", shippingOriginStreet1: "PRIVATE STREET", shippingOriginPostalCode: "PRIVATE ZIP", shippingOriginRegion: "CA", shippingOriginCountry: "US" }, title: "McLaren F1", seller: null }));
  assert.match(preview, /Poor · factory sealed/); assert.match(preview, /CA, US/); assert.doesNotMatch(preview, /PRIVATE STREET|PRIVATE ZIP/);
});
