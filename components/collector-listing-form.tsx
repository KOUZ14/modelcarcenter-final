"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import { POLICY_VERSION } from "@/lib/legal";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";

type Initial = {
  product: Record<string, unknown>;
  images: Array<{ id: string; url: string; alt: string }>;
} | null;
type Seller = Record<string, unknown> | null;

export function CollectorListingForm({
  initial,
  seller,
  displayName,
  prefill,
  marketplaceFeeBps,
}: {
  initial: Initial;
  seller: Seller;
  displayName: string;
  prefill: Record<string, string>;
  marketplaceFeeBps: number;
}) {
  const product = initial?.product ?? {};
  const [productId, setProductId] = useState(String(product.id ?? ""));
  const [images, setImages] = useState(initial?.images ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldSubmit = submitter?.value === "submit";
    if (shouldSubmit && !acceptedSellerTerms) {
      setError("Accept the current Seller Terms before submitting for review.");
      setBusy(false);
      return;
    }
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", productId: productId || undefined, ...payload }) });
      const body = await response.json() as { productId?: string; error?: string };
      if (!response.ok || !body.productId) throw new Error(body.error || "The draft could not be saved.");
      setProductId(body.productId);
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
          },
        });
      }
      history.replaceState(null, "", `/sell/model?id=${encodeURIComponent(body.productId)}`);
      if (shouldSubmit) {
        const review = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", productId: body.productId, sellerTermsVersion: POLICY_VERSION }) });
        const reviewBody = await review.json() as { error?: string };
        if (!review.ok) throw new Error(reviewBody.error || "The listing could not be submitted.");
        setMessage("Listing submitted for marketplace review.");
      } else setMessage(nextImages.length ? "Draft and photos saved." : "Draft saved. Add at least one photo before submitting.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The listing could not be saved.");
    } finally { setBusy(false); }
  }

  async function removeImage(imageId: string) {
    if (!productId) return;
    setError("");
    const response = await fetch("/api/listings/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, imageId }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || "The photo could not be removed."); return; }
    setImages((current) => current.filter((image) => image.id !== imageId));
  }

  async function startOnboarding() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stripe_onboarding", sellerTermsVersion: POLICY_VERSION }) });
      const body = await response.json() as { onboardingUrl?: string; error?: string };
      if (!response.ok || !body.onboardingUrl) throw new Error(body.error || "Stripe onboarding could not be started.");
      window.location.assign(body.onboardingUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Stripe onboarding could not be started."); setBusy(false); }
  }

  const stripeReady = Boolean(seller?.stripeChargesEnabled && seller?.stripePayoutsEnabled && seller?.status === "active");
  return <div className="listing-shell"><div className="page-title"><p className="eyebrow">Sell from your collection</p><h1>{productId ? "Edit your listing" : "Sell a Model"}</h1><p>Save a draft first. Stripe payout onboarding is only required when you’re ready to submit for review.</p><p><b>{marketplaceFeeBps / 100}% Model Car Center marketplace fee.</b> Payment processing is charged separately. There are no listing fees or monthly fees; the marketplace fee applies only when your model sells.</p></div><form className="listing-form" onSubmit={save} noValidate>
    <section><h2>Model details</h2><label>Product title<input name="title" required maxLength={200} defaultValue={String(product.title ?? "")}/></label><div className="form-row"><label>Vehicle make<input name="vehicleMake" required maxLength={100} defaultValue={String(product.vehicleMake ?? prefill.make ?? "")}/></label><label>Vehicle model<input name="vehicleModel" required maxLength={120} defaultValue={String(product.vehicleModel ?? prefill.model ?? "")}/></label></div><div className="form-row"><label>Vehicle year<input name="vehicleYear" maxLength={20} defaultValue={String(product.vehicleYear ?? "")}/></label><label>Scale<select name="scale" required defaultValue={String(product.scale ?? prefill.scale ?? "1:18")}>{["1:18", "1:24", "1:43", "1:64", "1:87", "Other"].map((scale) => <option key={scale}>{scale}</option>)}</select></label></div><div className="form-row"><label>Model manufacturer<input name="modelManufacturer" required maxLength={100} defaultValue={String(product.modelManufacturer ?? prefill.manufacturer ?? "")}/></label><label>Color<input name="color" maxLength={80} defaultValue={String(product.color ?? "")}/></label></div><label>Description<textarea name="description" required maxLength={4000} rows={6} defaultValue={String(product.description ?? "")}/></label></section>
    <section><h2>Collector-grade details</h2><CollectibleListingFields product={product}/></section>
    <section><h2>Price and availability</h2><div className="form-row"><label>Price (USD)<input name="price" inputMode="decimal" required defaultValue={product.priceCents == null ? "" : (Number(product.priceCents) / 100).toFixed(2)}/></label><label>Quantity<input name="quantity" type="number" min={1} max={100} required defaultValue={String(product.inventoryQuantity ?? 1)}/></label></div></section>
    <section><h2>Packaged shipment</h2><p>Enter the final box size and packed weight. Model Car Center uses these values to show the buyer 2–3 carrier services.</p><div className="parcel-grid"><label>Length (in)<input name="packageLength" inputMode="decimal" required defaultValue={String(product.packageLength ?? "12")}/></label><label>Width (in)<input name="packageWidth" inputMode="decimal" required defaultValue={String(product.packageWidth ?? "9")}/></label><label>Height (in)<input name="packageHeight" inputMode="decimal" required defaultValue={String(product.packageHeight ?? "6")}/></label><label>Weight (lb)<input name="packageWeight" inputMode="decimal" required defaultValue={String(product.packageWeight ?? "2")}/></label></div></section>
    <section><h2>Seller and ship-from details</h2><p>Your protected address is used only to calculate carrier rates and create labels.</p><label>Seller display name<input name="sellerDisplayName" required maxLength={120} defaultValue={String(seller?.storeName ?? displayName)}/></label><label>Street address<input name="shippingOriginStreet1" required maxLength={200} defaultValue={String(seller?.shippingOriginStreet1 ?? "")}/></label><label>Apartment, suite, or unit<input name="shippingOriginStreet2" maxLength={200} defaultValue={String(seller?.shippingOriginStreet2 ?? "")}/></label><div className="form-row"><label>City<input name="shippingOriginCity" required maxLength={120} defaultValue={String(seller?.shippingOriginCity ?? "")}/></label><label>State or region<input name="shippingOriginRegion" required maxLength={80} defaultValue={String(seller?.shippingOriginRegion ?? "")}/></label></div><div className="form-row"><label>Postal code<input name="shippingOriginPostalCode" required maxLength={20} defaultValue={String(seller?.shippingOriginPostalCode ?? "")}/></label><label>Country code<input name="shippingOriginCountry" required maxLength={2} defaultValue={String(seller?.shippingOriginCountry ?? "US")}/></label></div><label>Carrier contact phone<input name="shippingOriginPhone" type="tel" required maxLength={50} defaultValue={String(seller?.shippingOriginPhone ?? "")}/></label><label>Short seller description<textarea name="sellerDescription" maxLength={1000} defaultValue={String(seller?.description ?? "")}/></label></section>
    <section><h2>Photos</h2><p>Upload 4–8 original JPEG, PNG, or WebP photos, 10 MB each. Do not reuse another seller’s photos.</p>{images.length > 0 && <div className="listing-images">{images.map((image) => <div key={image.id}><Image src={image.url} alt={image.alt} width={220} height={180} unoptimized/><button type="button" onClick={() => void removeImage(image.id)}>Remove</button></div>)}</div>}<label className="file-input">Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles([...event.target.files ?? []].slice(0, 8 - images.length))}/></label>{files.length > 0 && <p>{files.length} photo{files.length === 1 ? "" : "s"} ready to upload with this draft.</p>}<RequiredPhotoChecklist product={product}/></section>
    <section className="listing-submit"><div><h2>Payouts and review</h2><p>{stripeReady ? "Stripe payouts are ready. Submitted listings are reviewed before going live." : "You can keep drafting now. Complete secure Stripe-hosted payout onboarding before submission."}</p><label className="consent-check"><input type="checkbox" checked={acceptedSellerTerms} onChange={(event) => setAcceptedSellerTerms(event.target.checked)}/><span>I agree to the current <Link href="/seller-terms">Seller Terms</Link>, including the marketplace fee, fulfillment rules, and return obligations.</span></label>{!stripeReady && <button className="button outline small" type="button" disabled={busy || !acceptedSellerTerms} onClick={() => void startOnboarding()}>Complete Stripe onboarding</button>}</div>{message && <p className="admin-message" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="row-actions"><button className="button outline" type="submit" value="save" disabled={busy}>{busy ? "Saving…" : "Save draft"}</button><button className="button dark" type="submit" value="submit" disabled={busy || !stripeReady || !acceptedSellerTerms}>{busy ? "Saving…" : "Submit for review"}</button></div></section>
  </form><p><Link className="text-link" href="/account?view=listings">Back to My Listings</Link></p></div>;
}
