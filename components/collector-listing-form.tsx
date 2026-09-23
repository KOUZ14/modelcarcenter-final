"use client";
import { CatalogModelPicker } from "./catalog-model-picker";
import { SellerFeeDisclosure } from "./seller-fee-disclosure";


import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";
import { ProductImageFields } from "@/components/product-image-fields";
import { POLICY_VERSION } from "@/lib/legal";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { countryName, SHIP_FROM_FIELD_NAMES, shipFromAddressValues } from "@/lib/address";

type Initial = {
  product: Record<string, unknown>;
  images: Array<{ id: string; url: string; alt: string }>;
} | null;

type Seller = Record<string, unknown> | null;

type ShipFromAddress = {
  id: string;
  label: string;
  street1: string;
  street2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

export function CollectorListingForm({
  initial,
  seller,
  shipFromAddresses: initialShipFromAddresses,
  displayName,
  prefill,
  marketplaceFeeBps,
  collectionCatalog,
  collectionReturnTo,
}: {
  initial: Initial;
  seller: Seller;
  shipFromAddresses: ShipFromAddress[];
  displayName: string;
  prefill: Record<string, string>;
  marketplaceFeeBps: number;
  collectionCatalog?: Record<string, unknown>;
  collectionReturnTo?: string;
}) {
  const product = initial?.product ?? collectionCatalog ?? {};
  const [catalogReady, setCatalogReady] = useState(Boolean(product.catalogProductId));
  const formRef = useRef<HTMLFormElement>(null);
  const addressRef = useRef<AddressFieldsHandle>(null);
  const [productId, setProductId] = useState(String(product.id ?? ""));
  const [shipFromAddresses, setShipFromAddresses] = useState(
    initialShipFromAddresses,
  );
  const initialShipFromAddressId =
    initialShipFromAddresses.find(
      (address) => address.id === String(product.shipFromAddressId ?? ""),
    )?.id ??
    initialShipFromAddresses.find((address) => address.isDefault)?.id ??
    initialShipFromAddresses[0]?.id ??
    "new";
  const [shipFromAddressId, setShipFromAddressId] = useState(
    initialShipFromAddressId,
  );
  const [images, setImages] = useState(initial?.images ?? []);
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(
    typeof product.primaryImageUrl === "string" ? product.primaryImageUrl : null,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogReady) { setError("Choose a catalog model first."); return; }
    setBusy(true);
    setError("");
    setMessage("");
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const shouldSubmit = submitter?.value === "submit";
    if (shouldSubmit && !acceptedSellerTerms) {
      setError("Accept the current Seller Terms before submitting for review.");
      setBusy(false);
      return;
    }
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          productId: productId || undefined,
          ...payload,
        }),
      });
      const body = (await response.json()) as {
        productId?: string;
        error?: string;
        fields?: Record<string, string>;
        shipFromAddress?: ShipFromAddress;
      };
      if (!response.ok || !body.productId) {
        if (body.fields) addressRef.current?.setErrors(body.fields);
        throw new Error(body.error || "The draft could not be saved.");
      }
      setProductId(body.productId);
      if (body.shipFromAddress) {
        const savedAddress = body.shipFromAddress;
        setShipFromAddresses((current) => {
          const withoutSaved = current.filter(
            (address) => address.id !== savedAddress.id,
          );
          return [...withoutSaved, savedAddress].sort(
            (left, right) =>
              Number(right.isDefault) - Number(left.isDefault) ||
              left.label.localeCompare(right.label),
          );
        });
        setShipFromAddressId(savedAddress.id);
      }
      let nextImages = images;
      if (files.length) {
        await uploadProductPhotoFiles({
          endpoint: "/api/listings/images",
          productId: body.productId,
          files,
          onUploaded(uploaded, processedCount) {
            nextImages = [...nextImages, ...uploaded];
            setImages(nextImages);
            setFiles(files.slice(processedCount));
            setPrimaryImageUrl(
              (current) => current ?? uploaded[0]?.url ?? null,
            );
          },
        });
      }
      history.replaceState(
        null,
        "",
        (() => { const query = new URLSearchParams(location.search); query.set("id", body.productId!); return `/sell/model?${query}`; })(),
      );
      if (shouldSubmit) {
        const review = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            productId: body.productId,
            sellerTermsVersion: POLICY_VERSION,
          }),
        });
        const reviewBody = (await review.json()) as { error?: string };
        if (!review.ok) {
          throw new Error(
            reviewBody.error || "The listing could not be submitted.",
          );
        }
        setMessage("Listing submitted for marketplace review.");
      } else {
        setMessage(
          nextImages.length
            ? "Draft, photos, and preferences saved."
            : "Draft and preferences saved. Add photos before submitting.",
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The listing could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!productId) return;
    setError("");
    const response = await fetch("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageId }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "The photo could not be removed.");
      return;
    }
    setImages((current) => {
      const removed = current.find((image) => image.id === imageId);
      const next = current.filter((image) => image.id !== imageId);
      setPrimaryImageUrl((primary) =>
        removed?.url === primary ? next[0]?.url ?? null : primary,
      );
      return next;
    });
  }

  async function removeLegacyImage() {
    if (!productId) return;
    setError("");
    const response = await fetch("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, removeLegacyPrimary: true }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      const nextError = body.error || "The photo could not be removed.";
      setError(nextError);
      throw new Error(nextError);
    }
    setPrimaryImageUrl(images[0]?.url ?? null);
  }

  async function reorderImages(imageIds: string[]) {
    if (!productId) return;
    setError("");
    const response = await fetch("/api/listings/images", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageIds }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      const nextError = body.error || "The photo order could not be saved.";
      setError(nextError);
      throw new Error(nextError);
    }
    setImages((current) => {
      const byId = new Map(current.map((image) => [image.id, image]));
      const next = imageIds.map((id) => byId.get(id)!);
      setPrimaryImageUrl(next[0]?.url ?? null);
      return next;
    });
  }

  async function startOnboarding() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stripe_onboarding",
          sellerTermsVersion: POLICY_VERSION,
        }),
      });
      const body = (await response.json()) as {
        onboardingUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.onboardingUrl) {
        throw new Error(body.error || "Stripe onboarding could not be started.");
      }
      window.location.assign(body.onboardingUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Stripe onboarding could not be started.",
      );
      setBusy(false);
    }
  }

  function fillCommonDisclosures() {
    const form = formRef.current;
    if (!form) return;
    const defaults: Record<string, string> = {
      missingParts: "None known",
      defects: "None known",
      restorationCustomization: "None known",
      accessories: "None included",
    };
    for (const [name, value] of Object.entries(defaults)) {
      const field = form.elements.namedItem(name) as HTMLTextAreaElement | null;
      if (field && !field.value.trim()) field.value = value;
    }
  }

  function setAllListingSections(open: boolean) {
    formRef.current
      ?.querySelectorAll<HTMLDetailsElement>(".listing-section")
      .forEach((section) => {
        section.open = open;
      });
  }

  const stripeReady = Boolean(
    seller?.stripeChargesEnabled &&
      seller?.stripePayoutsEnabled &&
      seller?.status === "active",
  );
  const selectedShipFromAddress = shipFromAddresses.find(
    (address) => address.id === shipFromAddressId,
  );

  return (
    <div className="listing-shell">
      {collectionReturnTo && <div className="collection-selling-setup"><p>This listing is for the model saved in your collection. Complete the condition, photos and shipping details, then submit it for review. Once it is active, return to enable your chosen availability.</p><Link href={collectionReturnTo + (productId ? `&listing=${encodeURIComponent(productId)}` : "")}>Return to collection setup</Link></div>}
      <div className="page-title">
        <p className="eyebrow">Sell from your collection</p>
        <h1>{productId ? "Edit your listing" : "Sell a Model"}</h1>
        <p>
          Your seller details, ship-from addresses, and preferred package size
          are remembered for your next listing.
        </p>
        <p>
          <b>{marketplaceFeeBps / 100}% Model Car Center marketplace fee.</b>{" "}
          You also pay actual payment processing, deducted from your proceeds.
          No listing or monthly fees.
        </p>
      </div>

      <form ref={formRef} className="listing-form" onSubmit={save} noValidate>
        <CatalogModelPicker initial={product} listingSaved={Boolean(productId)} initialQuery={[prefill.manufacturer, prefill.make, prefill.model, prefill.scale].filter(Boolean).join(" ")} disabled={busy} onReady={setCatalogReady} />
        <fieldset className="catalog-listing-fields" hidden={!catalogReady} disabled={!catalogReady}>
        <div className="listing-section-controls">
          <p>Open the section you need. Your entries stay in place when a section is closed.</p>
          <div>
            <button className="text-action" type="button" onClick={() => setAllListingSections(true)}>Expand all</button>
            <button className="text-action" type="button" onClick={() => setAllListingSections(false)}>Collapse all</button>
          </div>
        </div>

        <details className="listing-section" open>
          <summary>
            <span>
              <span className="step-label">1 · The model</span>
              <span className="listing-section-title">Model details</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <label>Listing title (optional)<input name="title" maxLength={200} placeholder="Uses the catalog model name if blank" defaultValue={String(product.title ?? "")} /></label>
          <label>Seller SKU (optional)<input name="sellerSku" maxLength={100} placeholder="Your own inventory reference" defaultValue={String(product.sellerSku ?? "")} /></label>
          <label>Listing description (optional)<textarea name="description" maxLength={4000} rows={4} defaultValue={String(product.description ?? "")} /></label>
          <label>Condition notes (optional)<textarea name="conditionNotes" maxLength={2000} rows={3} defaultValue={String(product.conditionNotes ?? "")} /></label>
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">2 · Condition</span>
              <span className="listing-section-title">Collector-grade details</span>
            </span>
          </summary>
          <div className="listing-section-content">
            <div className="listing-section-action-row">
              <button className="text-action" type="button" onClick={fillCommonDisclosures}>Fill common “none” answers</button>
            </div>
          <CollectibleListingFields product={product} includeIdentity={false} />
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">3 · Price</span>
              <span className="listing-section-title">Price and availability</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <div className="form-row">
            <label>Price (USD)<input name="price" inputMode="decimal" required defaultValue={product.priceCents == null ? "" : (Number(product.priceCents) / 100).toFixed(2)} /></label>
            <label>Quantity<input name="quantity" type="number" min={1} max={100} required defaultValue={String(product.inventoryQuantity ?? 1)} /></label>
          </div>
          <SellerFeeDisclosure marketplaceFeeBps={marketplaceFeeBps} />
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">4 · Package</span>
              <span className="listing-section-title">Packaged shipment</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <p>Enter the final box size and packed weight. Your preferred size is already filled in.</p>
          <div className="parcel-grid">
            <label>Length (in)<input name="packageLength" inputMode="decimal" required defaultValue={String(product.packageLength ?? seller?.defaultPackageLength ?? "12")} /></label>
            <label>Width (in)<input name="packageWidth" inputMode="decimal" required defaultValue={String(product.packageWidth ?? seller?.defaultPackageWidth ?? "9")} /></label>
            <label>Height (in)<input name="packageHeight" inputMode="decimal" required defaultValue={String(product.packageHeight ?? seller?.defaultPackageHeight ?? "6")} /></label>
            <label>Weight (lb)<input name="packageWeight" inputMode="decimal" required defaultValue={String(product.packageWeight ?? seller?.defaultPackageWeight ?? "2")} /></label>
          </div>
          <label className="consent-check compact-check">
            <input type="checkbox" name="rememberPackageDefaults" defaultChecked={!productId} />
            <span>Use these package details as the starting point for my next listing.</span>
          </label>
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">5 · Shipping</span>
              <span className="listing-section-title">Where will this ship from?</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <p>Saved addresses are private and are used only for carrier rates and labels.</p>
          <label>
            Ship-from address
            <select name="shipFromAddressId" value={shipFromAddressId} onChange={(event) => setShipFromAddressId(event.target.value)}>
              {shipFromAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label}{address.isDefault ? " · Default" : ""} — {address.city}, {address.region || address.country}
                </option>
              ))}
              <option value="new">+ Add a new address</option>
            </select>
          </label>

          {selectedShipFromAddress ? (
            <div className="saved-address-card">
              <strong>{selectedShipFromAddress.label}</strong>
              <span>{selectedShipFromAddress.street1}{selectedShipFromAddress.street2 ? `, ${selectedShipFromAddress.street2}` : ""}</span>
              <span>{selectedShipFromAddress.city}, {selectedShipFromAddress.region} {selectedShipFromAddress.postalCode}</span>
              <span>{countryName(selectedShipFromAddress.country)}</span>
              <input type="hidden" name="shippingOriginStreet1" value={selectedShipFromAddress.street1} />
              <input type="hidden" name="shippingOriginStreet2" value={selectedShipFromAddress.street2 ?? ""} />
              <input type="hidden" name="shippingOriginCity" value={selectedShipFromAddress.city} />
              <input type="hidden" name="shippingOriginRegion" value={selectedShipFromAddress.region ?? ""} />
              <input type="hidden" name="shippingOriginPostalCode" value={selectedShipFromAddress.postalCode} />
              <input type="hidden" name="shippingOriginCountry" value={selectedShipFromAddress.country} />
              <input type="hidden" name="shippingOriginPhone" value={selectedShipFromAddress.phone} />
            </div>
          ) : (
            <div className="new-address-fields">
              <label>Address name (optional)<input name="shipFromAddressLabel" maxLength={80} placeholder="Home, office, storage unit…" defaultValue="Home" autoComplete="off" /></label>
              <AddressFields ref={addressRef} fieldNames={SHIP_FROM_FIELD_NAMES} initialValues={shipFromAddressValues(seller)} includePhone disabled={busy} />
            </div>
          )}

          <details className="seller-profile-details">
            <summary>Seller profile shown on every listing</summary>
            <div>
              <label>Seller display name<input name="sellerDisplayName" required maxLength={120} defaultValue={String(seller?.storeName ?? displayName)} /></label>
              <label>Short seller description<textarea name="sellerDescription" maxLength={1000} rows={3} defaultValue={String(seller?.description ?? "")} /></label>
              <label>Specialty<input name="sellerSpecialty" maxLength={300} defaultValue={String(seller?.specialty ?? "")} placeholder="The scales, makers or themes you collect"/></label>
              <label>How you pack models<textarea name="sellerPackingApproach" maxLength={1000} rows={3} defaultValue={String(seller?.packingApproach ?? "")} placeholder="How you protect the model, its box and accessories"/></label>
              <p>A useful introduction (at least 30 characters), specialty, and packing approach (at least 20 characters) are required before review. Your state or region is public; street addresses stay private. You can save a draft first.</p>
            </div>
          </details>
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">6 · Photos</span>
              <span className="listing-section-title">Photos</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <p>Add original photos of your item. Factory-sealed models need at least two exterior views; other models need at least four photos. Do not reuse another seller&apos;s photos.</p>
          <ProductImageFields productId={productId || undefined} images={images} primaryImageUrl={primaryImageUrl} files={files} disabled={busy} onFilesChange={setFiles} onRemove={productId ? removeImage : undefined} onRemoveLegacy={productId ? removeLegacyImage : undefined} onReorder={productId ? reorderImages : undefined} />
          <RequiredPhotoChecklist product={product} />
          </div>
        </details>

        <details className="listing-section">
          <summary>
            <span>
              <span className="step-label">7 · Review</span>
              <span className="listing-section-title">Payouts and review</span>
            </span>
          </summary>
          <div className="listing-section-content listing-submit">
          <div>
            <p>{stripeReady ? "Stripe payouts are ready. Submitted listings are reviewed before going live." : "You can keep drafting now. Complete secure Stripe-hosted payout onboarding before submission."}</p>
            <label className="consent-check">
              <input type="checkbox" checked={acceptedSellerTerms} onChange={(event) => setAcceptedSellerTerms(event.target.checked)} />
              <span>I agree to the current <Link href="/seller-terms">Seller Terms</Link>, including deductions for marketplace commission and actual payment processing, fulfillment rules, and return obligations.</span>
            </label>
            {!stripeReady && <button className="button outline small" type="button" disabled={busy || !acceptedSellerTerms} onClick={() => void startOnboarding()}>Complete Stripe onboarding</button>}
          </div>
          {message && <p className="admin-message" role="status">{message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row-actions">
            <button className="button outline" type="submit" value="save" disabled={busy}>{busy ? "Saving…" : "Save draft"}</button>
            <button className="button dark" type="submit" value="submit" disabled={busy || !stripeReady || !acceptedSellerTerms}>{busy ? "Saving…" : "Submit for review"}</button>
          </div>
          </div>
        </details>
        </fieldset>
      </form>
      <p><Link className="text-link" href="/account?view=listings">Back to My Listings</Link></p>
    </div>
  );
}
