"use client";

import { SellerFeeDisclosure } from "./seller-fee-disclosure";
import { SellerPayments, SellerHelp, SellerThumbnail } from "./seller-setup";
import { SellerInventoryUpload, SellerBulkStock } from "./seller-inventory-upload";
import { StoreLogoUpload } from "./store-logo-upload";
import { StoreCountrySelect } from "./store-country-select";
import { trackEvent, sellerSetupElapsed } from "@/lib/analytics-client";
import { useTaskMeasurement } from "./use-task-measurement";
import { listingPhotoEvidence } from "@/lib/listing-evidence";
import { activeProtectionPolicy } from "@/lib/protection";
import type { buildSellerSetup } from "@/lib/seller-setup";
import "./seller-workflows.css";
import "./seller-dashboard.css";
import { SellerNavigation } from "./seller-navigation";
import { needsShipment, prioritizeOrders, sellerOrderPayout } from "@/lib/seller-dashboard";
import { SellerOrderAmounts } from "./seller-order-amounts";
import { PreorderSeller, SellerPreorderOrders } from "./preorder-seller";

import Link from "next/link";
import { CatalogModelPicker } from "./catalog-model-picker";
import { useRouter } from "next/navigation";
import { HubOverview, HubGrowth, HubAnalytics } from "./seller-hub-panels";
import { hubViews, inventoryViews, orderViews, matchesInventoryView, matchesOrderView, type HubView, type HubNavigate, type SellerHubMetrics } from "@/lib/seller-hub";
import type { SellerHubDemand } from "@/lib/seller-hub-data";
import { useDialogFocus } from "./use-dialog-focus";
import { FormEvent, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
  specialty: string;
  packingApproach: string;
  foundingRateStartsAt: string | null;
  foundingRateEndsAt: string | null;
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
  preorder?: { batchId: string; capacity: number; cutoff: string; buyerLimit: number } | null;
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

export type OrderItem = {
  id: string;
  productTitleSnapshot: string;
  sellerSkuSnapshot: string;
  productId: string | null;
  imageUrlSnapshot: string | null;
  scaleSnapshot: string;
  manufacturerSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  availabilityTypeSnapshot: "in_stock" | "preorder";
  releaseDateSnapshot: string | null;
};

export type StoreOrder = {
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
  paidAt: string | null;
  isTestOrder: boolean;
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
  asOf: string;
  store: Store;
  setup: ReturnType<typeof buildSellerSetup>;
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

function subscribeHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const pageHash = () => window.location.hash;
const serverHash = () => "";
function usePageHash() {
  return useSyncExternalStore(subscribeHashChange, pageHash, serverHash);
}

export function StoreDashboard({
  data,
  initialView,
  initialProductId,
  initialPreorderId,
  initialFilter,
  email,
  messages,
}: {
  data: StoreData;
  initialView: string;
  initialProductId?: string;
  initialPreorderId?: string;
  initialFilter?: string;
  email: string;
  messages?: ReactNode;
}) {
  const firstView = tabs.includes(initialView as Tab)
    ? (initialView as Tab)
    : initialProductId
      ? "inventory"
      : "overview";
  const view = ["demand", "opportunities", "marketing"].includes(firstView) ? "growth" : firstView;
  const growthFilter = firstView === "marketing" ? (initialFilter === "discounts" ? "pricing" : "promoted") : initialFilter;
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
    if (payload.action === "save_store") trackEvent("seller_setup_step_completed", { step: payload.section === "introduction" ? "store" : "shipping" });
    if (payload.action === "product_status" && payload.status === "active" && !data.inventory.some(product => ["active", "sold_out"].includes(product.status)) && data.orders.length === 0) trackEvent("first_listing_published", { durationMs: sellerSetupElapsed(data.store.id) }, { onceKey: `first-listing-${data.store.id}` });
    trackEvent("seller_tool_used", { step: String(payload.action), result: "success" });
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
    <div className="store-layout seller-hub seller-workspace">
      <SellerNavigation storeName={data.store.storeName} slug={data.store.slug} email={email} status={data.store.status} termsAccepted={data.setup.termsAccepted} view={view} orders={data.analytics.unfulfilledOrders}/>
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
        {view === "payments" && <SellerPayments data={data} action={action} />}
        {view === "help" && <SellerHelp />}
        {view === "growth" && <HubGrowth data={data} navigate={selectView} filter={growthFilter} />}
        {view === "messages" && messages}
        {view === "inventory" && (
          <Inventory
            key={`inventory-${initialFilter}-${initialProductId}-${initialPreorderId}`}
            marketplaceFeeBps={data.fee.marketplaceFeeBps}
            rows={data.inventory}
            initialProductId={initialProductId}
            initialPreorderId={initialPreorderId}
            queue={inventoryViews.some(([value]) => value === initialFilter) ? initialFilter! : "all"}
            slowIds={data.hub.slowIds}
            initialTool={initialFilter}
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
        {view === "analytics" && <HubAnalytics data={data} navigate={selectView} />}
        {view === "settings" && (
          <StoreSettings
            key={`settings-${initialFilter}`}
            store={data.store}
            fee={data.fee}
            disabled={suspended}
            action={action}
            setup={data.setup}
            section={initialFilter}
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
  initialPreorderId,
  queue,
  slowIds,
  initialTool,
  navigate,
  disabled,
  action,
}: {
  marketplaceFeeBps: number;
  rows: Product[];
  initialProductId?: string;
  initialPreorderId?: string;
  queue: string;
  slowIds: string[];
  initialTool?: string;
  navigate: HubNavigate;
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const initial = rows.find((row) => row.id === initialProductId) ?? null;
  const [editing, setEditing] = useState<Product | "new" | null>(disabled ? null : initialProductId === "new" ? "new" : initial);
  const [preorder, setPreorder] = useState(rows.find(row=>row.id===initialPreorderId&&row.availabilityType==="preorder") ?? null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [chosenTool, setTool] = useState<string | null>(initialTool === "bulk" || initialTool === "import" ? initialTool : null);
  const hash = usePageHash();
  const tool = chosenTool ?? (hash === "#inventory-upload" ? "import" : "");
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
          Add model
        </button>
      </header>
      <div className="seller-inventory-toolbar"><button className="button outline small" aria-expanded={tool === "bulk"} onClick={() => setTool(tool === "bulk" ? "" : "bulk")}>Update stock &amp; price</button><button className="button outline small" aria-expanded={tool === "import"} onClick={() => setTool(tool === "import" ? "" : "import")}>Import CSV</button></div>
      {tool === "bulk" && <SellerBulkStock products={rows} disabled={disabled} action={action} expanded />}
      {tool === "import" && <SellerInventoryUpload disabled={disabled} action={action} expanded />}
      <nav className="hub-filters" aria-label="Inventory views">
        {inventoryViews.map(([value, label]) => <button key={value} aria-pressed={queue === value} onClick={() => navigate("inventory", value)}>{label}<span>{rows.filter((row) => matchesInventoryView(row, value, slowIds)).length}</span></button>)}
      </nav>
      {queue === "slow" && <p className="hub-note">Active, in-stock listings at least 90 days old with no paid sale in the last 90 days.</p>}
      {queue === "low" && <p className="hub-note">Active, in-stock listings with 1–2 available units, after reservations.</p>}
      {queue === "attention" && <p className="hub-note">Drafts, unpublished or removed listings, and in-stock listings missing required photo evidence. Each listing counts once.</p>}
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
                <tr key={product.id} className="seller-inventory-item">
                  <td className="seller-product-cell">
                    <SellerThumbnail src={product.primaryImageUrl} title={product.title}/><div>
                    <b>{product.title}</b>
                    <small>
                      {product.scale} · {product.modelManufacturer}
                    </small>
                    {product.availabilityType === "preorder" && product.releaseDate && (
                      <small>Preorder · expected to ship {formatUtcDate(product.releaseDate)}</small>
                    )}
                    {product.availabilityType !== "preorder" && !listingPhotoEvidence(product, product.images).complete && <button className="seller-photo-status" disabled={disabled} onClick={() => setEditing(product)}>Photos incomplete · Review →</button>}
                    </div>
                  </td>
                  <td data-label="SKU">{product.sellerSku}</td>
                  <td data-label="Price" className="seller-money">{formatMoney(product.priceCents, product.currency)}</td>
                  <td data-label="Stock">
                    {product.availabilityType === "preorder" ? `${product.preorder?.capacity ?? 0} preorder units` : `${Math.max(0, product.inventoryQuantity - product.reservedQuantity)} available`}
                    {product.reservedQuantity > 0 && (
                      <small>{product.reservedQuantity} reserved</small>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`status ${product.status}`}>
                      {product.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="seller-inventory-actions">
                    <div className="row-actions">
                      <button className="button dark small" disabled={disabled} onClick={() => setEditing(product)}>
                        Edit
                      </button>
                      <details><summary>More actions</summary><div className="seller-item-more">
                      {!disabled && product.status === "active" && product.availabilityType === "in_stock" && product.inventoryQuantity > product.reservedQuantity && <Link href={`/store?view=growth&filter=promoted&promotion_product=${encodeURIComponent(product.id)}`}>Promote</Link>}
                      {product.availabilityType === "preorder" && <button onClick={()=>setPreorder(product)}>Manage preorder</button>}
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
                      </div></details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="store-empty">No inventory matches those filters.</p>}
      </section>
      <details className="store-panel"><summary>Selling fees</summary><SellerFeeDisclosure marketplaceFeeBps={marketplaceFeeBps} /></details>
      {preorder && <PreorderInventoryDialog listing={preorder} onClose={()=>setPreorder(null)}/>}
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

function PreorderInventoryDialog({listing,onClose}:{listing:Product;onClose:()=>void}) {
  const dialog=useDialogFocus(onClose);
  return <div className="store-editor-backdrop"><section ref={dialog} tabIndex={-1} className="store-editor" role="dialog" aria-modal="true" aria-labelledby="preorder-editor-title">
    <div className="panel-heading"><div><p className="eyebrow">Inventory item</p><h2 id="preorder-editor-title">Manage preorder</h2></div><button type="button" className="dialog-close" aria-label="Close preorder details" onClick={onClose}>×</button></div>
    <PreorderSeller listingId={listing.id}/>
  </section></div>;
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
  const task = useTaskMeasurement("listing");
  const router = useRouter();
  const [catalogReady, setCatalogReady] = useState(Boolean(product?.catalogProductId));
  const [busy, setBusy] = useState(false);
  const dialog = useDialogFocus(() => { if (!busy) onClose(); });
  const [productId, setProductId] = useState(product?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(product?.images ?? []);
  const [primaryImageUrl, setPrimaryImageUrl] = useState(
    product?.primaryImageUrl ?? null,
  );
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [availabilityType, setAvailabilityType] = useState<
    "in_stock" | "preorder"
  >(product?.availabilityType ?? "in_stock");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
      task.complete();
      onClose();
      router.replace("/store?view=inventory");
      router.refresh();
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
    <div className="store-editor-backdrop seller-full-editor" role="presentation">
      <section ref={dialog} tabIndex={-1} className="store-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <div className="panel-heading seller-editor-heading">
          <div>
            <p className="eyebrow">Inventory item</p>
            <h2 id="product-editor-title">{product ? "Edit listing" : "Create listing"}</h2>
          </div>
          <button type="button" className="dialog-close" aria-label="Close listing editor" disabled={busy} onClick={onClose}>×</button>
        </div>
        <nav className="seller-editor-nav" aria-label="Listing sections"><a href="#listing-model">Model</a><a href="#listing-price">Price &amp; stock</a><a href="#listing-condition">Condition</a><a href="#listing-photos">Photos</a></nav>
        <form className="admin-form" onSubmit={submit} onChange={task.start}>
          <div className="seller-editor-scroll">
          <section id="listing-model"><h3>Model</h3>
          <CatalogModelPicker initial={product} listingSaved={Boolean(productId)} disabled={busy} onReady={setCatalogReady} />
          </section>
          <fieldset className="catalog-listing-fields" hidden={!catalogReady} disabled={!catalogReady}>
          <div className="form-row">
            <label>Seller SKU<input name="sellerSku" required maxLength={100} defaultValue={product?.sellerSku ?? ""} /></label>
            <label>Listing title (optional)<input name="title" maxLength={200} defaultValue={product?.title ?? ""} /></label>
          </div>
          <label>Description<textarea name="description" rows={4} maxLength={4000} defaultValue={product?.description ?? ""} /></label>
          <section id="listing-price"><h3>Price &amp; stock</h3>
          <div className="form-row">
            <label>Full item price (USD)<input name="price" inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} /></label>
            <label>{availabilityType === "preorder" ? "Quantity available to preorder" : "Inventory quantity"}<input name="inventoryQuantity" type="number" min={availabilityType === "preorder" ? 1 : product?.reservedQuantity ?? 0} max={100000} required defaultValue={product?.preorder?.capacity ?? product?.inventoryQuantity ?? 1} /></label>
          </div>
          <p className="form-note">You pay {feePercent(marketplaceFeeBps)} commission on the item subtotal, plus actual payment processing on the full customer payment (including shipping and tax). Both are deducted from your proceeds. <Link href="/seller-terms#fees">Fee and payout terms</Link></p>
          <fieldset className="availability-fields">
            <legend>Availability</legend>
            <div className="form-row">
              <label>
                Listing type
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
                  <option value="preorder">Preorder · 10% deposit</option>
                </select>
              </label>
              {availabilityType === "preorder" && <label>
                Expected ship date
                <input
                  name="releaseDate"
                  type="date"
                  required={availabilityType === "preorder"}
                  disabled={availabilityType !== "preorder"}
                  defaultValue={product?.releaseDate ?? ""}
                />
              </label>}
            </div>
            {availabilityType === "preorder" && <>
              <div className="form-row"><label>Close preorders on (optional)<input name="preorderCutoff" type="date" defaultValue={product?.preorder?.cutoff ?? ""}/></label><label>Maximum per buyer<input name="preorderBuyerLimit" type="number" min="1" max="10" defaultValue={product?.preorder?.buyerLimit ?? 10}/></label></div>
              <div className="preorder-deposit-preview"><strong>10% deposit{Number(price) > 0 ? ` · ${formatMoney(Math.round(Number(price) * 10), "usd")} per item` : ""}</strong><p>Buyers pay the deposit now and the remaining balance when you mark stock ready. Shipping and applicable tax are shown before payment.</p><p>The deposit is non-refundable for a change of mind, unless you approve a refund. If you cannot fulfill, the buyer is refunded. Required refunds for delays and other consumer rights still apply.</p></div>
            </>}
          </fieldset>
          <details><summary>Package override (optional)</summary><p className="form-note">Leave all four blank to use the store default package for calculated checkout rates.</p><div className="parcel-grid"><label>Length (in)<input name="packageLength" inputMode="decimal" defaultValue={product?.packageLength ?? ""} /></label><label>Width (in)<input name="packageWidth" inputMode="decimal" defaultValue={product?.packageWidth ?? ""} /></label><label>Height (in)<input name="packageHeight" inputMode="decimal" defaultValue={product?.packageHeight ?? ""} /></label><label>Weight (lb)<input name="packageWeight" inputMode="decimal" defaultValue={product?.packageWeight ?? ""} /></label></div></details>
          </section><section id="listing-condition"><h3>Condition</h3>
          <label>Condition notes<textarea name="conditionNotes" maxLength={2000} defaultValue={product?.conditionNotes ?? ""} /></label>
          <CollectibleListingFields product={product} includeIdentity={false}/>
          </section><section id="listing-photos"><h3>Photos</h3>
          <ProductImageFields
            productId={productId || undefined}
            images={images}
            primaryImageUrl={primaryImageUrl}
            files={files}
            disabled={busy}
            onFilesChange={setFiles}
            onRemove={productId ? removeImage : undefined}
            onRemoveLegacy={productId ? removeLegacyImage : undefined}
            onReorder={productId ? reorderImages : undefined}
          />
          {availabilityType !== "preorder" ? <RequiredPhotoChecklist product={product}/> : <p className="form-note">Upload a product image or preview. Describe any prototype images or expected production differences in the listing.</p>}
          </section>
          <label>Search keywords<input name="keywords" maxLength={1000} defaultValue={product?.keywords ?? ""} /></label>
          {product && product.reservedQuantity > 0 && <p className="form-note">Inventory cannot be reduced below {product.reservedQuantity} reserved units.</p>}
          <details className="seller-publish-checklist"><summary>Before publishing</summary><ul><li>Choose the correct catalog model.</li><li>Set price, available stock, and your SKU.</li><li>Confirm model and packaging condition; disclose missing parts and defects.</li><li>{availabilityType === "preorder" ? "Add preview imagery and an expected ship date." : "Add actual-item photos and label each required view."}</li><li>Complete store setup and accept current Seller Terms.</li></ul><p>Saving a new listing creates a draft. Publish from Inventory after completing these checks.</p></details>
          </fieldset></div>
          <footer className="seller-editor-footer">
            {imageError && <p className="form-error" role="alert">{imageError}</p>}
            <button className="button dark" disabled={busy || !catalogReady}>{busy ? "Saving…" : product ? "Save changes" : "Save draft"}</button>
            <button type="button" className="button outline" disabled={busy} onClick={onClose}>Cancel</button>
          </footer>
      </form>
      </section>
    </div>
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
  const filter = ["open", "all", "shipped", "returns", "refunded", "cancelled", "preorders"].includes(initialFilter ?? "") ? initialFilter! : "open";
  const urgentCount = rows.filter((order) =>
    ["overdue", "due_today", "due_soon"].includes(
      orderHandlingReminder(order).level,
    ),
  ).length;
  const visible = prioritizeOrders(rows.filter((order) => matchesOrderView(order, filter, returnOrderIds)));
  return (
    <div className="store-stack">
      <header className="store-page-heading">
        <div><h2>Orders</h2><p>{urgentCount ? `${urgentCount} dispatch deadlines need attention.` : "Items, dispatch deadlines, and tracking."}</p></div>
        <label className="seller-control">Order queue<select aria-label="Filter orders" value={filter} onChange={(event) => navigate("orders", event.target.value)}>
          {orderViews.map(([value, label]) => <option key={value} value={value}>{label} · {rows.filter(row => matchesOrderView(row, value, returnOrderIds)).length}</option>)}<option value="preorders">Preorders</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option>
        </select></label>
      </header>
      {filter === "returns" && <div className="hub-callout"><p>Orders with a return-and-refund request. Review each case and respond in the Resolution Center.</p><Link className="button outline small" href="/resolution">Manage returns</Link></div>}
      <div className="store-orders">
        {["preorders","all"].includes(filter)&&<SellerPreorderOrders showEmpty={filter==="preorders"}/>}
        {visible.map(order => <SellerOrderCard key={order.id} order={order} rows={rows} store={store} shipping={shipping} disabled={disabled} action={action}/>)}
        {!visible.length && filter!=="preorders" && <p className="store-empty">{filter==="all" ? "No fully paid orders yet." : "No orders match this view."}</p>}
      </div>
    </div>
  );
}

function SellerOrderCard({ order, rows, store, shipping, disabled, action }: {
  order: StoreOrder;
} & Pick<Parameters<typeof Orders>[0], "rows" | "store" | "shipping" | "disabled" | "action">) {
  const readyToShip = needsShipment(order);
  return <article className="store-order seller-queue-order" id={`order-${order.id}`}>
    <header className="store-order-header"><div><span>{date(order.createdAt)}{order.isTestOrder ? " · Test order" : ""}</span><h3>{order.orderNumber}</h3></div><b className="seller-money">{formatMoney(order.totalCents, order.currency)}</b></header>
    <div className="seller-order-status"><HandlingBadge order={order}/><span className={`status ${order.paymentStatus}`}>{order.paymentStatus.replaceAll("_", " ")}</span><span className={`status ${order.fulfillmentStatus}`}>{order.fulfillmentStatus.replaceAll("_", " ")}</span></div>
    <ul className="seller-packing-items">{order.items.map(item => <li key={item.id}><SellerThumbnail src={item.imageUrlSnapshot} title={item.productTitleSnapshot}/><div><strong>{item.productTitleSnapshot}</strong><p>{item.scaleSnapshot} · {item.manufacturerSnapshot}</p><p><b>Qty {item.quantity}</b> · SKU {item.sellerSkuSnapshot}</p>{item.availabilityTypeSnapshot === "preorder" && item.releaseDateSnapshot && <p>Preorder · expected {date(item.releaseDateSnapshot)}</p>}</div></li>)}</ul>
    {!order.items.length && <div className="seller-data-note"><strong>Item details are missing from this order.</strong><p>The model, SKU, and quantity were not recorded. Confirm the packing details with support before shipping.</p><Link href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}>Resolve missing order items →</Link></div>}
    {readyToShip && <p className="seller-dispatch-date">{order.shipByAt ? `Dispatch deadline: ${dateTime(order.shipByAt)}` : "Dispatch deadline not recorded - check with support."}</p>}
    <details className="seller-fulfillment"><summary>{readyToShip && order.items.length && !order.shipment ? "Create shipment" : "Delivery & tracking details"}</summary><div className="seller-fulfillment-content"><h4>Ship to</h4><p><strong>{order.buyerName || "Customer"}</strong><br/>{formatAddress(order.shippingAddress)}</p><p><a href={`mailto:${order.buyerEmail}`}>{order.buyerEmail}</a></p>
      {order.shippingMode === "calculated" && <p><b>Buyer selected:</b> {order.selectedShippingCarrier} {order.selectedShippingService}{order.selectedShippingEstimatedDays == null ? "" : ` · about ${order.selectedShippingEstimatedDays} business days`}. Use this service or an equal/faster one.</p>}
      {["paid", "partially_refunded"].includes(order.paymentStatus) && (order.items.length || !readyToShip) ? <ShipmentPanel order={order} compatibleOrders={compatibleOrdersFor(order, rows).filter(candidate => candidate.items.length > 0)} store={store} shipping={shipping} disabled={disabled} action={action}/> : <p>{readyToShip ? "Shipment creation is unavailable until this order’s items are confirmed." : "Shipment creation requires a paid order."}</p>}
    </div></details>
    <details className="seller-order-finances"><summary>Payment & fee details</summary><SellerOrderAmounts order={order}/><p><b>Payout:</b> {sellerOrderPayout(order).label}</p>{order.processingFeePayer === "platform" && <p>This order records processing paid by MCC under its earlier fee arrangement. New orders deduct actual processing from seller proceeds.</p>}{order.paymentFlow === "destination" && <p>Legacy direct payouts are excluded from MCC’s held/released totals. Check Stripe for this payment’s payout history.</p>}</details>
    <div className="seller-task-links"><Link href={`/store?view=messages`}>Buyer messages →</Link><Link href={`/resolution?order=${order.id}`}>Order support →</Link></div>
  </article>;
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

function StoreSettings({
  store,
  fee,
  disabled,
  action,
  setup,
  section,
}: {
  store: Store;
  fee: StoreData["fee"];
  disabled: boolean;
  setup: StoreData["setup"];
  section?: string;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const addressRef = useRef<AddressFieldsHandle>(null);
  const settingsRouter = useRouter();
  const [saveError, setSaveError] = useState("");
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const hash = usePageHash();
  const selected = ["shipping", "terms", "payments", "introduction"].includes(section ?? "") ? section! : hash === "#seller-terms" ? "terms" : hash === "#shipping-options" ? "shipping" : "introduction";
  const currentSellerTerms =
    store.sellerTermsVersion === POLICY_VERSION &&
    Boolean(store.sellerTermsAcceptedAt);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || logoBusy) return;
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
    setSaveError("");
    try {
      await action(
        {
          action: "accept_seller_terms",
          sellerTermsVersion: POLICY_VERSION,
        },
        { reload: true, message: "Current Seller Terms accepted." },
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Seller Terms could not be saved. Please try again.");
    }
  }
  return (
    <div className="store-stack">
      <header className="store-page-heading"><div><h2>Settings</h2><p>Manage one part of your store at a time.</p></div></header>
      {!setup.readyToPublish && <div className="seller-data-note"><strong>Before publishing</strong><div className="seller-task-links">{!currentSellerTerms && <Link href="/store?view=settings&filter=terms#seller-terms">Accept Seller Terms →</Link>}{setup.steps.filter(step => !step.complete && step.id !== "inventory").map(step => <Link key={step.id} href={step.href}>{step.title} →</Link>)}{store.status !== "active" && <Link href="/store?view=payments">Resolve store status →</Link>}</div></div>}
      <label className="seller-control">Settings section<select value={selected} onChange={event => settingsRouter.push(`/store?view=settings&filter=${event.target.value}`)}><option value="introduction">Storefront details</option><option value="shipping">Shipping & returns</option><option value="payments">Payments & fees</option><option value="terms">Seller Terms</option></select></label>
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      <section hidden={!["introduction", "shipping"].includes(selected)} className="store-panel store-settings">
        <form hidden={selected !== "introduction"} className="admin-form" id="store-introduction" onSubmit={submit}>
          <h3>Storefront details</h3>
          <input type="hidden" name="section" value="introduction" />

          <div className="form-row"><label>Store name<input name="storeName" required maxLength={120} disabled={disabled} defaultValue={store.storeName} /></label><label>Primary contact<input name="contactName" required maxLength={120} disabled={disabled} defaultValue={store.contactName} /></label></div>
          <label>Account email<input value={store.contactEmail} disabled /><span>Contact support to change the email that owns this store.</span></label>
          <label>Store introduction<textarea name="description" rows={4} minLength={30} maxLength={2000} required disabled={disabled} defaultValue={store.description} /><span>Tell buyers what you sell and why you collect or specialize in these models.</span></label>
          <label>Specialty<input name="specialty" required maxLength={300} disabled={disabled} defaultValue={store.specialty} placeholder="For example, Japanese 1:64 models and vintage racing cars" /></label>
          <label>How you pack models<textarea name="packingApproach" required minLength={20} maxLength={1000} rows={3} disabled={disabled} defaultValue={store.packingApproach} placeholder="Explain how you protect the model, included box, and accessories in transit." /></label>
          <div className="form-row"><label>Public shipping state or region<input name="shippingOriginRegion" required maxLength={80} disabled={disabled} defaultValue={store.shippingOriginRegion ?? ""} /></label><StoreCountrySelect value={store.shippingOriginCountry} disabled={disabled}/></div><p className="form-note">Only this region and country are public. Update your private ship-from address in Shipping after changing country.</p>
          <label>Website URL<input name="websiteUrl" type="url" disabled={disabled} defaultValue={store.websiteUrl ?? ""} /></label>
          <StoreLogoUpload initialUrl={store.logoUrl} disabled={disabled} onBusy={setLogoBusy}/>
          <button className="button dark small" disabled={disabled || logoBusy}>Save store introduction</button>
        </form>
        <form hidden={selected !== "shipping"} className="admin-form" id="shipping-options" onSubmit={submit}>
          <input type="hidden" name="section" value="shipping" />
          <h3>Set shipping options</h3>
          <div className="form-row"><label>Shipping model<select name="shippingMode" required disabled={disabled} defaultValue={store.shippingMode}><option value="calculated">Calculated carrier rates</option><option value="flat">Flat-rate shipping</option><option value="free">Free shipping</option></select></label><label>Handling time (business days)<input name="handlingTimeBusinessDays" type="number" min={1} max={10} required disabled={disabled} defaultValue={store.handlingTimeBusinessDays} /></label></div>
          <label>Flat-rate amount (USD)<input name="defaultShipping" inputMode="decimal" required disabled={disabled} defaultValue={(store.defaultShippingCents / 100).toFixed(2)} /><span>Used only when the shipping model is flat rate.</span></label>
          <h3>Ship-from address</h3>
          <p className="form-note">Your ship-from address is private and is used for carrier rates and labels.</p>
          <AddressFields ref={addressRef} fieldNames={SHIP_FROM_FIELD_NAMES} initialValues={shipFromAddressValues(store)} includePhone disabled={disabled} />
          <h3>Default package</h3>
          <div className="parcel-grid"><label>Length (in)<input name="defaultPackageLength" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageLength} /></label><label>Width (in)<input name="defaultPackageWidth" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWidth} /></label><label>Height (in)<input name="defaultPackageHeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageHeight} /></label><label>Weight (lb)<input name="defaultPackageWeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWeight} /></label></div>
          <label>Shipping policy<textarea name="shippingPolicySummary" required rows={4} maxLength={1000} disabled={disabled} defaultValue={store.shippingPolicySummary} /></label>
          <label>Return policy<textarea name="returnPolicySummary" rows={4} maxLength={1000} disabled={disabled} defaultValue={store.returnPolicySummary} /></label>
          <button className="button dark small" disabled={disabled}>Save shipping options</button>
        </form>
      </section>
      <section hidden={selected !== "payments"} className="store-panel payout-status"><h3>Payments</h3><p>Bank and identity details stay securely with Stripe.</p><Link className="button dark small" href="/store?view=payments">Open Payments</Link></section>
      <section hidden={selected !== "terms"} className="store-panel payout-status" id="seller-terms">
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
      <section hidden={selected !== "payments"} className="store-panel payout-status"><h3>{fee.rateKind === "founding_professional" ? "Founding Seller Rate" : "Professional Store Rate"} · {feePercent(fee.marketplaceFeeBps)} marketplace fee</h3>{fee.foundingPromotionActive && <p>Your promotional rate becomes the {feePercent(fee.standardMarketplaceFeeBps)} standard rate when the six-month period ends.</p>}<SellerFeeDisclosure marketplaceFeeBps={fee.marketplaceFeeBps} /><p>New-order proceeds become eligible {activeProtectionPolicy.deliveredDays} calendar days after confirmed delivery if no case is open and actual processing fees are available. See Payments for each order’s dates and holds.</p></section>
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

function date(value: string) {
  return formatUtcDate(value);
}

function feePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}
