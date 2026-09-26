import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ambiguousPhotoLabels, photoViewsFromAlt, photoAltForViews, listingPhotoEvidence, requiredPhotoViews } from "../lib/listing-evidence.ts";
import { parseCollectibleDetails, assertCollectibleListingReady } from "../lib/validation.ts";
import { buildListingPreview } from "../lib/listing-preview.ts";
import { listingEditorProgress } from "../lib/listing-editor-progress.ts";

const condition = { modelCondition: "near_mint", packagingCondition: "excellent", originalBoxStatus: "included", coaStatus: "not_included", missingParts: "None known", defects: "None known", restorationCustomization: "None known", accessories: "" };
const photos = ["front", "rear", "left", "right", "top", "underside", "packaging"].map((view, i) => ({ id: `p${i}`, url: `/photo${i}.jpg`, alt: photoAltForViews([view], "Actual item") }));

test("photo coverage counts explicit viewpoints without expanding ambiguous legacy labels", () => {
  assert.deepEqual(photoViewsFromAlt("Front view · Both sides · Top and base - Actual item"), ["front"]);
  const incomplete = listingPhotoEvidence(condition, photos.filter(photo => photo.id !== "p3"));
  assert.deepEqual(incomplete.missing, ["Right side"]);
  assert.equal(listingPhotoEvidence(condition, photos).complete, true);
  assert.deepEqual(photoViewsFromAlt(photoAltForViews(["left", "details"], "My item")), ["left", "details"]);
  assert.equal(listingPhotoEvidence({ ...condition, defects: "Chipped paint" }, photos).complete, false);
});

test("legacy grouped labels require confirmation even when other photos cover every required view", () => {
  const legacy = { alt: "Both sides · Top and base — Actual item" };
  assert.deepEqual(ambiguousPhotoLabels(legacy.alt), ["Both sides", "Top and base"]);
  assert.deepEqual(photoViewsFromAlt(legacy.alt), []);
  const unconfirmed = [...photos, legacy];
  const evidence = listingPhotoEvidence(condition, unconfirmed);
  assert.equal(evidence.complete, false);
  assert.deepEqual(evidence.unconfirmedPhotos, [8]);
  assert.match(evidence.missing.join(" "), /Confirm legacy labels on photo 8/);
  assert.throws(() => assertCollectibleListingReady(condition, unconfirmed), error => /Confirm legacy labels/.test(error.fields.images));
  const confirmed = { alt: photoAltForViews(["left"], "Actual item") };
  assert.equal(listingPhotoEvidence(condition, [...photos, confirmed]).complete, true);
  assert.deepEqual(photoViewsFromAlt(confirmed.alt), ["left"]);
  const oldClient = photoAltForViews(["front", "sides", "base"], "Old upload");
  assert.deepEqual(ambiguousPhotoLabels(oldClient), ["Both sides", "Top and base"]);
  assert.deepEqual(photoViewsFromAlt(oldClient), ["front"]);
  assert.deepEqual(ambiguousPhotoLabels("Left side - Description mentioning Both sides"), []);
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
  const output = await build({ stdin: { contents: "export {CollectorListingForm} from './components/collector-listing-form.tsx'; export {SellerFeeDisclosure} from './components/seller-fee-disclosure.tsx'; export {ListingBuyerPreview} from './components/listing-buyer-preview.tsx'; export {ProductListingView} from './components/product-listing-view.tsx'; export {CollectibleListingFields} from './components/collectible-listing-fields.tsx';", resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "next-ui", setup(b) {
      const mocks = {
        "next/link": "export default 'a';",
        "next/navigation": "export const useRouter=()=>({push:()=>{}});",
        "next/image": "import React from 'react'; export default function Image({unoptimized,fill,priority,...props}) {return React.createElement('img',props);}",
        "./marketplace-provider": "export const useMarketplace=()=>({cart:[],collector:null,authReady:true,wishlistHas:()=>false});",
        "./preorder-offer": "export const PreorderOffer='preorder-offer';",
        "./use-shipping-zip": "export const useShippingZip=()=>['',()=>{}];",
      };
      b.onResolve({filter:/.*/},({path})=>mocks[path] || path.endsWith('.css') ? {path,namespace:'fixture'} : undefined);
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path] || "export default new Proxy({}, {get:(_,key)=>key});",resolveDir:process.cwd()}));
    }}],
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
  assert.ok(html.indexOf('class="listing-action-bar"') > html.lastIndexOf('</details>'), "Save and publish are outside every collapsible section");
  assert.ok(html.indexOf('Views buyers need') < html.indexOf('Add photos'));
  assert.match(html, /Enlarge photo 1/);
  assert.match(html, /Wrong linked model/);
  assert.match(html, /Start a new listing \(new tab\)/);
  assert.doesNotMatch(html, /Both sides|Top and base|Fill common|Connect payment method/);
  const fee = renderToStaticMarkup(React.createElement(ui.SellerFeeDisclosure, { marketplaceFeeBps: 850, price: "125.00" }));
  assert.match(fee, /\$10.63/); assert.match(fee, /\$114.37/); assert.doesNotMatch(fee, /\$200.00|2.9%/);
  const draft = buildListingPreview({values:{...condition, packagingCondition:"sealed_poor", price:"125.00", quantity:"2", defects:"Paint chip on roof", sellerDisplayName:"Alex", sellerDescription:"Collector biography", sellerSpecialty:"Road cars", sellerPackingApproach:"Boxed inside protective padding", shippingOriginStreet1:"PRIVATE STREET", shippingOriginPostalCode:"PRIVATE ZIP", shippingOriginRegion:"CA", shippingOriginCountry:"US"},catalog:{title:"McLaren F1",modelManufacturer:"AUTOart",scale:"1:18"},seller:null,images:photos});
  const preview = renderToStaticMarkup(React.createElement(ui.ListingBuyerPreview, {product:draft,onClose:()=>{}}));
  assert.match(preview, /Poor · factory sealed/); assert.match(preview, /CA, US/); assert.doesNotMatch(preview, /PRIVATE STREET|PRIVATE ZIP/);
  assert.match(html, /Review &amp; publish/); assert.match(html, /Preview listing/); assert.doesNotMatch(html, /Buyer-facing listing preview/);
  const live = renderToStaticMarkup(React.createElement(ui.ProductListingView, {product:draft}));
  for (const rendered of [preview,live]) {
    for (const text of ['View photo 7 of 7','Model condition:','Paint chip on roof','About the seller','Collector biography','How your model is packed','Boxed inside protective padding','Shipping &amp; dispatch','2 available']) assert.ok(rendered.includes(text),text);
    assert.ok(rendered.indexOf('listing-condition-details') < rendered.indexOf('product-seller-details'));
  }
  assert.match(preview, /Preview — not published/);
  assert.match(preview, /Back to editing/);
  assert.match(preview, /disabled=""[^>]*>Report listing/);
  assert.match(live, />Report listing<\/button>/);
  assert.match(preview, /class="button dark buy-button"[^>]*disabled=""/);
  assert.match(preview, /class="button outline purchase-save"[^>]*disabled=""/);
  assert.doesNotMatch(live, /class="button dark buy-button"[^>]*disabled=""/);
  assert.doesNotMatch(preview, /href="[^"]*messages\?product=/);
});
