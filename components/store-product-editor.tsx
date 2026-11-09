"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product, StoreData } from "./store-dashboard";
import { useTaskMeasurement } from "./use-task-measurement";
import { useDialogFocus } from "./use-dialog-focus";
import { CatalogModelPicker } from "./catalog-model-picker";
import { ProductImageFields } from "./product-image-fields";
import { CollectibleListingFields, RequiredPhotoChecklist } from "./collectible-listing-fields";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import { formatMoney } from "@/lib/format";
import { storeRequest } from "@/lib/store-client";
import { storeListingIssues } from "@/lib/store-listing-readiness";
import { focusListingError, listingFieldLabel, listingFieldProps, listingFormErrors } from "@/lib/listing-form-validation";
import { ListingFieldError } from "./listing-field-error";
import { buildListingPreview } from "@/lib/listing-preview";
import { ListingBuyerPreview } from "./listing-buyer-preview";
import { getSelectedPhotoViews, photoAltForViews } from "@/lib/listing-evidence";
import type { ProductDetail } from "@/lib/types";
import { StoreSetupNotice } from "./store-setup-notice";
const feePercent = (bps: number) => `${bps / 100}%`;
export function StoreProductEditor({
  marketplaceFeeBps,
  product,
  store,
  setup,
  action,
  onClose,
}: {
  product: Product | null;
  store: StoreData["store"];
  setup: StoreData["setup"];
  marketplaceFeeBps: number;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
  onClose(): void;
}) {
  const task = useTaskMeasurement("listing");
  const router = useRouter();
  const [catalogReady, setCatalogReady] = useState(Boolean(product?.catalogProductId));
  const [catalogModel, setCatalogModel] = useState<Record<string, unknown>>({ ...product });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState<ProductDetail | null>(null);
  const previewUrls = useRef<string[]>([]);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, unknown>>({ ...product, price: product ? String(product.priceCents / 100) : "", inventoryQuantity: product?.preorder?.capacity ?? product?.inventoryQuantity ?? 1 });
  const [savedNotice, setSavedNotice] = useState("");
  const [, setLabelRevision] = useState(0);
  function requestClose() { if (busy || photoBusy || preview) return; if (dirty) setConfirmClose(true); else onClose(); }
  const dialog = useDialogFocus(requestClose);
  const [productId, setProductId] = useState(product?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(product?.images ?? []);
  const [primaryImageUrl, setPrimaryImageUrl] = useState(
    product?.primaryImageUrl ?? null,
  );
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  const [price, setPrice] = useState(product?.priceCents ? (product.priceCents / 100).toFixed(2) : "");
  const [availabilityType, setAvailabilityType] = useState<
    "in_stock" | "preorder"
  >(product?.availabilityType ?? "in_stock");
  function readValues() {
    if (formRef.current) setValues(Object.fromEntries(new FormData(formRef.current)));
  }
  function changed() { setDirty(true); task.start(); queueMicrotask(readValues); }
  useEffect(() => {
    const form = formRef.current;
    const update = () => queueMicrotask(readValues);
    form?.addEventListener("listing-details-change", update);
    update();
    return () => form?.removeEventListener("listing-details-change", update);
  }, [catalogReady]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => () => previewUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const evidenceImages = [...images, ...files.map(file => ({ alt: photoAltForViews(getSelectedPhotoViews(file), file.name), url: "pending" }))];
  const issues = storeListingIssues({ ...values, catalogProductId: catalogReady ? "selected" : "", reservedQuantity: product?.reservedQuantity ?? 0, primaryImageUrl, availabilityType }, evidenceImages);
  function showErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    requestAnimationFrame(() => { if (formRef.current) focusListingError(formRef.current, errors); });
  }
  function openPreview() {
    if (!formRef.current) return;
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    const pendingImages = files.map((file, index) => { const url = URL.createObjectURL(file); previewUrls.current.push(url); return { id: `pending-${index}`, url, alt: photoAltForViews(getSelectedPhotoViews(file), file.name) }; });
    const current = Object.fromEntries(new FormData(formRef.current));
    let catalog: Record<string, unknown> = { ...product, ...catalogModel };
    if (typeof current.catalogModel === "string") { try { catalog = { ...catalog, ...JSON.parse(current.catalogModel) }; } catch { /* Picker validation owns invalid catalog choices. */ } }
    const result = buildListingPreview({ values: { ...current, quantity: current.inventoryQuantity, sellerDisplayName: store.storeName, sellerDescription: store.description, sellerSpecialty: store.specialty, sellerPackingApproach: store.packingApproach, shippingOriginRegion: store.shippingOriginRegion, shippingOriginCountry: store.shippingOriginCountry }, catalog, seller: store, images, primaryImageUrl, pendingImages });
    setPreview({ ...result, sellerType: "professional", availabilityType, releaseDate: String(current.releaseDate || "") || null, shippingMode: store.shippingMode, defaultShippingCents: store.defaultShippingCents });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || photoBusy) return;
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    if (!catalogReady) { showErrors({ catalogProductId: "Choose a catalog model first." }); return; }
    const form = event.currentTarget;
    const current = Object.fromEntries(new FormData(form));
    const validation = listingFormErrors(form);
    const live = product && ["active", "sold_out"].includes(product.status);
    if (!publish && !live) {
      for (const name of Object.keys(validation)) if (!["sellerSku", "inventoryQuantity"].includes(name) && !String(current[name] ?? "").trim()) delete validation[name];
    }
    if (publish) Object.assign(validation, storeListingIssues({ ...current, catalogProductId: "selected", reservedQuantity: product?.reservedQuantity ?? 0, primaryImageUrl }, evidenceImages));
    if (Object.keys(validation).length) { setImageError("Check the highlighted fields."); showErrors(validation); return; }
    if (publish && !setup.readyToPublish) { setImageError("Complete store setup before listing for sale. You can save this item as a draft."); showErrors({ storeSetup: "Complete store setup." }); return; }
    inFlight.current = true; setBusy(true); setFieldErrors({}); setImageError(""); setSavedNotice("");
    let saved = false;
    let remaining = files.length;
    try {
      const result = await action({ action: "save_product", id: productId || undefined, ...current }, { message: "" });
      const savedId = String(result.productId ?? "");
      if (!savedId) throw new Error("We could not confirm the saved item. Check inventory for this SKU before retrying.");
      setProductId(savedId); saved = true;
      if (files.length) await uploadProductPhotoFiles({ endpoint: "/api/listings/images", productId: savedId, files, makePrimary: !primaryUploadFinished && !primaryImageUrl,
        onUploaded(uploaded, processedCount) { setImages(previous => [...previous, ...uploaded]); setFiles(files.slice(processedCount)); remaining = files.length - processedCount; if (processedCount === 1 && !primaryImageUrl) { setPrimaryUploadFinished(true); setPrimaryImageUrl(uploaded[0]?.url ?? null); } },
      });
      if (publish) await action({ action: "product_status", productId: savedId, status: "active" }, { message: "Item listed for sale." });
      setDirty(false); task.complete();
      if (publish) { onClose(); router.refresh(); }
      else { setSavedNotice(live ? "Changes saved. This item is listed for sale." : "Draft saved. You can finish it later or list it for sale when ready."); router.refresh(); }
    } catch (reason) {
      const fields = (reason as { fields?: Record<string, string> }).fields;
      if (fields) showErrors(fields);
      const detail = reason instanceof Error ? reason.message : "The change could not be completed. Retry when you are ready.";
      setImageError(saved ? `${live ? "Item details" : "Draft"} saved. ${remaining ? `${remaining} photo${remaining === 1 ? "" : "s"} still need uploading. Save again to retry the remaining photos. ` : publish ? "The item was not listed for sale. " : ""}${detail}` : detail);
      if (saved) router.refresh();
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function removeImage(imageId: string) {
    if (!productId) return;
    setImageError("");
    await storeRequest("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageId }),
    });

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
    setImageError("");
    await storeRequest("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, removeLegacyPrimary: true }),
    });

    setPrimaryImageUrl(images[0]?.url ?? null);
  }
  async function reorderImages(imageIds: string[]) {
    if (!productId) return;
    setImageError("");
    await storeRequest("/api/listings/images", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageIds }),
    });

    setImages((current) => {
      const byId = new Map(current.map((image) => [image.id, image]));
      const next = imageIds.map((id, index) => ({
        ...byId.get(id)!,
        sortOrder: index,
      }));
      setPrimaryImageUrl(next[0]?.url ?? null);
      return next;
    });
  }
  return (
    <div className="store-editor-backdrop seller-full-editor" role="presentation">
      <section ref={dialog} tabIndex={-1} className="store-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <div className="panel-heading seller-editor-heading">
          <div>
            <p className="eyebrow">Inventory item</p>
            <h2 id="product-editor-title">{product ? "Edit listing" : "Create listing"}</h2>
          </div>
          <button type="button" className="dialog-close" aria-label="Close listing editor" disabled={busy || photoBusy} onClick={requestClose}>×</button>
        </div>
        <nav className="seller-editor-nav" aria-label="Listing sections"><a href="#listing-model">Model</a><a href="#listing-price">Price &amp; stock</a><a href="#listing-condition">Condition</a><a href="#listing-photos">Photos</a></nav>
        <form ref={formRef} className="admin-form" noValidate onSubmit={submit} onChange={changed}>
          <div className="seller-editor-scroll">
          <section id="listing-model" data-listing-field="catalogProductId" tabIndex={-1}><h3>Model</h3>
          <CatalogModelPicker initial={product} listingSaved={Boolean(productId)} disabled={busy} onModelChange={setCatalogModel} onReady={value => { setCatalogReady(value); changed(); }} />
          <ListingFieldError errors={fieldErrors} name="catalogProductId" /></section>
          <fieldset className="catalog-listing-fields" hidden={!catalogReady} disabled={!catalogReady || busy}>
          <div className="form-row">
            <label>Seller SKU<input name="sellerSku" {...listingFieldProps(fieldErrors, "sellerSku")} required maxLength={100} defaultValue={product?.sellerSku ?? ""} /><ListingFieldError errors={fieldErrors} name="sellerSku" /></label>
            <label>Listing title (optional)<input name="title" maxLength={200} defaultValue={product?.title ?? ""} /></label>
          </div>
          <label>Description<textarea name="description" rows={4} maxLength={4000} defaultValue={product?.description ?? ""} /></label>
          <section id="listing-price"><h3>Price &amp; stock</h3>
          <div className="form-row">
            <label>Full item price (USD)<input name="price" {...listingFieldProps(fieldErrors, "price")} inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} /><ListingFieldError errors={fieldErrors} name="price" /></label>
            <label>{availabilityType === "preorder" ? "Quantity available to preorder" : "Total stock (including reserved)"}<input name="inventoryQuantity" {...listingFieldProps(fieldErrors, "inventoryQuantity")} type="number" min={availabilityType === "preorder" ? 1 : product?.reservedQuantity ?? 0} max={1000000} required defaultValue={product?.preorder?.capacity ?? product?.inventoryQuantity ?? 1} /><ListingFieldError errors={fieldErrors} name="inventoryQuantity" /></label>
          </div>
          <p className="form-note">You pay {feePercent(marketplaceFeeBps)} commission on the item subtotal, plus payment processing on the full customer payment (including shipping and tax). Both are deducted from your proceeds. <Link href="/seller-terms#fees" target="_blank" rel="noopener noreferrer">Fee and payout terms</Link></p>
          <fieldset className="availability-fields">
            <legend>Availability</legend>
            <div className="form-row">
              <label>
                Listing type
                <select
                  name="availabilityType"
                  disabled={Boolean(productId)}
                  value={availabilityType}
                  onChange={(event) =>
                    setAvailabilityType(
                      event.target.value as "in_stock" | "preorder",
                    )
                  }
                >
                  <option value="in_stock">In stock · ships after purchase</option>
                  <option value="preorder">Preorder · 10% deposit</option>
                </select>{productId && <input type="hidden" name="availabilityType" value={availabilityType} />}
              </label>
              {availabilityType === "preorder" && <label>
                Expected ship date
                <input
                  name="releaseDate" {...listingFieldProps(fieldErrors, "releaseDate")}
                  type="date"
                  required={availabilityType === "preorder"}
                  disabled={availabilityType !== "preorder"}
                  defaultValue={product?.releaseDate ?? ""}
                /><ListingFieldError errors={fieldErrors} name="releaseDate" />
              </label>}
            </div>
            {availabilityType === "preorder" && <>
              <div className="form-row"><label>Close preorders on (optional)<input name="preorderCutoff" type="date" defaultValue={product?.preorder?.cutoff ?? ""}/></label><label>Maximum per buyer<input name="preorderBuyerLimit" type="number" min="1" max="10" defaultValue={product?.preorder?.buyerLimit ?? 10}/></label></div>
              <div className="preorder-deposit-preview"><strong>10% deposit{Number(price) > 0 ? ` · ${formatMoney(Math.round(Number(price) * 10), "usd")} per item` : ""}</strong><p>Buyers pay the deposit now and the remaining balance when you mark stock ready. Shipping and applicable tax are shown before payment.</p><p>New deposits are refundable before shipment, including buyer cancellation or a missed balance deadline. Existing reservations keep their accepted terms and remain subject to applicable consumer rights.</p></div>
            </>}
          </fieldset>
          <details><summary>Package override (optional)</summary><p className="form-note">Leave all four blank to use the store default package for calculated checkout rates.</p><div className="parcel-grid"><label>Length (in)<input name="packageLength" {...listingFieldProps(fieldErrors, "packageLength")} inputMode="decimal" defaultValue={product?.packageLength ?? ""} /><ListingFieldError errors={fieldErrors} name="packageLength" /></label><label>Width (in)<input name="packageWidth" {...listingFieldProps(fieldErrors, "packageWidth")} inputMode="decimal" defaultValue={product?.packageWidth ?? ""} /><ListingFieldError errors={fieldErrors} name="packageWidth" /></label><label>Height (in)<input name="packageHeight" {...listingFieldProps(fieldErrors, "packageHeight")} inputMode="decimal" defaultValue={product?.packageHeight ?? ""} /><ListingFieldError errors={fieldErrors} name="packageHeight" /></label><label>Weight (lb)<input name="packageWeight" {...listingFieldProps(fieldErrors, "packageWeight")} inputMode="decimal" defaultValue={product?.packageWeight ?? ""} /><ListingFieldError errors={fieldErrors} name="packageWeight" /></label></div></details>
          </section><section id="listing-condition"><h3>Condition</h3>
          <CollectibleListingFields product={product} includeIdentity={false} includeLegacyNotes errors={fieldErrors}/>
          </section><section id="listing-photos" data-listing-field="images" tabIndex={-1}><h3>Photos</h3><ListingFieldError errors={fieldErrors} name="images" />
          <ProductImageFields
            productId={productId || undefined}
            images={images}
            primaryImageUrl={primaryImageUrl}
            files={files}
            disabled={busy}
            onFilesChange={next => { setFiles(next); changed(); }}
            onImagesChange={setImages}
            onLabelsChange={() => { setLabelRevision(value => value + 1); if (files.length) changed(); }}
            onBusyChange={setPhotoBusy}
            onRemove={productId ? removeImage : undefined}
            onRemoveLegacy={productId ? removeLegacyImage : undefined}
            onReorder={productId ? reorderImages : undefined}
          />
          {availabilityType !== "preorder" ? <RequiredPhotoChecklist product={product} images={evidenceImages}/> : <p className="form-note">Upload a product image or preview. Describe any prototype images or expected production differences in the listing.</p>}
          </section>
          <details><summary>Search keywords (optional)</summary><label>Search keywords<input name="keywords" maxLength={1000} defaultValue={product?.keywords ?? ""} /></label></details>
          {product && product.reservedQuantity > 0 && <p className="form-note">Inventory cannot be reduced below {product.reservedQuantity} reserved units.</p>}
          <section className="seller-publish-checklist"><h3>Before publishing</h3>
            <div data-listing-field="storeSetup" tabIndex={-1}><StoreSetupNotice setup={setup} storeStatus={store.status} /></div>
            {Object.keys(issues).length ? <ul>{Object.entries(issues).map(([name, message]) => <li key={name}><button type="button" className="text-action" onClick={() => { if (formRef.current) focusListingError(formRef.current, issues, name); }}>{listingFieldLabel(name)}: {message}</button></li>)}</ul> : <p>Listing details complete. {setup.readyToPublish ? "Ready to list for sale." : "Finish store setup to list for sale."}</p>}
          </section>
          </fieldset></div>
          <footer className="seller-editor-footer">
            {savedNotice && <p role="status" className="admin-message">{savedNotice}</p>}
            {imageError && <div className="form-error" role="alert"><p>{imageError}</p>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).map(([name, message]) => <li key={name}><button type="button" onClick={() => { if (formRef.current) focusListingError(formRef.current, fieldErrors, name); }}>{listingFieldLabel(name)}: {message}</button></li>)}</ul>}</div>}
            <div className="seller-editor-actions">
            <button type="button" className="button seller-editor-preview" disabled={busy || photoBusy || !catalogReady} onClick={openPreview}>Preview</button>
            <button className={`button ${product && ["active", "sold_out"].includes(product.status) ? "dark" : "outline"}`} value="save" disabled={busy || photoBusy || !catalogReady}>{busy ? "Saving..." : product && ["active", "sold_out"].includes(product.status) ? "Save changes" : "Save draft"}</button>
            {(!product || !["active", "sold_out"].includes(product.status)) && <button className="button dark" value="publish" disabled={busy || photoBusy || !catalogReady}>{busy ? "Saving..." : "List for sale"}</button>}
            </div>
            {confirmClose && <div role="alert" className="unsaved-listing"><p>You have unsaved changes. Save your draft to keep them.</p><button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard unsaved changes</button></div>}
          </footer>
      </form>
      </section>
      {preview && <ListingBuyerPreview product={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
