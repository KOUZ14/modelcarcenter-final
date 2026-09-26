"use client";
import { CatalogModelPicker } from "./catalog-model-picker";
import { SellerFeeDisclosure } from "./seller-fee-disclosure";


import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";
import { ProductImageFields } from "@/components/product-image-fields";
import { POLICY_VERSION } from "@/lib/legal";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { countryName, SHIP_FROM_FIELD_NAMES, shipFromAddressValues } from "@/lib/address";
import { focusListingError, listingFieldLabel, listingFieldProps, listingFormErrors, listingInputError, requiredListingFieldMessage, type ListingFieldErrors } from "@/lib/listing-form-validation";
import { ListingFieldError } from "./listing-field-error";
import { ListingBuyerPreview } from "./listing-buyer-preview";
import { buildListingPreview } from "@/lib/listing-preview";
import type { ProductDetail } from "@/lib/types";
import { getSelectedPhotoViews, photoAltForViews } from "@/lib/listing-evidence";
import { listingEditorProgress } from "@/lib/listing-editor-progress";
import { formatCondition } from "@/lib/format";

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
  catalogModel,
  collectionReturnTo,
  paymentSetup,
}: {
  initial: Initial;
  seller: Seller;
  shipFromAddresses: ShipFromAddress[];
  displayName: string;
  prefill: Record<string, string>;
  marketplaceFeeBps: number;
  collectionCatalog?: Record<string, unknown>;
  catalogModel?: Record<string, unknown>;
  collectionReturnTo?: string;
  paymentSetup?: "returned" | "refresh" | "unavailable";
}) {
  const product = initial?.product ?? collectionCatalog ?? {};
  const [catalogReady, setCatalogReady] = useState(Boolean(product.catalogProductId));
  const formRef = useRef<HTMLFormElement>(null);
  const addressRef = useRef<AddressFieldsHandle>(null);
  const savingRef = useRef(false);
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
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [catalogSummary, setCatalogSummary] = useState<Record<string, unknown>>(catalogModel ?? product);
  const [preview, setPreview] = useState<ProductDetail | null>(null);
  const previewUrls = useRef<string[]>([]);
  useEffect(() => () => { previewUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const [values, setValues] = useState<Record<string, unknown>>({ ...product,
    price: product.priceCents == null ? "" : (Number(product.priceCents) / 100).toFixed(2), quantity: product.inventoryQuantity ?? 1,
    sellerDisplayName: seller?.storeName ?? displayName, sellerDescription: seller?.description ?? "", sellerSpecialty: seller?.specialty ?? "", sellerPackingApproach: seller?.packingApproach ?? "",
  });

  function readValues() { if (formRef.current && !savingRef.current) setValues(Object.fromEntries(new FormData(formRef.current))); }
  function changedFiles(next: File[]) {
    setFiles(next); setDirty(true); setSubmitted(false);
    setPendingCover(current => current && next.includes(current) ? current : null);
  }
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const update = () => queueMicrotask(() => { if (!savingRef.current) setValues(Object.fromEntries(new FormData(form))); });
    update(); form.addEventListener?.("listing-details-change", update);
    return () => form.removeEventListener?.("listing-details-change", update);
  }, [catalogReady, shipFromAddressId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener?.("beforeunload", warn);
    return () => window.removeEventListener?.("beforeunload", warn);
  }, [dirty]);
  const stripeReady = Boolean(
    seller?.stripeChargesEnabled &&
      seller?.stripePayoutsEnabled &&
      seller?.status === "active",
  );
  const [message, setMessage] = useState(
    paymentSetup === "unavailable"
      ? "Your draft is saved. We could not check your payout connection. Reload this page to try again."
      : paymentSetup && stripeReady
        ? "Your draft and photos are saved. Your payout account is connected. You can submit your listing for review."
        : paymentSetup
          ? "Your draft and photos are saved. Connect your payout account again to finish setup."
          : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ListingFieldErrors>({});
  const needsErrorFocus = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (busy || !needsErrorFocus.current || !formRef.current) return;
    needsErrorFocus.current = false;
    focusListingError(formRef.current, fieldErrors);
  }, [busy, fieldErrors]);

  useEffect(() => {
    if (!busy && error && errorRef.current) {
      errorRef.current.focus({ preventScroll: true });
      errorRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [busy, error]);

  function showValidation(fields: ListingFieldErrors) {
    const next = Object.fromEntries(Object.entries(fields).map(([name, message]) =>
      [name, message === "Required" ? requiredListingFieldMessage(name) : message === "Invalid value" ? `Check ${listingFieldLabel(name).toLowerCase()}.` : message],
    ));
    addressRef.current?.setErrors(next, { focus: false });
    if (shipFromAddressId !== "new" && Object.keys(next).some(name => name.startsWith("shippingOrigin"))) {
      for (const name of Object.keys(next)) if (name.startsWith("shippingOrigin")) delete next[name];
      next.shipFromAddressId = "This saved address is incomplete. Choose another address or add a new one.";
    }
    needsErrorFocus.current = true;
    setFieldErrors(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    await saveListing(event.currentTarget, submitter?.value === "submit" ? "submit" : "save");
  }

  async function saveListing(form: HTMLFormElement, action: "save" | "submit" | "connect") {
    if (savingRef.current || photoBusyRef.current) return;
    if (!catalogReady) { showValidation({ catalogProductId: "Choose a catalog model first." }); return; }
    setError("");
    setMessage("");
    const shouldSubmit = action === "submit";
    const shouldConnect = action === "connect";
    const errors = listingFormErrors(form);
    if ((shouldSubmit || shouldConnect) && !acceptedSellerTerms) {
      errors.sellerTermsVersion = "Accept the Seller Terms before connecting your payout account or submitting for review.";
    }
    if (Object.keys(errors).length) {
      showValidation(errors);
      return;
    }
    if (shouldSubmit && !stripeReady) { openSection("review"); setError("Connect your payout account before submitting for review."); return; }
    setFieldErrors({});
    addressRef.current?.setErrors({}, { focus: false });
    savingRef.current = true;
    setBusy(true);
    let draftSaved = false;
    try {
      const payload = Object.fromEntries(new FormData(form));
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
        if (body.fields && Object.keys(body.fields).length) { showValidation(body.fields); return; }
        throw new Error(body.error || "The draft could not be saved.");
      }
      draftSaved = true;
      setProductId(body.productId);
      const query = new URLSearchParams(location.search);
      query.set("id", body.productId);
      query.delete("stripe");
      history.replaceState(null, "", `/sell/model?${query}`);
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
        const uploadFiles = pendingCover ? [pendingCover, ...files.filter(file => file !== pendingCover)] : files;
        await uploadProductPhotoFiles({
          endpoint: "/api/listings/images",
          productId: body.productId,
          files: uploadFiles,
          makePrimary: Boolean(pendingCover),
          onUploaded(uploaded, processedCount) {
            nextImages = pendingCover && processedCount === 1 ? [...uploaded, ...nextImages] : [...nextImages, ...uploaded];
            if (pendingCover && processedCount === 1) { setPrimaryImageUrl(uploaded[0]?.url ?? null); setPendingCover(null); }
            setImages(nextImages);
            setFiles(uploadFiles.slice(processedCount));
            setPrimaryImageUrl(
              (current) => current ?? uploaded[0]?.url ?? null,
            );
          },
        });
      }
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      if (shouldConnect) {
        setMessage("Draft and photos saved. Opening secure payout setup…");
        const connection = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "stripe_onboarding",
            productId: body.productId,
            sellerTermsVersion: POLICY_VERSION,
            collectionItem: query.get("collectionItem"),
            selling: query.get("selling"),
            minimum: query.get("minimum"),
          }),
        });
        const connectionBody = (await connection.json()) as {
          onboardingUrl?: string;
          error?: string;
        };
        if (!connection.ok || !connectionBody.onboardingUrl) {
          throw new Error(connectionBody.error || "Payout setup could not be started. Your draft is saved; please try again.");
        }
        window.location.assign(connectionBody.onboardingUrl);
      } else if (shouldSubmit) {
        const review = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            productId: body.productId,
            sellerTermsVersion: POLICY_VERSION,
          }),
        });
        const reviewBody = (await review.json()) as { error?: string; fields?: ListingFieldErrors };
        if (!review.ok) {
          if (reviewBody.fields && Object.keys(reviewBody.fields).length) { showValidation(reviewBody.fields); return; }
          throw new Error(
            reviewBody.error || "The listing could not be submitted.",
          );
        }
        setSubmitted(true);
        setMessage("Listing submitted for marketplace review. We’ll email the outcome; status and feedback are also in My Listings.");
      } else {
        setMessage(
          nextImages.length
            ? "Draft, photos, and preferences saved."
            : "Draft and preferences saved. Add photos before submitting.",
        );
      }
    } catch (reason) {
      setMessage(shouldConnect && draftSaved
        ? "Your draft is saved. Fix the issue below, then try connecting your payout account again."
        : "");
      setError(
        reason instanceof Error
          ? reason.message
          : "The listing could not be saved.",
      );
    } finally {
      savingRef.current = false;
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
      throw new Error(body.error || "The photo could not be removed.");
    }
    setSubmitted(false);
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
    setSubmitted(false);
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
    setPendingCover(null);
    setSubmitted(false);
    setImages((current) => {
      const byId = new Map(current.map((image) => [image.id, image]));
      const next = imageIds.map((id) => byId.get(id)!);
      setPrimaryImageUrl(next[0]?.url ?? null);
      return next;
    });
  }

  function setAllListingSections(open: boolean) {
    formRef.current
      ?.querySelectorAll<HTMLDetailsElement>(".listing-section")
      .forEach((section) => {
        section.open = open;
      });
  }

  const selectedShipFromAddress = shipFromAddresses.find(
    (address) => address.id === shipFromAddressId,
  );

  const evidenceImages = [...images, ...files.map(file => ({ alt: photoAltForViews(getSelectedPhotoViews(file), file.name) }))];
  const progress = listingEditorProgress(values, evidenceImages);
  const text = (key: string) => String(values[key] ?? "").trim();
  const photoSummary = `${images.length} uploaded${files.length ? ` · ${files.length} pending` : ""} · ${progress.photo.complete ? "Required views covered" : `${progress.photo.missing.length} photo requirement${progress.photo.missing.length === 1 ? "" : "s"} missing`}`;
  const catalogTitle = String(catalogSummary.title || [catalogSummary.modelManufacturer, catalogSummary.vehicleMake, catalogSummary.vehicleModel].filter(Boolean).join(" "));
  function openPreview() {
    if (!formRef.current || busy || photoBusy) return;
    const current = { ...values, ...Object.fromEntries(new FormData(formRef.current)) };
    if (selectedShipFromAddress) {
      current.shippingOriginRegion = selectedShipFromAddress.region ?? "";
      current.shippingOriginCountry = selectedShipFromAddress.country;
    }
    const pendingImages = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.current.push(url);
      return { id: `pending-${index}`, url, alt: photoAltForViews(getSelectedPhotoViews(file), file.name) };
    });
    setPreview(buildListingPreview({ values: current, catalog: { ...product, ...catalogSummary, id: productId }, seller, images, primaryImageUrl, pendingImages, pendingCoverUrl: pendingCover ? pendingImages[files.indexOf(pendingCover)]?.url : undefined }));
  }
  function closePreview() {
    setPreview(null);
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current = [];
  }
  const remaining = [
    ...(!progress.conditionComplete ? [{ section: "condition", label: "Complete condition disclosures", field: Object.keys(progress.conditionErrors)[0] }] : []),
    ...(!progress.photo.complete ? [{ section: "condition", label: `Photos: ${progress.photo.missing.join(", ")}`, field: "images" }] : []),
    ...(!progress.priceComplete ? [{ section: "price", label: "Enter price and quantity" }] : []),
    ...(!progress.packageComplete || !progress.addressComplete ? [{ section: "shipping", label: "Complete package and ship-from details" }] : []),
    ...(!progress.profileComplete ? [{ section: "shipping", label: "Complete your reusable seller profile", field: "sellerDescription" }] : []),
    ...(!stripeReady ? [{ section: "review", label: "Connect your payout account" }] : []),
    ...(!acceptedSellerTerms ? [{ section: "review", label: "Accept Seller Terms", field: "sellerTermsVersion" }] : []),
  ];
  function openSection(section: string, field?: string) {
    const target = formRef.current?.querySelector<HTMLDetailsElement>(`#listing-${section}`);
    if (target) { target.open = true; target.scrollIntoView({ block: "start", behavior: "smooth" }); }
    if (field && formRef.current) focusListingError(formRef.current, { [field]: "Complete this field" }, field);
    else target?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }

  return (
    <div className="listing-shell collector-listing-shell">
      {collectionReturnTo && <div className="collection-selling-setup"><p>This listing is for the model saved in your collection. Complete the condition, photos and shipping details, then submit it for review. Once it is active, return to enable your chosen availability.</p><Link href={collectionReturnTo + (productId ? `&listing=${encodeURIComponent(productId)}` : "")}>Return to collection setup</Link></div>}
      <div className="page-title listing-editor-intro">
        <h1>{productId ? "Edit your listing" : "Sell a Model"}</h1>
        <p>{marketplaceFeeBps / 100}% marketplace fee + actual payment processing. No listing or monthly fees.</p>
      </div>

      <form ref={formRef} className="listing-form collector-editor" onSubmit={save} noValidate onChange={(event) => {
        if ((event.target as HTMLElement).closest(".compact-photo-editor")) return;
        setDirty(true); setSubmitted(false); queueMicrotask(readValues);
        const field = event.target;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
        if (!fieldErrors[field.name]) return;
        const message = listingInputError(field);
        setFieldErrors(current => {
          const next = { ...current };
          if (message) next[field.name] = message;
          else delete next[field.name];
          return next;
        });
      }}>
        {Object.keys(fieldErrors).length > 0 && <div className="form-error listing-error-summary" role="alert">
          <p>Please check the highlighted fields before continuing.</p>
          <ul>{Object.entries(fieldErrors).map(([name, message]) => <li key={name}>
            <button type="button" className="text-action" onClick={() => { if (formRef.current) focusListingError(formRef.current, fieldErrors, name); }}>{listingFieldLabel(name)}: {message}</button>
          </li>)}</ul>
        </div>}
        {error && <p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
        <div data-listing-field="catalogProductId" tabIndex={-1} {...listingFieldProps(fieldErrors, "catalogProductId")}>
        <CatalogModelPicker collectorRecovery onModelChange={model => { setCatalogSummary(model); setDirty(true); }} initial={product} listingSaved={Boolean(productId)} initialQuery={[prefill.manufacturer, prefill.make, prefill.model, prefill.scale].filter(Boolean).join(" ")} disabled={busy} onReady={(ready) => {
          setCatalogReady(ready);
          if (ready) setFieldErrors(current => {
            const next = { ...current };
            delete next.catalogProductId;
            return next;
          });
        }} />
        <ListingFieldError errors={fieldErrors} name="catalogProductId" />
        </div>
        <fieldset className="catalog-listing-fields" hidden={!catalogReady} disabled={!catalogReady || busy}>
        <div className="listing-section-controls">
          <p>Save draft to keep your edits.</p>
          <div>
            <button className="text-action" type="button" onClick={() => setAllListingSections(true)}>Expand all</button>
            <button className="text-action" type="button" onClick={() => setAllListingSections(false)}>Collapse all</button>
          </div>
        </div>

        <details className="listing-section" id="listing-model">
          <summary>
            <span>
              <span className="step-label">1 · The model</span>
              <span className="listing-section-title">Model</span><span className="listing-section-progress">Catalog linked · Optional title and story</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <label>Listing title (optional)<input name="title" maxLength={200} placeholder="Uses the catalog model name if blank" defaultValue={String(product.title ?? "")} /></label>
          <label>Seller SKU (optional)<input name="sellerSku" maxLength={100} placeholder="Your own inventory reference" defaultValue={String(product.sellerSku ?? "")} /></label>
          <label>Additional context or model story (optional)<textarea name="description" maxLength={4000} rows={4} defaultValue={String(product.description ?? "")} /></label>
          </div>
        </details>

        <details className="listing-section" id="listing-condition" open>
          <summary>
            <span>
              <span className="step-label">2 · Photos &amp; condition</span>
              <span className="listing-section-title">Photos &amp; condition</span>
              <span className="listing-section-progress">{text("modelCondition") ? formatCondition(text("modelCondition")) : "Condition needed"} · {text("originalBoxStatus") ? `Box ${formatCondition(text("originalBoxStatus")).toLowerCase()}` : "Box status needed"}</span>
              <span className="listing-section-progress" data-incomplete={!progress.photo.complete}>{photoSummary} · {progress.conditionComplete ? "Disclosures complete" : "Disclosures needed"}</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <RequiredPhotoChecklist product={product} images={evidenceImages} />
          <div data-listing-field="images" tabIndex={-1} {...listingFieldProps(fieldErrors, "images")}>
            <ListingFieldError errors={fieldErrors} name="images" />
            <ProductImageFields productId={productId || undefined} images={images} primaryImageUrl={primaryImageUrl} files={files} disabled={busy}
              onFilesChange={changedFiles} onImagesChange={setImages} onLabelsChange={() => setSubmitted(false)}
              onBusyChange={value => { photoBusyRef.current = value; setPhotoBusy(value); }}
              pendingCover={pendingCover} onCoverFileChange={file => { changedFiles([file, ...files.filter(item => item !== file)]); setPendingCover(file); }}
              onRemove={productId ? removeImage : undefined} onRemoveLegacy={productId ? removeLegacyImage : undefined} onReorder={productId ? reorderImages : undefined} />
          </div>
          <CollectibleListingFields product={product} includeIdentity={false} includeLegacyNotes errors={fieldErrors} />
          </div>
        </details>

        <details className="listing-section" id="listing-price">
          <summary>
            <span>
              <span className="step-label">3 · Price</span>
              <span className="listing-section-title">Price</span><span className="listing-section-progress">{progress.priceComplete ? `$${Number(text("price").replace(/^\$/, "")).toFixed(2)} · Quantity ${text("quantity")}` : "Enter a valid price and quantity"}</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <div className="form-row">
            <label>Price (USD)<input name="price" {...listingFieldProps(fieldErrors, "price")} inputMode="decimal" required defaultValue={product.priceCents == null ? "" : (Number(product.priceCents) / 100).toFixed(2)} /><ListingFieldError errors={fieldErrors} name="price" /></label>
            <label>Quantity<input name="quantity" {...listingFieldProps(fieldErrors, "quantity")} type="number" min={1} max={100} required defaultValue={String(product.inventoryQuantity ?? 1)} /><ListingFieldError errors={fieldErrors} name="quantity" /></label>
          </div>
          <SellerFeeDisclosure marketplaceFeeBps={marketplaceFeeBps} price={text("price")} />
          </div>
        </details>

        <details className="listing-section" id="listing-shipping">
          <summary>
            <span>
              <span className="step-label">4 · Shipping</span>
              <span className="listing-section-title">Shipping</span><span className="listing-section-progress">{progress.addressComplete ? "Address complete" : "Address needed"} · {progress.packageComplete ? "Package complete" : "Package details needed"} · {progress.profileComplete ? "Seller profile complete" : "Seller profile needed"}</span>
            </span>
          </summary>
          <div className="listing-section-content">
          <p>Enter the final box size and packed weight. Your preferred size is already filled in.</p>
          <div className="parcel-grid">
            <label>Length (in)<input name="packageLength" {...listingFieldProps(fieldErrors, "packageLength")} inputMode="decimal" required defaultValue={String(product.packageLength ?? seller?.defaultPackageLength ?? "12")} /><ListingFieldError errors={fieldErrors} name="packageLength" /></label>
            <label>Width (in)<input name="packageWidth" {...listingFieldProps(fieldErrors, "packageWidth")} inputMode="decimal" required defaultValue={String(product.packageWidth ?? seller?.defaultPackageWidth ?? "9")} /><ListingFieldError errors={fieldErrors} name="packageWidth" /></label>
            <label>Height (in)<input name="packageHeight" {...listingFieldProps(fieldErrors, "packageHeight")} inputMode="decimal" required defaultValue={String(product.packageHeight ?? seller?.defaultPackageHeight ?? "6")} /><ListingFieldError errors={fieldErrors} name="packageHeight" /></label>
            <label>Weight (lb)<input name="packageWeight" {...listingFieldProps(fieldErrors, "packageWeight")} inputMode="decimal" required defaultValue={String(product.packageWeight ?? seller?.defaultPackageWeight ?? "2")} /><ListingFieldError errors={fieldErrors} name="packageWeight" /></label>
          </div>
          <label className="consent-check compact-check">
            <input type="checkbox" name="rememberPackageDefaults" defaultChecked={!productId} />
            <span>Use these package details as the starting point for my next listing.</span>
          </label>
          <p>Your ship-from address, packed dimensions, weight, and the buyer’s destination determine carrier rates at checkout. Handling and return policies come from your saved seller settings.</p>
          <p>Saved addresses are private and are used only for carrier rates and labels.</p>
          <label>
            Ship-from address
            <select name="shipFromAddressId" {...listingFieldProps(fieldErrors, "shipFromAddressId")} value={shipFromAddressId} onChange={(event) => setShipFromAddressId(event.target.value)}>
              {shipFromAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label}{address.isDefault ? " · Default" : ""} - {address.city}, {address.region || address.country}
                </option>
              ))}
              <option value="new">+ Add a new address</option>
            </select>
            <ListingFieldError errors={fieldErrors} name="shipFromAddressId" />
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
            <summary>Seller profile {progress.profileComplete ? "complete" : "needs details"} · Edit</summary>
            <p>Saving these shared seller details updates your profile on every listing.</p>
            <div>
              <label>Seller display name<input name="sellerDisplayName" {...listingFieldProps(fieldErrors, "sellerDisplayName")} required maxLength={120} defaultValue={String(seller?.storeName ?? displayName)} /><ListingFieldError errors={fieldErrors} name="sellerDisplayName" /></label>
              <label>Short seller description<textarea name="sellerDescription" {...listingFieldProps(fieldErrors, "sellerDescription")} maxLength={1000} rows={3} defaultValue={String(seller?.description ?? "")} /><ListingFieldError errors={fieldErrors} name="sellerDescription" /></label>
              <label>Specialty<input name="sellerSpecialty" {...listingFieldProps(fieldErrors, "sellerSpecialty")} maxLength={300} defaultValue={String(seller?.specialty ?? "")} placeholder="The scales, makers or themes you collect"/><ListingFieldError errors={fieldErrors} name="sellerSpecialty" /></label>
              <label>How you pack models<textarea name="sellerPackingApproach" {...listingFieldProps(fieldErrors, "sellerPackingApproach")} maxLength={1000} rows={3} defaultValue={String(seller?.packingApproach ?? "")} placeholder="How you protect the model, its box and accessories"/><ListingFieldError errors={fieldErrors} name="sellerPackingApproach" /></label>
              <p>A useful introduction (at least 30 characters), specialty, and packing approach (at least 20 characters) are required before review. Your state or region is public; street addresses stay private. You can save a draft first.</p>
            </div>
          </details>
          </div>
        </details>

        <details className="listing-section" id="listing-review" open={Boolean(paymentSetup)}>
          <summary>
            <span>
              <span className="step-label">5 · Review</span>
              <span className="listing-section-title">Review &amp; submit</span><span className="listing-section-progress">{remaining.length ? `${remaining.length} step${remaining.length === 1 ? "" : "s"} remaining` : "Ready for review"}</span>
            </span>
          </summary>
          <div className="listing-section-content listing-submit">
          <div className="listing-review-summary">
            <div><h3>{text("title") || catalogTitle || "Your listing"}</h3><p>{/^\d+(\.\d{1,2})?$/.test(text("price")) ? `$${Number(text("price")).toFixed(2)}` : "Price needed"} · {images.length + files.length} photos · Model condition: {formatCondition(text("modelCondition")) || "Not entered"}</p></div>
            <button type="button" className="button dark" disabled={busy || photoBusy} onClick={openPreview}>Preview listing</button>
            <p className="field-note">See the buyer page with your current edits and photo order. Purchase actions are inactive in preview.</p>
          </div>
          <div className="listing-remaining"><h3>{remaining.length ? "Before you submit" : "Ready to submit"}</h3>{remaining.length > 0 && <ul>{remaining.map(item => <li key={item.label}><button className="text-action" type="button" onClick={() => openSection(item.section, item.field)}>{item.label}</button></li>)}</ul>}</div>
          <div>
            <p>{stripeReady ? "Your payout account is connected. Submitted listings are reviewed before going live." : "Connect your payout account to receive money from your sales. We’ll save your draft and photos before opening secure setup with Stripe, then bring you back to this listing."}</p>
            <label className="consent-check">
              <input type="checkbox" name="sellerTermsVersion" {...listingFieldProps(fieldErrors, "sellerTermsVersion")} checked={acceptedSellerTerms} onChange={(event) => setAcceptedSellerTerms(event.target.checked)} />
              <span>I agree to the current <Link href="/seller-terms">Seller Terms</Link>, including deductions for marketplace commission and actual payment processing, fulfillment rules, and return obligations.</span>
            </label>
            <ListingFieldError errors={fieldErrors} name="sellerTermsVersion" />
            {!stripeReady && <button className="button outline small" type="button" disabled={busy || !acceptedSellerTerms} onClick={() => { if (formRef.current) return saveListing(formRef.current, "connect"); }}>{busy ? "Saving draft…" : "Connect payout account"}</button>}
          </div>
          <p>Submission sends this listing to marketplace review before it can be published. We’ll email the outcome; check My Listings for status and any requested changes.</p>
          </div>
        </details>
        </fieldset>
        {catalogReady && <div className="listing-action-bar" aria-label="Save and submit listing">
          <div className="listing-save-status"><strong role="status">{busy ? "Saving draft and photos…" : photoBusy ? "Saving photo changes…" : dirty ? "Unsaved changes" : savedAt ? `Saved at ${savedAt}` : productId ? "Saved draft loaded" : "Draft not yet saved"}</strong>
          <button type="button" className="text-action" onClick={() => openSection("review")}>{submitted ? "Submitted for review" : remaining.length ? `${remaining.length} step${remaining.length === 1 ? "" : "s"} to review · View` : "Review & submit"}</button></div>
          <div className="row-actions"><button className="button outline" type="submit" value="save" disabled={busy || photoBusy}>{busy ? "Saving…" : "Save draft"}</button><button className="button dark" type="submit" value="submit" disabled={busy || photoBusy || submitted}>{busy ? "Saving…" : "Submit for review"}</button></div>
          {message && <p className="admin-message" role="status">{message}</p>}
        </div>}
      </form>
      {preview && <ListingBuyerPreview product={preview} onClose={closePreview} />}
      <p><Link className="text-link" href="/account?view=listings">Back to My Listings</Link></p>
    </div>
  );
}
