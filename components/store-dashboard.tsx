"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  EditableProductImage,
  ProductImageFields,
} from "@/components/product-image-fields";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";

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
};

type Product = {
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
  status: string;
  primaryImageUrl: string | null;
  images: EditableProductImage[];
  keywords: string;
  updatedAt: string;
};

type OrderItem = {
  id: string;
  productTitleSnapshot: string;
  sellerSkuSnapshot: string;
  quantity: number;
  unitPriceCents: number;
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
  paymentProcessingFeeCents: number | null;
  sellerProceedsCents: number | null;
  totalCents: number;
  refundedAmountCents: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shipByAt: string | null;
  shipment: Shipment | null;
  items: OrderItem[];
};

type TrackingEvent = {
  id: string;
  status: string;
  statusDetails: string;
  statusDate: string;
  location: string;
};

type Shipment = {
  id: string;
  carrier: string;
  serviceLevel: string;
  rateAmountCents: number;
  currency: string;
  parcelLength: string;
  parcelWidth: string;
  parcelHeight: string;
  parcelWeight: string;
  declaredValueCents: number;
  insuranceRequired: boolean;
  signatureRequired: boolean;
  trackingNumber: string;
  trackingUrl: string | null;
  status: string;
  statusDetails: string;
  eta: string | null;
  combinedOrderIds: string[];
  events: TrackingEvent[];
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

type StoreData = {
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
  shipping: {
    configured: boolean;
    insuranceThresholdCents: number;
    signatureThresholdCents: number;
  };
};

const tabs = ["overview", "inventory", "orders", "analytics", "settings"] as const;
type Tab = (typeof tabs)[number];

export function StoreDashboard({
  data,
  initialView,
  initialProductId,
  email,
}: {
  data: StoreData;
  initialView: string;
  initialProductId?: string;
  email: string;
}) {
  const firstView = tabs.includes(initialView as Tab)
    ? (initialView as Tab)
    : initialProductId
      ? "inventory"
      : "overview";
  const [view, setView] = useState<Tab>(firstView);
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
    };
    if (!response.ok) {
      const nextError = body.error || "The store change could not be saved.";
      setError(nextError);
      throw new Error(nextError);
    }
    setMessage(options.message ?? "Saved.");
    if (options.reload) window.location.reload();
    return body;
  }

  function selectView(next: Tab) {
    setView(next);
    history.replaceState(null, "", `/store?view=${next}`);
  }

  return (
    <div className="store-layout">
      <aside className="store-sidebar">
        <Link className="store-brand" href="/">
          <span>MCC</span>
          <b>Store Console</b>
        </Link>
        <div className="store-identity">
          <p className="eyebrow">Professional seller</p>
          <h1>{data.store.storeName}</h1>
          <span>{email}</span>
          <span className={`status ${data.store.status}`}>
            {data.store.status}
          </span>
        </div>
        <nav aria-label="Store console sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={view === tab ? "active" : ""}
              onClick={() => selectView(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
              {tab === "orders" && data.analytics.unfulfilledOrders > 0 && (
                <span>{data.analytics.unfulfilledOrders}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="store-sidebar-links">
          <Link href={`/sellers/${data.store.slug}`}>View storefront</Link>
          <Link href="/account">My Garage</Link>
          <Link href="/marketplace">Back to marketplace</Link>
        </div>
      </aside>
      <main className="store-main">
        {suspended && (
          <div className="store-alert" role="alert">
            <b>Store access is read-only.</b>
            <p>
              This store is suspended. Contact Model Car Center support before
              changing inventory or fulfillment.
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
          <StoreOverview data={data} selectView={selectView} />
        )}
        {view === "inventory" && (
          <Inventory
            rows={data.inventory}
            initialProductId={initialProductId}
            disabled={suspended}
            action={action}
          />
        )}
        {view === "orders" && (
          <Orders
            rows={data.orders}
            store={data.store}
            shipping={data.shipping}
            disabled={suspended}
            action={action}
          />
        )}
        {view === "analytics" && <AnalyticsView analytics={data.analytics} />}
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

function StoreOverview({
  data,
  selectView,
}: {
  data: StoreData;
  selectView(view: Tab): void;
}) {
  const recent = data.orders.slice(0, 4);
  return (
    <div className="store-stack">
      <header className="store-page-heading">
        <div>
          <p className="eyebrow">Store overview</p>
          <h2>Welcome back, {data.store.contactName.split(" ")[0]}.</h2>
        </div>
        <button className="button dark small" onClick={() => selectView("inventory")}>
          Add inventory
        </button>
      </header>
      <div className="metric-grid store-metrics">
        <article>
          <span>Gross sales</span>
          <b>{formatMoney(data.analytics.grossSalesCents)}</b>
          <small>Paid item totals</small>
        </article>
        <article>
          <span>Orders to fulfill</span>
          <b>{data.analytics.unfulfilledOrders}</b>
          <button onClick={() => selectView("orders")}>Manage orders</button>
        </article>
        <article>
          <span>Active inventory</span>
          <b>{data.analytics.activeListings}</b>
          <small>{data.analytics.lowStock} low-stock items</small>
        </article>
        <article>
          <span>Units sold</span>
          <b>{data.analytics.unitsSold}</b>
          <small>{data.analytics.paidOrders} paid orders</small>
        </article>
      </div>
      <section className="store-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2>Latest orders</h2>
          </div>
          <button className="text-button" onClick={() => selectView("orders")}>
            View all orders
          </button>
        </div>
        {recent.length ? (
          <div className="store-order-summary">
            {recent.map((order) => (
              <article key={order.id}>
                <div>
                  <b>{order.orderNumber}</b>
                  <span>{date(order.createdAt)}</span>
                </div>
                <p>{order.items.map((item) => item.productTitleSnapshot).join(", ")}</p>
                <div>
                  <span className={`status ${order.fulfillmentStatus}`}>
                    {order.fulfillmentStatus}
                  </span>
                  <b>{formatMoney(order.totalCents, order.currency)}</b>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="store-empty">Your first orders will appear here.</p>
        )}
      </section>
    </div>
  );
}

function Inventory({
  rows,
  initialProductId,
  disabled,
  action,
}: {
  rows: Product[];
  initialProductId?: string;
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const initial = rows.find((row) => row.id === initialProductId) ?? null;
  const [editing, setEditing] = useState<Product | "new" | null>(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesSearch = `${row.title} ${row.sellerSku} ${row.vehicleMake} ${row.vehicleModel}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesSearch && (filter === "all" || row.status === filter);
      }),
    [filter, rows, search],
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
            {rows.reduce(
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
      <InventoryImporter disabled={disabled} action={action} />
      {editing && (
        <ProductEditor
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
  product,
  action,
  onClose,
}: {
  product: Product | null;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState(product?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(product?.images ?? []);
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            if (processedCount === 1) setPrimaryUploadFinished(true);
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
    setImages((current) => current.filter((image) => image.id !== imageId));
  }
  return (
    <div className="store-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="store-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inventory item</p>
            <h2 id="product-editor-title">{product ? "Edit product" : "Add product"}</h2>
          </div>
          <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form className="admin-form" onSubmit={submit}>
          <div className="form-row">
            <label>Seller SKU<input name="sellerSku" required maxLength={100} defaultValue={product?.sellerSku ?? ""} /></label>
            <label>Title<input name="title" required maxLength={200} defaultValue={product?.title ?? ""} /></label>
          </div>
          <label>Description<textarea name="description" rows={4} maxLength={4000} defaultValue={product?.description ?? ""} /></label>
          <div className="form-row">
            <label>Scale<input name="scale" required maxLength={30} placeholder="1:18" defaultValue={product?.scale ?? "1:18"} /></label>
            <label>Model manufacturer<input name="modelManufacturer" required maxLength={100} defaultValue={product?.modelManufacturer ?? ""} /></label>
          </div>
          <div className="form-row">
            <label>Vehicle make<input name="vehicleMake" required maxLength={100} defaultValue={product?.vehicleMake ?? ""} /></label>
            <label>Vehicle model<input name="vehicleModel" required maxLength={120} defaultValue={product?.vehicleModel ?? ""} /></label>
          </div>
          <div className="form-row">
            <label>Vehicle year<input name="vehicleYear" maxLength={20} defaultValue={product?.vehicleYear ?? ""} /></label>
            <label>Color<input name="color" maxLength={80} defaultValue={product?.color ?? ""} /></label>
          </div>
          <div className="form-row">
            <label>Price (USD)<input name="price" inputMode="decimal" required defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""} /></label>
            <label>Inventory quantity<input name="inventoryQuantity" type="number" min={product?.reservedQuantity ?? 0} max={1000000} required defaultValue={product?.inventoryQuantity ?? 1} /></label>
          </div>
          <fieldset><legend>Package override (optional)</legend><p className="form-note">Leave all four blank to use the store default package for calculated checkout rates.</p><div className="parcel-grid"><label>Length (in)<input name="packageLength" inputMode="decimal" defaultValue={product?.packageLength ?? ""} /></label><label>Width (in)<input name="packageWidth" inputMode="decimal" defaultValue={product?.packageWidth ?? ""} /></label><label>Height (in)<input name="packageHeight" inputMode="decimal" defaultValue={product?.packageHeight ?? ""} /></label><label>Weight (lb)<input name="packageWeight" inputMode="decimal" defaultValue={product?.packageWeight ?? ""} /></label></div></fieldset>
          <CollectibleListingFields product={product}/>
          <ProductImageFields
            images={images}
            primaryImageUrl={product?.primaryImageUrl}
            files={files}
            disabled={busy}
            onFilesChange={setFiles}
            onRemove={productId ? removeImage : undefined}
          />
          <RequiredPhotoChecklist product={product}/>
          <label>Search keywords<input name="keywords" maxLength={1000} defaultValue={product?.keywords ?? ""} /></label>
          {imageError && <p className="form-error" role="alert">{imageError}</p>}
          {product && product.reservedQuantity > 0 && <p className="form-note">Inventory cannot be reduced below {product.reservedQuantity} reserved units.</p>}
          <div className="row-actions">
            <button className="button dark small" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Create draft"}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
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
  store,
  shipping,
  disabled,
  action,
}: {
  rows: StoreOrder[];
  store: Store;
  shipping: StoreData["shipping"];
  disabled: boolean;
  action(
    payload: Record<string, unknown>,
    options?: { reload?: boolean; message?: string },
  ): Promise<Record<string, unknown>>;
}) {
  const [filter, setFilter] = useState("open");
  const urgentCount = rows.filter((order) =>
    ["overdue", "due_today", "due_soon"].includes(
      orderHandlingReminder(order).level,
    ),
  ).length;
  const visible = rows.filter((order) =>
    filter === "all"
      ? true
      : filter === "open"
        ? ["paid", "partially_refunded"].includes(order.paymentStatus) && ["unfulfilled", "processing"].includes(order.fulfillmentStatus)
        : order.fulfillmentStatus === filter || order.paymentStatus === filter,
  );
  return (
    <div className="store-stack">
      <header className="store-page-heading">
        <div><p className="eyebrow">Fulfillment</p><h2>Orders</h2><p>Compare protected carrier rates, print labels, and follow tracking events.</p>{urgentCount > 0 && <p className="handling-summary"><b>{urgentCount} handling reminder{urgentCount === 1 ? "" : "s"}</b> need attention.</p>}</div>
        <select aria-label="Filter orders" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="open">Needs fulfillment</option><option value="all">All orders</option><option value="shipped">Shipped</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option>
        </select>
      </header>
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
                {order.items.map((item) => <p key={item.id}><b>{item.productTitleSnapshot}</b><br /><span>{item.sellerSkuSnapshot} · {item.quantity} × {formatMoney(item.unitPriceCents, order.currency)}</span></p>)}
                <dl className="store-order-totals"><div><dt>Items</dt><dd>{formatMoney(order.subtotalCents, order.currency)}</dd></div><div><dt>Shipping</dt><dd>{formatMoney(order.shippingCents, order.currency)}</dd></div>{order.taxCents > 0 && <div><dt>Tax</dt><dd>{formatMoney(order.taxCents, order.currency)}</dd></div>}<div><dt>Model Car Center fee ({feePercent(order.marketplaceFeeBps)})</dt><dd>−{formatMoney(order.platformFeeCents, order.currency)}</dd></div><div><dt>Payment processing</dt><dd>{order.paymentProcessingFeeCents == null ? "Recorded by Stripe after settlement" : `${formatMoney(order.paymentProcessingFeeCents, order.currency)} paid separately by Model Car Center`}</dd></div><div><dt>Seller proceeds</dt><dd>{order.sellerProceedsCents == null ? "Not recorded for this order" : formatMoney(order.sellerProceedsCents, order.currency)}</dd></div></dl>
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
    <section className="shipment-details">
      <p><b>Tracking</b><br />{shipment.carrier} · {shipment.trackingNumber}</p>
      <p><span className={`status ${shipment.status}`}>{shipment.status.replaceAll("_", " ")}</span> {shipment.serviceLevel}</p>
      {shipment.statusDetails && <p>{shipment.statusDetails}</p>}
      {shipment.combinedOrderIds.length > 1 && <p><b>Combined shipment:</b> {shipment.combinedOrderIds.length} orders share this label.</p>}
      <p>{shipment.parcelLength} × {shipment.parcelWidth} × {shipment.parcelHeight} in · {shipment.parcelWeight} lb<br />{shipment.insuranceRequired ? `Insured for ${formatMoney(shipment.declaredValueCents)}` : "No added insurance"} · {shipment.signatureRequired ? "Signature required" : "No signature"}</p>
      <div className="row-actions"><a className="button dark small" href={`/api/shipping/label?shipment_id=${encodeURIComponent(shipment.id)}`} target="_blank" rel="noreferrer">Print 4×6 label</a>{shipment.trackingUrl && <a className="button outline small" href={shipment.trackingUrl} target="_blank" rel="noreferrer">Carrier tracking</a>}<button className="button outline small" disabled={busy} onClick={() => void sync()}>{busy ? "Refreshing…" : "Refresh events"}</button></div>
      {shipment.events.length > 0 && <ol className="tracking-events">{shipment.events.slice(0, 5).map((event) => <li key={event.id}><b>{event.status.replaceAll("_", " ")}</b><span>{event.statusDetails || "Carrier update"}</span><small>{dateTime(event.statusDate)}{formatTrackingLocation(event.location) ? ` · ${formatTrackingLocation(event.location)}` : ""}</small></li>)}</ol>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {order.fulfillmentStatus === "processing" && <p className="form-note">A label is ready, but handling remains open until the carrier records the package in transit.</p>}
    </section>
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
  return (
    <div className="store-stack">
      <header className="store-page-heading"><div><p className="eyebrow">Performance</p><h2>Store analytics</h2><p>Lifetime totals and a rolling six-month sales view.</p></div></header>
      <div className="metric-grid store-metrics analytics-metrics">
        <article><span>Gross sales</span><b>{formatMoney(analytics.grossSalesCents)}</b><small>Before marketplace fees</small></article>
        <article><span>Net item sales</span><b>{formatMoney(analytics.netSalesCents)}</b><small>{formatMoney(analytics.platformFeesCents)} in fees</small></article>
        <article><span>Average order</span><b>{formatMoney(analytics.averageOrderCents)}</b><small>{analytics.paidOrders} paid orders</small></article>
        <article><span>Inventory value</span><b>{formatMoney(analytics.inventoryValueCents)}</b><small>Available units at list price</small></article>
      </div>
      <div className="store-analytics-grid">
        <section className="store-panel">
          <p className="eyebrow">Last six months</p><h3>Gross item sales</h3>
          <div className="sales-bars">
            {analytics.monthlySales.map((month) => <div key={month.key}><div><span>{month.label}</span><b>{formatMoney(month.grossCents)}</b></div><div className="sales-bar-track"><span style={{ width: `${(month.grossCents / max) * 100}%` }} /></div><small>{month.orders} order{month.orders === 1 ? "" : "s"}</small></div>)}
          </div>
        </section>
        <section className="store-panel">
          <p className="eyebrow">Product performance</p><h3>Top products</h3>
          {analytics.topProducts.length ? <ol className="top-products">{analytics.topProducts.map((product) => <li key={product.title}><div><b>{product.title}</b><span>{product.units} units</span></div><b>{formatMoney(product.revenueCents)}</b></li>)}</ol> : <p className="store-empty">Product performance appears after your first paid order.</p>}
        </section>
      </div>
    </div>
  );
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action(
      { action: "save_store", ...Object.fromEntries(new FormData(event.currentTarget)) },
      { reload: true, message: "Store profile updated." },
    );
  }
  return (
    <div className="store-stack">
      <header className="store-page-heading"><div><p className="eyebrow">Storefront</p><h2>Store settings</h2><p>Update the public details and policies customers see.</p></div></header>
      <section className="store-panel store-settings">
        <form className="admin-form" onSubmit={submit}>
          <div className="form-row"><label>Store name<input name="storeName" required maxLength={120} disabled={disabled} defaultValue={store.storeName} /></label><label>Primary contact<input name="contactName" required maxLength={120} disabled={disabled} defaultValue={store.contactName} /></label></div>
          <label>Account email<input value={store.contactEmail} disabled /><span>Contact support to change the email that owns this store.</span></label>
          <label>Store description<textarea name="description" rows={5} maxLength={2000} disabled={disabled} defaultValue={store.description} /></label>
          <div className="form-row"><label>Website URL<input name="websiteUrl" type="url" disabled={disabled} defaultValue={store.websiteUrl ?? ""} /></label><label>Logo URL<input name="logoUrl" type="url" disabled={disabled} defaultValue={store.logoUrl ?? ""} /></label></div>
          <div className="form-row"><label>Shipping model<select name="shippingMode" required disabled={disabled} defaultValue={store.shippingMode}><option value="calculated">Calculated carrier rates</option><option value="flat">Flat-rate shipping</option><option value="free">Free shipping</option></select></label><label>Handling time (business days)<input name="handlingTimeBusinessDays" type="number" min={1} max={10} required disabled={disabled} defaultValue={store.handlingTimeBusinessDays} /></label></div>
          <label>Flat-rate amount (USD)<input name="defaultShipping" inputMode="decimal" required disabled={disabled} defaultValue={(store.defaultShippingCents / 100).toFixed(2)} /><span>Used only when the shipping model is flat rate.</span></label>
          <h3>Ship-from address</h3>
          <p className="form-note">This protected address is sent only to carriers for rates and labels.</p>
          <label>Street address<input name="shippingOriginStreet1" required maxLength={200} disabled={disabled} defaultValue={store.shippingOriginStreet1 ?? ""} /></label>
          <label>Apartment, suite, or unit<input name="shippingOriginStreet2" maxLength={200} disabled={disabled} defaultValue={store.shippingOriginStreet2 ?? ""} /></label>
          <div className="form-row"><label>City<input name="shippingOriginCity" required maxLength={120} disabled={disabled} defaultValue={store.shippingOriginCity ?? ""} /></label><label>State or region<input name="shippingOriginRegion" required maxLength={80} disabled={disabled} defaultValue={store.shippingOriginRegion ?? ""} /></label></div>
          <div className="form-row"><label>Postal code<input name="shippingOriginPostalCode" required maxLength={20} disabled={disabled} defaultValue={store.shippingOriginPostalCode ?? ""} /></label><label>Country code<input name="shippingOriginCountry" required maxLength={2} disabled={disabled} defaultValue={store.shippingOriginCountry} /></label></div>
          <label>Carrier contact phone<input name="shippingOriginPhone" type="tel" required maxLength={50} disabled={disabled} defaultValue={store.shippingOriginPhone ?? ""} /></label>
          <h3>Default package</h3>
          <div className="parcel-grid"><label>Length (in)<input name="defaultPackageLength" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageLength} /></label><label>Width (in)<input name="defaultPackageWidth" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWidth} /></label><label>Height (in)<input name="defaultPackageHeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageHeight} /></label><label>Weight (lb)<input name="defaultPackageWeight" inputMode="decimal" required disabled={disabled} defaultValue={store.defaultPackageWeight} /></label></div>
          <label>Shipping policy<textarea name="shippingPolicySummary" rows={4} maxLength={1000} disabled={disabled} defaultValue={store.shippingPolicySummary} /></label>
          <label>Return policy<textarea name="returnPolicySummary" rows={4} maxLength={1000} disabled={disabled} defaultValue={store.returnPolicySummary} /></label>
          <button className="button dark small" disabled={disabled}>Save store settings</button>
        </form>
      </section>
      <section className="store-panel payout-status"><p className="eyebrow">Payout account</p><h3>Stripe Connect</h3><p><span className={`status ${store.stripeChargesEnabled ? "active" : "onboarding"}`}>Charges {store.stripeChargesEnabled ? "enabled" : "pending"}</span> <span className={`status ${store.stripePayoutsEnabled ? "active" : "onboarding"}`}>Payouts {store.stripePayoutsEnabled ? "enabled" : "pending"}</span></p><p>Bank and identity details remain securely hosted by Stripe. Contact Model Car Center if you need a fresh onboarding link.</p></section>
      <section className="store-panel payout-status"><p className="eyebrow">Selling fees</p><h3>{fee.rateKind === "founding_professional" ? "Founding Seller Rate" : "Professional Store Rate"} — {feePercent(fee.marketplaceFeeBps)} marketplace fee</h3>{fee.foundingPromotionActive && <p>Your promotional rate is active. It automatically becomes the {feePercent(fee.standardMarketplaceFeeBps)} standard professional rate when the six-month period ends.</p>}<p><b>Payment processing is charged separately.</b> Under the current Stripe destination-charge setup, Model Car Center pays Stripe processing fees; recorded order details show those costs separately from your marketplace fee.</p><p>No listing fees. No monthly marketplace subscription for V1.</p></section>
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

function formatTrackingLocation(value: string) {
  try {
    const location = JSON.parse(value) as {
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    return [location.city, location.state, location.zip, location.country]
      .filter(Boolean)
      .join(", ");
  } catch {
    return "";
  }
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
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
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function feePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}
