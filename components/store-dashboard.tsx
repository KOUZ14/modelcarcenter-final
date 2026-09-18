"use client";

import { SellerFeeDisclosure } from "./seller-fee-disclosure";
import { SellerOrderAmounts } from "./seller-order-amounts";

import Link from "next/link";
import { CatalogModelPicker } from "./catalog-model-picker";
import { useRouter } from "next/navigation";
import { HubOverview, HubDemand, HubOpportunities, HubMarketing, HubAnalytics } from "./seller-hub-panels";
import { hubViews, inventoryViews, orderViews, matchesInventoryView, matchesOrderView, type HubView, type HubNavigate, type SellerHubMetrics } from "@/lib/seller-hub";
import type { SellerHubDemand } from "@/lib/seller-hub-data";
import { BrandLogo } from "@/components/brand-logo";
import { useDialogFocus } from "./use-dialog-focus";
import { FormEvent, useMemo, useRef, useState } from "react";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { SHIP_FROM_FIELD_NAMES, shipFromAddressValues } from "@/lib/address";
import { formatMoney, formatUtcDate, formatUtcDateTime } from "@/lib/format";
import {
  EditableProductImage,
  ProductImageFields,
} from "@/components/product-image-fields";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";
import {
  ShipmentTimeline,
  type ShipmentTimelineData,
} from "@/components/shipment-timeline";
import { POLICY_VERSION } from "@/lib/legal";

type Store = {
  id: string;
  slug: string;
  storeName: string;
  contactName: string;
  contactEmail: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  description: string;
  status: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  defaultShippingCents: number;
  shippingMode: "calculated" | "flat" | "free";
  handlingTimeBusinessDays: number;
  shippingOriginCountry: string;
  shippingOriginRegion: string | null;
  shippingOriginStreet1: string | null;
  shippingOriginStreet2: string | null;
  shippingOriginCity: string | null;
  shippingOriginPostalCode: string | null;
  shippingOriginPhone: string | null;
  defaultPackageLength: string;
  defaultPackageWidth: string;
  defaultPackageHeight: string;
  defaultPackageWeight: string;
  shippingPolicySummary: string;
  returnPolicySummary: string;
  sellerTermsVersion: string | null;
  sellerTermsAcceptedAt: string | null;
};

type Product = {
  catalogProductId?: string | null;
  conditionNotes?: string;
  id: string;
  sellerSku: string;
  title: string;
  description: string;
  scale: string;
  modelManufacturer: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string | null;
  color: string | null;
  condition: string;
  modelCondition: string;
  packagingCondition: string;
  originalBoxStatus: string;
  missingParts: string;
  defects: string;
  restorationCustomization: string;
  material: string;
  productNumber: string | null;
  editionSerial: string | null;
  coaStatus: string;
  accessories: string;
  provenance: string;
  photoFrontChecked: boolean;
  photoRearChecked: boolean;
  photoSidesChecked: boolean;
  photoBaseChecked: boolean;
  photoPackagingChecked: boolean;
  photoIssuesChecked: boolean;
  priceCents: number;
  packageLength: string | null;
  packageWidth: string | null;
  packageHeight: string | null;
  packageWeight: string | null;
  currency: string;
  inventoryQuantity: number;
  reservedQuantity: number;
  availabilityType: "in_stock" | "preorder";
  releaseDate: string | null;
  status: string;
  primaryImageUrl: string | null;
  images: EditableProductImage[];
  keywords: string;
  updatedAt: string;
  createdAt: string;
};

type OrderItem = {
  id: string;
  productTitleSnapshot: string;
  sellerSkuSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  availabilityTypeSnapshot: "in_stock" | "preorder";
  releaseDateSnapshot: string | null;
};

type StoreOrder = {
  id: string;
  orderNumber: string;
  buyerEmail: string;
  buyerName: string;
  shippingAddress: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  shippingMode: "calculated" | "flat" | "free";
  selectedShippingCarrier: string | null;
  selectedShippingService: string | null;
  selectedShippingServiceToken: string | null;
  selectedShippingEstimatedDays: number | null;
  taxCents: number;
  marketplaceFeeBps: number;
  platformFeeCents: number;
  processingFeePayer: "platform" | "seller";
  paymentProcessingFeeCents: number | null;
  sellerProceedsCents: number | null;
  paymentFlow: "destination" | "separate";
  sellerTransferStatus: string;
  sellerTransferAmountCents: number;
  sellerTransferReversedCents: number;
  totalCents: number;
  refundedAmountCents: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shipByAt: string | null;
  deliveredAt: string | null;
  payoutEligibleAt: string | null;
  sellerTransferredAt: string | null;
  shipment: Shipment | null;
  items: OrderItem[];
};

type Shipment = ShipmentTimelineData & {
  rateAmountCents: number;
};

type Analytics = {
  paidOrders: number;
  unfulfilledOrders: number;
  unitsSold: number;
  grossSalesCents: number;
  platformFeesCents: number;
  netSalesCents: number;
  averageOrderCents: number;
  activeListings: number;
  lowStock: number;
  inventoryValueCents: number;
  monthlySales: Array<{
    key: string;
    label: string;
    orders: number;
    grossCents: number;
  }>;
  topProducts: Array<{
    title: string;
    units: number;
    revenueCents: number;
  }>;
};

export type StoreData = {
  store: Store;
  fee: {
    marketplaceFeeBps: number;
    standardMarketplaceFeeBps: number;
    rateKind: "collector" | "professional" | "founding_professional";
    foundingPromotionActive: boolean;
  };
  inventory: Product[];
  orders: StoreOrder[];
  analytics: Analytics;
  hub: SellerHubMetrics;
  demand: SellerHubDemand;
  shipping: {
    configured: boolean;
    insuranceThresholdCents: number;
    signatureThresholdCents: number;
  };
};

const tabs = hubViews;
type Tab = HubView;

export function StoreDashboard({
  data,
  initialView,
  initialProductId,
  initialFilter,
  email,
}: {
  data: StoreData;
  initialView: string;
  initialProductId?: string;
  initialFilter?: string;
  email: string;
}) {
  const firstView = tabs.includes(initialView as Tab)
    ? (initialView as Tab)
    : initialProductId
      ? "inventory"
      : "overview";
  const view = firstView;
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const suspended = data.store.status === "suspended";

  async function action(
    payload: Record<string, unknown>,
    options: { reload?: boolean; message?: string } = {},
  ) {
    setMessage("");
    setError("");
    const response = await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as Record<string, unknown> & {
      error?: string;
      fields?: Record<string, string>;
    };
    if (!response.ok) {
      const nextError = body.error || "The store change could not be saved.";
      setError(nextError);
      throw Object.assign(new Error(nextError), { fields: body.fields });
    }
    setMessage(options.message ?? "Saved.");
    if (options.reload) window.location.reload();
    return body;
  }

  const selectView: HubNavigate = (next, filter, edit) => {
    const params = new URLSearchParams({ view: next });
    if (filter) params.set("filter", filter);
    if (edit) params.set("edit", edit);
    router.push(`/store?${params.toString()}`);
  };

  return (
    <div className="store-layout seller-hub">
      <aside className="store-sidebar">
        <Link className="store-brand" href="/">
          <BrandLogo priority/>
          <b>Seller Hub</b>
        </Link>
        <div className="store-identity">
          <p className="eyebrow">Professional seller</p>
          <h1>{data.store.storeName}</h1>
          <span>{email}</span>
          <span className={`status ${data.store.status}`}>
            {data.store.status}
          </span>
        </div>
        <nav aria-label="Seller Hub sections">
          <Link href="/store/preorders">Incoming preorders</Link>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={view === tab ? "active" : ""}
              aria-current={view === tab ? "page" : undefined}
              onClick={() => selectView(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
              {tab === "orders" && data.analytics.unfulfilledOrders > 0 && (
                <span>{data.analytics.unfulfilledOrders}</span>
              )}
            </button>
          ))}
          <Link className="store-messages-link" href="/messages">
            Buyer messages
          </Link>
        </nav>
        <div className="store-sidebar-links">
          <Link href={`/sellers/${data.store.slug}`}>View storefront</Link>
          <Link href="/account">My Garage</Link>
          <Link href="/marketplace">Back to marketplace</Link>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="store-main">
        {suspended && (
          <div className="store-alert" role="alert">
            <b>New sales are suspended.</b>
            <p>
              Inventory changes are paused. Continue fulfilling existing paid
              orders and handling refunds. Contact support about store eligibility.
            </p>
          </div>
        )}
        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {view === "overview" && (
          <HubOverview data={data} navigate={selectView} />
        )}
        {view === "demand" && <HubDemand data={data} navigate={selectView} filter={initialFilter} />}
        {view === "opportunities" && <HubOpportunities data={data} navigate={selectView} />}
        {view === "marketing" && <HubMarketing data={data} navigate={selectView} filter={initialFilter} />}
        {view === "inventory" && (
          <Inventory
            key={`inventory-${initialFilter}-${initialProductId}`}
            marketplaceFeeBps={data.fee.marketplaceFeeBps}
            rows={data.inventory}
            initialProductId={initialProductId}
            queue={inventoryViews.some(([value]) => value === initialFilter) ? initialFilter! : "all"}
            slowIds={data.hub.slowIds}
            navigate={selectView}
            disabled={suspended}
            action={action}
          />
        )}
        {view === "orders" && (
          <Orders
            key={`orders-${initialFilter}`}
            initialFilter={initialFilter}
            returnOrderIds={data.demand.returnOrderIds}
            navigate={selectView}
            rows={data.orders}
            store={data.store}
            shipping={data.shipping}
            disabled={false}
            action={action}
          />
        )}
        {view === "analytics" && <HubAnalytics data={data} navigate={selectView}><AnalyticsView analytics={data.analytics} /></HubAnalytics>}
        {view === "settings" && (
          <StoreSettings
            store={data.store}
            fee={data.fee}
            disabled={suspended}
            action={action}
          />
        )}
      </main>
    </div>
  );
}

function Inventory({
  marketplaceFeeBps,
  rows,
  initialProductId,
  queue,
  slowIds,
  navigate,
  disabled,
  action,
}: {
  marketplaceFeeBps: number;
  rows: Product[];
  initialProductId?: string;
  queue: string;
  slowIds: string[];
  navigate: HubNavigate;
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const initial = rows.find((row) => row.id === initialProductId) ?? null;
  const [editing, setEditing] = useState<Product | "new" | null>(disabled ? null : initialProductId === "new" ? "new" : initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesSearch = `${row.title} ${row.sellerSku} ${row.vehicleMake} ${row.vehicleModel}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesSearch && (filter === "all" || row.status === filter) && matchesInventoryView(row, queue, slowIds);
      }),
    [filter, rows, search, queue, slowIds],
  );
  async function setStatus(product: Product, status: "active" | "inactive") {
    await action(
      { action: "product_status", productId: product.id, status },
      { reload: true, message: status === "active" ? "Item published." : "Item unpublished." },
    );
  }
  async function archive(product: Product) {
    if (!window.confirm(`Archive ${product.title}? It will no longer appear in the marketplace.`)) return;
    await action(
      { action: "archive_product", productId: product.id },
      { reload: true, message: "Item archived." },
    );
  }
  return (
    <div className="store-stack">
      <header className="store-page-heading">
        <div>
          <p className="eyebrow">Catalog operations</p>
          <h2>Inventory</h2>
          <p>Create, update, publish, and archive your store’s products.</p>
        </div>
        <button
          className="button dark small"
          disabled={disabled}
          onClick={() => setEditing("new")}
        >
          Add product
        </button>
      </header>
      <nav className="hub-filters" aria-label="Inventory views">
        {inventoryViews.map(([value, label]) => <button key={value} aria-pressed={queue === value} onClick={() => navigate("inventory", value)}>{label}<span>{rows.filter((row) => matchesInventoryView(row, value, slowIds)).length}</span></button>)}
      </nav>
      {queue === "slow" && <p className="hub-note">Active, in-stock listings at least 90 days old with no paid sale in the last 90 days.</p>}
      {queue === "low" && <p className="hub-note">Active, in-stock listings with 1–2 available units, after reservations.</p>}
      <div className="store-inventory-tools">
        <input
          aria-label="Search inventory"
          placeholder="Search title, SKU, make, or model"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter inventory status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
          <option value="sold_out">Sold out</option>
        </select>
      </div>
      <section className="store-panel store-inventory-panel">
        <div className="store-inventory-meta">
          <b>{visible.length} products</b>
          <span>
            {visible.reduce(
              (sum, row) =>
                sum + Math.max(0, row.inventoryQuantity - row.reservedQuantity),
              0,
            )}{" "}
            available units
          </span>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Inventory</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id}>
                  <td>
                    <b>{product.title}</b>
                    <small>
                      {product.scale} · {product.modelManufacturer}
                    </small>
                    {product.availabilityType === "preorder" && product.releaseDate && (
                      <small>Preorder · releases {formatUtcDate(product.releaseDate)}</small>
                    )}
                  </td>
                  <td>{product.sellerSku}</td>
                  <td>{formatMoney(product.priceCents, product.currency)}</td>
                  <td>
                    {product.inventoryQuantity - product.reservedQuantity} available
                    {product.reservedQuantity > 0 && (
                      <small>{product.reservedQuantity} reserved</small>
                    )}
                  </td>
                  <td>
                    <span className={`status ${product.status}`}>
                      {product.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button disabled={disabled} onClick={() => setEditing(product)}>
                        Edit
                      </button>
                      {!disabled && product.status === "active" && product.availabilityType === "in_stock" && product.inventoryQuantity > product.reservedQuantity && <Link href={`/store?view=marketing&filter=promoted&promotion_product=${encodeURIComponent(product.id)}`}>Promote</Link>}
                      {product.status === "active" ? (
                        <button disabled={disabled} onClick={() => void setStatus(product, "inactive")}>
                          Unpublish
                        </button>
                      ) : (
                        <button disabled={disabled} onClick={() => void setStatus(product, "active")}>
                          Publish
                        </button>
                      )}
                      <button disabled={disabled} onClick={() => void archive(product)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="store-empty">No inventory matches those filters.</p>}
      </section>
      <SellerFeeDisclosure marketplaceFeeBps={marketplaceFeeBps} />
      <InventoryImporter disabled={disabled} action={action} />
      {editing && (
        <ProductEditor
          marketplaceFeeBps={marketplaceFeeBps}
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          action={action}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductEditor({
  marketplaceFeeBps,
  product,
  action,
  onClose,
}: {
  product: Product | null;
  marketplaceFeeBps: number;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
  onClose(): void;
}) {
  const dialog = useDialogFocus(onClose);
  const [catalogReady, setCatalogReady] = useState(Boolean(product?.catalogProductId));
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState(product?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(product?.images ?? []);
  const [primaryImageUrl, setPrimaryImageUrl] = useState(
    product?.primaryImageUrl ?? null,
  );
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  const [availabilityType, setAvailabilityType] = useState<
    "in_stock" | "preorder"
  >(product?.availabilityType ?? "in_stock");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogReady) { setImageError("Choose a catalog model first."); return; }
    setBusy(true);
    setImageError("");
    try {
      const form = new FormData(event.currentTarget);
      form.delete("images");
      const result = await action(
        {
          action: "save_product",
          id: productId || undefined,
          ...Object.fromEntries(form),
        },
        { message: product ? "Inventory updated." : "Draft product created." },
      );
      const savedProductId = String(result.productId ?? "");
      setProductId(savedProductId);
      if (files.length && savedProductId) {
        let nextImages = images;
        await uploadProductPhotoFiles({
          endpoint: "/api/listings/images",
          productId: savedProductId,
          files,
          makePrimary: !primaryUploadFinished,
          onUploaded(uploaded, processedCount) {
            nextImages = [...nextImages, ...uploaded];
            setImages(nextImages);
            setFiles(files.slice(processedCount));
            if (processedCount === 1) {
              setPrimaryUploadFinished(true);
              setPrimaryImageUrl(uploaded[0]?.url ?? null);
            }
          },
        });
      }
      window.location.reload();
    } catch (reason) {
      setImageError(
        reason instanceof Error ? reason.message : "The product could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeImage(imageId: string) {
    if (!productId) return;
    setImageError("");
    const response = await fetch("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageId }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      const message = body.error || "The photo could not be removed.";
      setImageError(message);
      throw new Error(message);
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
    setImageError("");
    const response = await fetch("/api/listings/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, removeLegacyPrimary: true }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      const message = body.error || "The photo could not be removed.";
      setImageError(message);
      throw new Error(message);
    }
    setPrimaryImageUrl(images[0]?.url ?? null);
  }
  async function reorderImages(imageIds: string[]) {
    if (!productId) return;
    setImageError("");
    const response = await fetch("/api/listings/images", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageIds }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      const message = body.error || "The photo order could not be saved.";
      setImageError(message);
      throw new Error(message);
    }
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
    <div className="store-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialog} tabIndex={-1} className="store-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inventory item</p>
            <h2 id="product-editor-title">{product ? "Edit product" : "Add product"}</h2>
          </div>
          <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form className="admin-form" onSubmit={submit}>
          <CatalogModelPicker initial={product} listingSaved={Boolean(productId)} disabled={busy} onReady={setCatalogReady} />
          <fieldset className="catalog-listing-fields" hidden={!catalogReady} disabled={!catalogReady}>
          <div className="form-row">
            <label>Seller SKU<input name="sellerSku" required maxLength={100} defaultValue={product?.sellerSku ?? ""} /></label>
            <label>Listing title (optional)<input name="title" maxLength={200} defaultValue={product?.title ?? ""} /></label>
          </div>
          <label>Condition notes<textarea name="conditionNotes" maxLength={2000} defaultValue={product?.conditionNotes ?? ""} /></label>
          <label>Description<textarea name="description" rows={4} maxLength={4000} defaultValue={product?.description ?? ""} /></label>
          <div className="form-row">
            <label>Price (USD)<input name="price" inputMode="decimal" required defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""} /></label>
            <label>Inventory quantity<input name="inventoryQuantity" type="number" min={product?.reservedQuantity ?? 0} max={1000000} required defaultValue={product?.inventoryQuantity ?? 1} /></label>
          </div>
          <p className="form-note">You pay {feePercent(marketplaceFeeBps)} commission on the item subtotal, plus actual payment processing on the full customer payment (including shipping and tax). Both are deducted from your proceeds. <Link href="/seller-terms#fees">Fee and payout terms</Link></p>
          <fieldset className="availability-fields">
            <legend>Availability</legend>
            <div className="form-row">
              <label>
                Sales workflow
                <select
                  name="availabilityType"
                  value={availabilityType}
                  onChange={(event) =>
                    setAvailabilityType(
                      event.target.value as "in_stock" | "preorder",
                    )
                  }
                >
                  <option value="in_stock">In stock · ships after purchase</option>

                </select>
              </label>
              <label>
                Expected release date
                <input
                  name="releaseDate"
                  type="date"
                  required={availabilityType === "preorder"}
                  disabled={availabilityType !== "preorder"}
                  defaultValue={product?.releaseDate ?? ""}
                />
              </label>
            </div>
            <p className="form-note">
              Create unpaid preorder offers in Incoming preorders. This inventory form is for stock you physically possess.
            </p>
          </fieldset>
          <fieldset><legend>Package override (optional)</legend><p className="form-note">Leave all four blank to use the store default package for calculated checkout rates.</p><div className="parcel-grid"><label>Length (in)<input name="packageLength" inputMode="decimal" defaultValue={product?.packageLength ?? ""} /></label><label>Width (in)<input name="packageWidth" inputMode="decimal" defaultValue={product?.packageWidth ?? ""} /></label><label>Height (in)<input name="packageHeight" inputMode="decimal" defaultValue={product?.packageHeight ?? ""} /></label><label>Weight (lb)<input name="packageWeight" inputMode="decimal" defaultValue={product?.packageWeight ?? ""} /></label></div></fieldset>
          <CollectibleListingFields product={product} includeIdentity={false}/>
          <ProductImageFields
            images={images}
            primaryImageUrl={primaryImageUrl}
            files={files}
            disabled={busy}
            onFilesChange={setFiles}
            onRemove={productId ? removeImage : undefined}
            onRemoveLegacy={productId ? removeLegacyImage : undefined}
            onReorder={productId ? reorderImages : undefined}
          />
          <RequiredPhotoChecklist product={product}/>
          <label>Search keywords<input name="keywords" maxLength={1000} defaultValue={product?.keywords ?? ""} /></label>
          {imageError && <p className="form-error" role="alert">{imageError}</p>}
          {product && product.reservedQuantity > 0 && <p className="form-note">Inventory cannot be reduced below {product.reservedQuantity} reserved units.</p>}
          <div className="row-actions">
            <button className="button dark small" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Create draft"}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
            </fieldset>
      </form>
      </section>
    </div>
  );
}

function InventoryImporter({
  disabled,
  action,
}: {
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{
    validCount: number;
    errors: Array<{ row: number; errors: string[] }>;
  } | null>(null);
  async function read(file?: File) {
    setCsv(file ? await file.text() : "");
    setPreview(null);
  }
  async function validate() {
    const response = await action({ action: "preview_import", csv });
    setPreview(response.preview as typeof preview);
  }
  async function commit() {
    await action(
      { action: "commit_import", csv },
      { reload: true, message: "Inventory import completed." },
    );
  }
  return (
    <details className="store-panel store-importer">
      <summary>Bulk import inventory from CSV</summary>
      <p>
        Imports create drafts and update matching SKUs. Validate every row before
        committing changes.
      </p>
      <div className="store-import-controls">
        <a className="button outline small" href="/api/store/inventory-template">Download template</a>
        <label className="button outline small">Choose CSV<input type="file" accept=".csv,text/csv" disabled={disabled} onChange={(event) => void read(event.target.files?.[0])} /></label>
        <button className="button dark small" disabled={disabled || !csv} onClick={() => void validate()}>Validate file</button>
      </div>
      {csv && <p>{Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1)} rows loaded.</p>}
      {preview && (
        <div className="import-preview">
          <p><b>{preview.validCount} valid rows</b> · {preview.errors.length} rows with errors</p>
          {preview.errors.slice(0, 20).map((error) => <p className="form-error" key={error.row}>Row {error.row}: {error.errors.join("; ")}</p>)}
          <button className="button dark small" disabled={disabled || preview.errors.length > 0 || preview.validCount < 1} onClick={() => void commit()}>Commit import</button>
        </div>
      )}
    </details>
  );
}

function Orders({
  rows,
  initialFilter,
  returnOrderIds,
  navigate,
  store,
  shipping,
  disabled,
  action,
}: {
  rows: StoreOrder[];
  initialFilter?: string;
  returnOrderIds: string[];
  navigate: HubNavigate;
  store: Store;
  shipping: StoreData["shipping"];
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const filter = ["open", "all", "shipped", "returns", "refunded", "cancelled"].includes(initialFilter ?? "") ? initialFilter! : "open";
  const urgentCount = rows.filter((order) =>
    ["overdue", "due_today", "due_soon"].includes(
      orderHandlingReminder(order).level,
    ),
  ).length;
  const visible = rows.filter((order) => matchesOrderView(order, filter, returnOrderIds));
  return (
    <div className="store-stack">
      <header className="store-page-heading">
        <div><p className="eyebrow">Fulfillment</p><h2>Orders</h2><p>Compare protected carrier rates, print labels, and follow tracking events.</p>{urgentCount > 0 && <p className="handling-summary"><b>{urgentCount} handling reminder{urgentCount === 1 ? "" : "s"}</b> need attention.</p>}</div>
        <select aria-label="Filter orders" value={filter} onChange={(event) => navigate("orders", event.target.value)}>
          <option value="open">Awaiting shipment</option><option value="all">All orders</option><option value="shipped">Shipped</option><option value="returns">Returns</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option>
        </select>
      </header>
      <nav className="hub-filters" aria-label="Order queues">{orderViews.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => navigate("orders", value)}>{label}<span>{rows.filter((row) => matchesOrderView(row, value, returnOrderIds)).length}</span></button>)}</nav>
      {filter === "returns" && <div className="hub-callout"><p>Orders with a return-and-refund request. Review each case and respond in the Resolution Center.</p><Link className="button outline small" href="/resolution">Manage returns</Link></div>}
      <div className="store-orders">
        {visible.map((order) => (
          <article className="store-order" key={order.id}>
            <div className="store-order-header">
              <div><p className="eyebrow">{date(order.createdAt)}</p><h3>{order.orderNumber}</h3></div>
              <div><HandlingBadge order={order} /> <span className={`status ${order.paymentStatus}`}>{order.paymentStatus}</span> <span className={`status ${order.fulfillmentStatus}`}>{order.fulfillmentStatus}</span></div>
            </div>
            <div className="store-order-body">
              <div>
                <h4>Items</h4>
                {order.items.map((item) => <p key={item.id}><b>{item.productTitleSnapshot}</b><br /><span>{item.sellerSkuSnapshot} · {item.quantity} × {formatMoney(item.unitPriceCents, order.currency)}</span>{item.availabilityTypeSnapshot === "preorder" && item.releaseDateSnapshot && <><br /><span className="order-preorder-date">Preorder · Expected release {date(item.releaseDateSnapshot)}</span></>}</p>)}
                <SellerOrderAmounts order={order} /><p><b>Payout:</b> {sellerPayoutLabel(order)}</p>
              </div>
              <div>
                <h4>Ship to</h4><p><b>{order.buyerName || "Customer"}</b><br />{formatAddress(order.shippingAddress)}</p><p><a href={`mailto:${order.buyerEmail}`}>{order.buyerEmail}</a></p>
                {order.shippingMode === "calculated" && <p className="shipping-service-commitment"><b>Buyer selected:</b> {order.selectedShippingCarrier} {order.selectedShippingService}{order.selectedShippingEstimatedDays == null ? "" : ` (about ${order.selectedShippingEstimatedDays} business days)`}. Use this service or an equal/faster one.</p>}
                {["paid", "partially_refunded"].includes(order.paymentStatus) && <ShipmentPanel order={order} compatibleOrders={compatibleOrdersFor(order, rows)} store={store} shipping={shipping} disabled={disabled} action={action} />}
                <Link className="button outline small" href={`/resolution?order=${order.id}`}>Open resolution record</Link>
              </div>
            </div>
          </article>
        ))}
        {!visible.length && <p className="store-empty">No orders match this view.</p>}
      </div>
    </div>
  );
}

function ShipmentPanel({
  order,
  compatibleOrders,
  store,
  shipping,
  disabled,
  action,
}: {
  order: StoreOrder;
  compatibleOrders: StoreOrder[];
  store: Store;
  shipping: StoreData["shipping"];
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (order.shipment)
    return <ShipmentDetails shipment={order.shipment} order={order} />;

  async function quoteRates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const response = await shippingRequest({
        action: "quote",
        orderIds: [order.id, ...selectedOrders],
        length: form.length,
        width: form.width,
        height: form.height,
        weight: form.weight,
      });
      setQuote(response.quote as ShippingQuote);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Rates are unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function buyLabel(rateId: string) {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      await shippingRequest({ action: "buy_label", quoteId: quote.id, rateId });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The label could not be purchased.");
    } finally {
      setBusy(false);
    }
  }

  async function manualTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action(
      {
        action: "ship_order",
        orderId: order.id,
        ...Object.fromEntries(new FormData(event.currentTarget)),
      },
      { reload: true, message: "Order marked shipped and customer notified." },
    );
  }

  if (!shipping.configured)
    return (
      <div className="store-shipment-form">
        <p className="form-note">Shippo is not configured on the server. Manual tracking remains available.</p>
        <ManualTrackingForm disabled={disabled} order={order} onSubmit={manualTracking} />
      </div>
    );

  return (
    <div className="store-shipment-form shipping-workflow">
      <h4>Create protected shipment</h4>
      {compatibleOrders.length > 0 && (
        <fieldset className="combined-orders">
          <legend>Combine orders to this same buyer and address</legend>
          {compatibleOrders.map((candidate) => (
            <label key={candidate.id}>
              <input
                type="checkbox"
                checked={selectedOrders.includes(candidate.id)}
                disabled={disabled || busy || Boolean(quote)}
                onChange={(event) =>
                  setSelectedOrders((current) =>
                    event.target.checked
                      ? [...current, candidate.id]
                      : current.filter((id) => id !== candidate.id),
                  )
                }
              />
              {candidate.orderNumber} · {formatMoney(candidate.subtotalCents, candidate.currency)}
            </label>
          ))}
        </fieldset>
      )}
      {!quote ? (
        <form onSubmit={quoteRates}>
          <div className="parcel-grid">
            <label>Length (in)<input name="length" inputMode="decimal" required defaultValue={store.defaultPackageLength} disabled={disabled || busy} /></label>
            <label>Width (in)<input name="width" inputMode="decimal" required defaultValue={store.defaultPackageWidth} disabled={disabled || busy} /></label>
            <label>Height (in)<input name="height" inputMode="decimal" required defaultValue={store.defaultPackageHeight} disabled={disabled || busy} /></label>
            <label>Weight (lb)<input name="weight" inputMode="decimal" required defaultValue={store.defaultPackageWeight} disabled={disabled || busy} /></label>
          </div>
          <p className="shipping-rule-note">Insurance is automatic at {formatMoney(shipping.insuranceThresholdCents)}; signature is automatic at {formatMoney(shipping.signatureThresholdCents)}. The server enforces both rules.</p>
          <button className="button dark small" disabled={disabled || busy}>{busy ? "Getting rates…" : "Get carrier rates"}</button>
        </form>
      ) : (
        <div className="shipping-rates">
          <div className="shipping-guardrails">
            <b>{quote.orderNumbers.length > 1 ? `${quote.orderNumbers.length} orders combined` : "Single order"}</b>
            <span>{quote.insuranceRequired ? `Insured for ${formatMoney(quote.declaredValueCents)}` : "Insurance below threshold"}</span>
            <span>{quote.signatureRequired ? "Signature required" : "No signature required"}</span>
          </div>
          <small>Rates expire {dateTime(quote.expiresAt)}. Buying a rate charges the connected Shippo account and creates one label.</small>
          {quote.selectedServices.length > 0 && <p className="shipping-rule-note">Only the buyer-selected service or objectively equal/faster services are shown.</p>}
          {quote.rates.map((rate) => (
            <button type="button" key={rate.id} disabled={disabled || busy} onClick={() => void buyLabel(rate.id)}>
              <span><b>{rate.provider}</b><small>{rate.serviceLevel}{rate.estimatedDays == null ? "" : ` · ${rate.estimatedDays} day${rate.estimatedDays === 1 ? "" : "s"}`}</small></span>
              <strong>Buy · {formatMoney(rate.amountCents, rate.currency)}</strong>
            </button>
          ))}
          <button type="button" className="text-button" disabled={busy} onClick={() => setQuote(null)}>Change package or refresh rates</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <details className="manual-tracking">
        <summary>Use a label bought elsewhere</summary>
        <ManualTrackingForm disabled={disabled || busy} order={order} onSubmit={manualTracking} />
      </details>
    </div>
  );
}

type ShippingQuote = {
  id: string;
  expiresAt: string;
  orderNumbers: string[];
  declaredValueCents: number;
  insuranceRequired: boolean;
  signatureRequired: boolean;
  selectedServices: Array<{
    carrier: string | null;
    serviceToken: string | null;
    estimatedDays: number | null;
  }>;
  rates: Array<{
    id: string;
    provider: string;
    serviceLevel: string;
    amountCents: number;
    currency: string;
    estimatedDays: number | null;
  }>;
};

function ManualTrackingForm({
  disabled,
  order,
  onSubmit,
}: {
  disabled: boolean;
  order: StoreOrder;
  onSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
}) {
  const protectedService = order.shippingMode === "calculated";
  return <form onSubmit={onSubmit}><label>Carrier<input name="carrier" required maxLength={100} disabled={disabled} defaultValue={protectedService ? order.selectedShippingCarrier ?? "" : ""} /></label><label>Carrier service<input name="fulfillmentService" required={protectedService} maxLength={150} disabled={disabled} defaultValue={protectedService ? order.selectedShippingService ?? "" : ""} /></label><label>Estimated transit days<input name="fulfillmentEstimatedDays" type="number" min={0} max={60} required={protectedService} disabled={disabled} defaultValue={protectedService ? order.selectedShippingEstimatedDays ?? "" : ""} /></label><label>Tracking number<input name="trackingNumber" required maxLength={200} disabled={disabled} /></label>{protectedService && <p className="form-note">By submitting, you confirm this service matches or improves on the buyer&apos;s selection.</p>}<button className="button outline small" disabled={disabled}>Mark shipped manually</button></form>;
}

function ShipmentDetails({ shipment, order }: { shipment: Shipment; order: StoreOrder }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sync() {
    setBusy(true);
    setError("");
    try {
      await shippingRequest({ action: "sync_tracking", shipmentId: shipment.id });
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tracking could not be refreshed.");
      setBusy(false);
    }
  }
  return (
    <>
      <ShipmentTimeline
        shipment={shipment}
        actions={
          <>
            <a className="button dark small" href={`/api/shipping/label?shipment_id=${encodeURIComponent(shipment.id)}`} target="_blank" rel="noreferrer">Print 4×6 label</a>
            <button className="button outline small" disabled={busy} onClick={() => void sync()}>{busy ? "Refreshing…" : "Refresh events"}</button>
          </>
        }
        note={order.fulfillmentStatus === "processing" ? <p className="form-note">A label is ready, but handling remains open until the carrier records the package in transit.</p> : null}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

async function shippingRequest(payload: Record<string, unknown>) {
  const response = await fetch("/api/shipping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(body.error || "The shipping request failed.");
  return body;
}

function AnalyticsView({ analytics }: { analytics: Analytics }) {
  const max = Math.max(1, ...analytics.monthlySales.map((month) => month.grossCents));
  return <section className="store-panel"><p className="eyebrow">Last six calendar months</p><h3>Revenue over time</h3><p className="hub-note">Gross item sales before fees and refunds. The current month is partial; sales are grouped by order creation date.</p><div className="sales-bars">{analytics.monthlySales.map((month) => <div key={month.key}><div><span>{month.label}</span><b>{formatMoney(month.grossCents)}</b></div><div className="sales-bar-track"><span style={{ width: `${month.grossCents / max * 100}%`, minWidth: 0 }} /></div><small>{month.orders} paid orders</small></div>)}</div></section>;
}

function StoreSettings({
  store,
  fee,
  disabled,
  action,
}: {
  store: Store;
  fee: StoreData["fee"];
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const addressRef = useRef<AddressFieldsHandle>(null);
  const [saveError, setSaveError] = useState("");
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);
  const currentSellerTerms =
    store.sellerTermsVersion === POLICY_VERSION &&
    Boolean(store.sellerTermsAcceptedAt);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    try {
      await action(
        { action: "save_store", ...Object.fromEntries(new FormData(event.currentTarget)) },
        { reload: true, message: "Store profile updated." },
      );
    } catch (error) {
      const fields = (error as { fields?: Record<string, string> }).fields;
      if (fields) addressRef.current?.setErrors(fields);
      setSaveError(error instanceof Error ? error.message : "The store could not be saved. Please try again.");
    }
  }

  async function acceptTerms() {
    await action(
      {
        action: "accept_seller_terms",
        sellerTermsVersion: POLICY_VERSION,
      },
      { reload: true, message: "Current Seller Terms accepted." },
    );
  }
  return (
    <div className="store-stack">
      <header className="store-page-heading"><div><p className="eyebrow">Storefront</p><h2>Store settings</h2><p>Update the public details and policies customers see.</p></div></header>
      <section className="store-panel store-settings">
        <form className="admin-form" onSubmit={submit}>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <div className="form-row"><label>Store name<input name="storeName" required maxLength={120} disabled={disabled} defaultValue={store.storeName} /></label><label>Primary contact<input name="contactName" required maxLength={120} disabled={disabled} defaultValue={store.contactName} /></label></div>
          <label>Account email<input value={store.contactEmail} disabled /><span>Contact support to change the email that owns this store.</span></label>
          <label>Store description<textarea name="description" rows={5} maxLength={2000} disabled={disabled} defaultValue={store.description} /></label>
          <div className="form-row"><label>Website URL<input name="websiteUrl" type="url" disabled={disabled} defaultValue={store.websiteUrl ?? ""} /></label><label>Logo URL<input name="logoUrl" type="url" disabled={disabled} defaultValue={store.logoUrl ?? ""} /></label></div>
          <div className="form-row"><label>Shipping model<select name="shippingMode" required disabled={disabled} defaultValue={store.shippingMode}><option value="calculated">Calculated carrier rates</option><option value="flat">Flat-rate shipping</option><option value="free">Free shipping</option></select></label><label>Handling time (business days)<input name="handlingTimeBusinessDays" type="number" min={1} max={10} required disabled={disabled} defaultValue={store.handlingTimeBusinessDays} /></label></div>
          <label>Flat-rate amount (USD)<input name="defaultShipping" inputMode="decimal" required disabled={disabled} defaultValue={(store.defaultShippingCents / 100).toFixed(2)} /><span>Used only when the shipping model is flat rate.</span></label>
          <h3>Ship-from address</h3>
          <p className="form-note">Your ship-from address is private and is used for carrier rates and labels.</p>
          <AddressFields ref={addressRef} fieldNames={SHIP_FROM_FIELD_NAMES} initialValues={shipFromAddressValues(store)} includePhone disabled={disabled} />
          <h3>Default package</h3>
          <div className="parcel-grid"><label>Length (in)<input name="defaultPackageLength" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageLength} /></label><label>Width (in)<input name="defaultPackageWidth" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWidth} /></label><label>Height (in)<input name="defaultPackageHeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageHeight} /></label><label>Weight (lb)<input name="defaultPackageWeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWeight} /></label></div>
          <label>Shipping policy<textarea name="shippingPolicySummary" rows={4} maxLength={1000} disabled={disabled} defaultValue={store.shippingPolicySummary} /></label>
          <label>Return policy<textarea name="returnPolicySummary" rows={4} maxLength={1000} disabled={disabled} defaultValue={store.returnPolicySummary} /></label>
          <button className="button dark small" disabled={disabled}>Save store settings</button>
        </form>
      </section>
      <section className="store-panel payout-status"><p className="eyebrow">Payout account</p><h3>Stripe Connect</h3><p><span className={`status ${store.stripeChargesEnabled ? "active" : "onboarding"}`}>Charges {store.stripeChargesEnabled ? "enabled" : "pending"}</span> <span className={`status ${store.stripePayoutsEnabled ? "active" : "onboarding"}`}>Payouts {store.stripePayoutsEnabled ? "enabled" : "pending"}</span></p><p>Bank and identity details remain securely hosted by Stripe. Contact Model Car Center if you need a fresh onboarding link.</p></section>
      <section className="store-panel payout-status">
        <p className="eyebrow">Seller agreement</p>
        <h3>{currentSellerTerms ? "Current Seller Terms accepted" : "Action required before selling"}</h3>
        {currentSellerTerms ? (
          <p>
            Accepted {formatUtcDateTime(store.sellerTermsAcceptedAt!)}. Review the current <Link href="/seller-terms">Seller Terms</Link> at any time.
          </p>
        ) : (
          <>
            <p>Review and accept the current Seller Terms before publishing inventory or accepting new marketplace payments.</p>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={acceptedSellerTerms}
                onChange={(event) => setAcceptedSellerTerms(event.target.checked)}
              />
              <span>I am authorized to accept the <Link href="/seller-terms">Seller Terms</Link> for this store, including deductions for marketplace commission and actual payment processing.</span>
            </label>
            <button
              className="button dark small"
              type="button"
              disabled={!acceptedSellerTerms}
              onClick={() => void acceptTerms()}
            >
              Accept current Seller Terms
            </button>
          </>
        )}
      </section>
      <section className="store-panel payout-status"><p className="eyebrow">Selling fees</p><h3>{fee.rateKind === "founding_professional" ? "Founding Seller Rate" : "Professional Store Rate"} — {feePercent(fee.marketplaceFeeBps)} marketplace fee</h3>{fee.foundingPromotionActive && <p>Your promotional rate is active. It automatically becomes the {feePercent(fee.standardMarketplaceFeeBps)} standard professional rate when the six-month period ends.</p>}<SellerFeeDisclosure marketplaceFeeBps={fee.marketplaceFeeBps} /><p>Seller proceeds become eligible for release three days after carrier-confirmed delivery if no case is open and the actual processing fee is available. Stripe controls bank-payout timing after release.</p></section>
    </div>
  );
}

function HandlingBadge({ order }: { order: StoreOrder }) {
  const reminder = orderHandlingReminder(order);
  if (reminder.level === "none") return null;
  return <span className={`handling-badge ${reminder.level}`}>{reminder.label}</span>;
}

function orderHandlingReminder(order: StoreOrder) {
  if (
    !["paid", "partially_refunded"].includes(order.paymentStatus) ||
    ["shipped", "delivered", "cancelled"].includes(order.fulfillmentStatus) ||
    !order.shipByAt
  )
    return { level: "none", label: "" };
  const deadline = new Date(order.shipByAt);
  if (Number.isNaN(deadline.getTime())) return { level: "none", label: "" };
  const hours = Math.ceil((deadline.getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return { level: "overdue", label: "Handling overdue" };
  if (hours <= 24) return { level: "due_today", label: "Ship today" };
  if (hours <= 48) return { level: "due_soon", label: "Ship within 2 days" };
  return { level: "on_track", label: `Ship by ${date(order.shipByAt)}` };
}

function compatibleOrdersFor(order: StoreOrder, rows: StoreOrder[]) {
  return rows.filter(
    (candidate) =>
      candidate.id !== order.id &&
      !candidate.shipment &&
      candidate.fulfillmentStatus === "unfulfilled" &&
      ["paid", "partially_refunded"].includes(candidate.paymentStatus) &&
      candidate.buyerEmail.trim().toLowerCase() ===
        order.buyerEmail.trim().toLowerCase() &&
      candidate.shippingAddress === order.shippingAddress &&
      candidate.currency.toLowerCase() === order.currency.toLowerCase(),
  );
}

function dateTime(value: string) {
  return formatUtcDateTime(value);
}

function formatAddress(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
    };
    const address = parsed.address ?? {};
    return [
      address.line1,
      address.line2,
      [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
      address.country,
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return "Shipping address unavailable";
  }
}

function sellerPayoutLabel(order: StoreOrder) {
  if (order.paymentFlow === "destination") return "Legacy Stripe payout schedule";
  if (order.sellerTransferStatus === "transferred")
    return order.sellerTransferredAt
      ? `Released to Stripe ${date(order.sellerTransferredAt)}`
      : "Released to Stripe";
  if (order.sellerTransferStatus === "processing") return "Release processing";
  if (order.sellerTransferStatus === "failed") return "Release will be retried";
  if (order.sellerTransferStatus === "cancelled") return "Cancelled";
  if (order.sellerTransferStatus === "reversed") return "Reversed for refund";
  if (order.processingFeePayer === "seller" && order.paymentProcessingFeeCents == null) return "Held — awaiting actual Stripe processing fee";
  return order.payoutEligibleAt
    ? `Held through ${date(order.payoutEligibleAt)}`
    : "Held until three days after delivery";
}

function date(value: string) {
  return formatUtcDate(value);
}

function feePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}
