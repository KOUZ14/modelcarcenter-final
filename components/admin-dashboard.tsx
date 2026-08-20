"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { modelHuntMatches } from "@/lib/business";
import { formatMoney as money } from "@/lib/format";
import {
  EditableProductImage,
  ProductImageFields,
} from "@/components/product-image-fields";
import { uploadProductPhotoFiles } from "@/lib/upload-client";
import {
  CollectibleListingFields,
  RequiredPhotoChecklist,
} from "@/components/collectible-listing-fields";

type AdminData = Record<string, unknown> & { section?: string };
const tabs = [
  "overview",
  "sellers",
  "products",
  "import",
  "hunts",
  "orders",
  "resolution",
] as const;

export function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview");
  const [data, setData] = useState<AdminData>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionLink, setActionLink] = useState("");
  const apiSection = tab === "import" ? "products" : tab;
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin?section=${apiSection}`);
      const body = (await response.json()) as AdminData & { error?: string };
      if (!response.ok)
        throw new Error(body.error || "Admin data unavailable.");
      setData(body);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Admin data unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiSection]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function action(payload: Record<string, unknown>) {
    setMessage("");
    setError("");
    setActionLink("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as Record<string, unknown> & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Action failed.");
      setMessage(
        body.onboardingUrl
          ? body.emailSent
            ? "Onboarding link created and emailed to the seller."
            : "Onboarding link created, but email is not configured. Send the link manually."
          : "Saved successfully.",
      );
      if (typeof body.onboardingUrl === "string")
        setActionLink(body.onboardingUrl);
      await load();
      return body;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
      throw reason;
    }
  }
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <Link className="brand" href="/">
            <span className="brand-mark">MCC</span>
            <span className="brand-name">
              MODEL CAR <b>CENTER</b>
            </span>
          </Link>
          <span>Founder admin</span>
        </div>
        <div>
          <span>{adminEmail}</span>
          <a href="/signout-with-chatgpt?return_to=/">Sign out</a>
        </div>
      </header>
      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => {
              setLoading(true);
              setTab(item);
              setMessage("");
              setError("");
              setActionLink("");
            }}
          >
            {item === "hunts" ? "Model Hunts" : item}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        <div className="admin-title">
          <p className="eyebrow">Founder-operated V1</p>
          <h1>
            {tab === "hunts"
              ? "Model Hunts"
              : tab[0].toUpperCase() + tab.slice(1)}
          </h1>
        </div>
        {message && (
          <p className="admin-message" role="status">
            {message}
            {actionLink && (
              <>
                {" "}
                <a href={actionLink} rel="noreferrer">
                  Open secure onboarding link
                </a>
              </>
            )}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="catalog-status">Loading…</div>
        ) : (
          <AdminSection tab={tab} data={data} action={action} />
        )}
      </main>
    </div>
  );
}

function AdminSection({
  tab,
  data,
  action,
}: {
  tab: string;
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  if (tab === "overview") return <Overview data={data} />;
  if (tab === "sellers") return <Sellers data={data} action={action} />;
  if (tab === "products") return <Products data={data} action={action} />;
  if (tab === "import") return <Importer data={data} action={action} />;
  if (tab === "hunts") return <Hunts data={data} action={action} />;
  if (tab === "orders") return <Orders data={data} action={action} />;
  return <ResolutionCases data={data} action={action} />;
}

function Overview({ data }: { data: AdminData }) {
  const counts = (data.counts as Record<string, number>) ?? {};
  const demand =
    (data.demand as Record<
      string,
      Array<{ label: string | null; count: number }>
    >) ?? {};
  return (
    <>
      <div className="metric-grid">
        {Object.entries(counts).map(([key, value]) => (
          <article key={key}>
            <span>{key.replace(/([A-Z])/g, " $1")}</span>
            <b>{value}</b>
          </article>
        ))}
      </div>
      <div className="demand-grid">
        {Object.entries(demand).map(([key, rows]) => (
          <section key={key}>
            <h2>Most requested {key}</h2>
            {rows.length ? (
              <ol>
                {rows.map((row) => (
                  <li key={row.label ?? "unspecified"}>
                    <span>{row.label || "Unspecified"}</span>
                    <b>{row.count}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No open demand yet.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

type Seller = {
  id: string;
  storeName: string;
  contactName: string;
  contactEmail: string;
  slug: string;
  status: string;
  stripeAccountId?: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  defaultShippingCents: number;
  description: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  shippingPolicySummary: string;
  returnPolicySummary: string;
  sellerType?: string;
  ownerUserId?: string | null;
  isFoundingSeller: boolean;
  foundingRateStartsAt?: string | null;
  foundingRateEndsAt?: string | null;
  marketplaceFeeBps: number;
  standardMarketplaceFeeBps: number;
  foundingPromotionActive: boolean;
};
function Sellers({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const applications =
    (data.applications as Array<Record<string, string | number>>) ?? [];
  const sellerRows = (data.sellers as Seller[]) ?? [];
  const [editing, setEditing] = useState<Seller | null>(null);
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Seller applications</h2>
        {applications.length ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Contact</th>
                  <th>Channels / inventory</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={String(app.id)}>
                    <td>
                      <b>{app.storeName}</b>
                      <br />
                      {app.website && (
                        <a href={String(app.website)}>{app.website}</a>
                      )}
                      <br />
                      {app.message}
                    </td>
                    <td>
                      {app.contactName}
                      <br />
                      {app.email}
                    </td>
                    <td>
                      {app.currentSellingChannels}
                      <br />
                      {app.approximateInventorySize} models
                    </td>
                    <td>{app.status}</td>
                    <td>
                      {app.status === "pending" && (
                        <div className="row-actions">
                          <button
                            onClick={() =>
                              void action({
                                action: "approve_application",
                                applicationId: app.id,
                              })
                            }
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              void action({
                                action: "reject_application",
                                applicationId: app.id,
                              })
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No applications.</p>
        )}
      </section>
      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Sellers</h2>
          <button
            className="button dark small"
            onClick={() => setEditing(emptySeller())}
          >
            Create seller
          </button>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Type / rate</th>
                <th>Founding program</th>
                <th>Stripe</th>
                <th>Shipping</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellerRows.map((seller) => (
                <tr key={seller.id}>
                  <td>
                    <b>{seller.storeName}</b>
                    <br />
                    {seller.contactEmail}
                    <br />
                    <span className={`status ${seller.status}`}>
                      {seller.status}
                    </span>
                    {seller.sellerType !== "collector" && (
                      <small>
                        {seller.ownerUserId
                          ? "Store account linked"
                          : "Awaiting store sign-in"}
                      </small>
                    )}
                  </td>
                  <td>
                    <b>
                      {seller.sellerType === "collector"
                        ? "Collector"
                        : "Professional store"}
                    </b>
                    <br />
                    Standard {feePercent(seller.standardMarketplaceFeeBps)}
                    <br />
                    <span className="status active">
                      Current {feePercent(seller.marketplaceFeeBps)}
                    </span>
                  </td>
                  <td>
                    {seller.isFoundingSeller ? (
                      <>
                        <b>
                          {seller.foundingPromotionActive
                            ? "Active"
                            : "Founding history retained"}
                        </b>
                        <br />
                        <small>
                          {shortDate(seller.foundingRateStartsAt)} â€“{" "}
                          {shortDate(seller.foundingRateEndsAt)}
                        </small>
                      </>
                    ) : seller.sellerType === "professional" ? (
                      <button
                        onClick={() =>
                          void action({
                            action: "assign_founding_seller",
                            sellerId: seller.id,
                          })
                        }
                      >
                        Assign 6-month rate
                      </button>
                    ) : (
                      <small>Not eligible</small>
                    )}
                  </td>
                  <td>
                    {seller.stripeAccountId || "Not created"}
                    <br />
                    Charges {seller.stripeChargesEnabled ? "✓" : "—"} · Payouts{" "}
                    {seller.stripePayoutsEnabled ? "✓" : "—"}
                  </td>
                  <td>{money(seller.defaultShippingCents)}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setEditing(seller)}>Edit</button>
                      {["approved", "onboarding"].includes(seller.status) && (
                        <button
                          onClick={() =>
                            void action({
                              action: "stripe_onboarding",
                              sellerId: seller.id,
                            })
                          }
                        >
                          Send onboarding
                        </button>
                      )}
                      {seller.stripeAccountId && (
                        <button
                          onClick={() =>
                            void action({
                              action: "refresh_stripe",
                              sellerId: seller.id,
                            })
                          }
                        >
                          Refresh Stripe
                        </button>
                      )}
                      {seller.status === "active" ? (
                        <button
                          onClick={() =>
                            void action({
                              action: "seller_status",
                              sellerId: seller.id,
                              status: "suspended",
                            })
                          }
                        >
                          Suspend
                        </button>
                      ) : (
                        seller.stripeChargesEnabled &&
                        seller.stripePayoutsEnabled && (
                          <button
                            onClick={() =>
                              void action({
                                action: "seller_status",
                                sellerId: seller.id,
                                status: "active",
                              })
                            }
                          >
                            Activate
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <SellerEditor
          seller={editing}
          onClose={() => setEditing(null)}
          action={action}
        />
      )}
    </div>
  );
}
function emptySeller(): Seller {
  return {
    id: "",
    storeName: "",
    contactName: "",
    contactEmail: "",
    slug: "",
    status: "approved",
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    defaultShippingCents: 0,
    description: "",
    shippingPolicySummary: "",
    returnPolicySummary: "",
    sellerType: "professional",
    ownerUserId: null,
    isFoundingSeller: false,
    marketplaceFeeBps: 0,
    standardMarketplaceFeeBps: 0,
    foundingPromotionActive: false,
  };
}
function SellerEditor({
  seller,
  onClose,
  action,
}: {
  seller: Seller;
  onClose(): void;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action({
      action: "save_seller",
      ...Object.fromEntries(new FormData(event.currentTarget).entries()),
      id: seller.id,
    });
    onClose();
  }
  return (
    <div className="admin-panel">
      <h2>{seller.id ? "Edit" : "Create"} seller</h2>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-row">
          <label>
            Store name
            <input name="storeName" required defaultValue={seller.storeName} />
          </label>
          <label>
            Slug
            <input name="slug" defaultValue={seller.slug} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Contact name
            <input
              name="contactName"
              required
              defaultValue={seller.contactName}
            />
          </label>
          <label>
            Contact email
            <input
              name="contactEmail"
              required
              type="email"
              defaultValue={seller.contactEmail}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Website URL
            <input
              name="websiteUrl"
              type="url"
              defaultValue={seller.websiteUrl ?? ""}
            />
          </label>
          <label>
            Logo URL
            <input
              name="logoUrl"
              type="url"
              defaultValue={seller.logoUrl ?? ""}
            />
          </label>
        </div>
        <label>
          Description
          <textarea name="description" defaultValue={seller.description} />
        </label>
        <label>
          Default shipping, cents
          <input
            name="defaultShippingCents"
            type="number"
            min="0"
            required
            defaultValue={seller.defaultShippingCents}
          />
        </label>
        <label>
          Shipping summary
          <textarea
            name="shippingPolicySummary"
            defaultValue={seller.shippingPolicySummary}
          />
        </label>
        <label>
          Return summary
          <textarea
            name="returnPolicySummary"
            defaultValue={seller.returnPolicySummary}
          />
        </label>
        <div className="row-actions">
          <button className="button dark small">Save seller</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

type AdminProduct = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerSku: string;
  title: string;
  description?: string;
  slug: string;
  scale: string;
  modelManufacturer: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: string | null;
  color?: string | null;
  condition?: string;
  modelCondition: string;
  packagingCondition: string;
  originalBoxStatus: string;
  missingParts: string;
  defects: string;
  restorationCustomization: string;
  material: string;
  productNumber?: string | null;
  editionSerial?: string | null;
  coaStatus: string;
  accessories: string;
  provenance: string;
  photoFrontChecked: boolean;
  photoRearChecked: boolean;
  photoSidesChecked: boolean;
  photoBaseChecked: boolean;
  photoPackagingChecked: boolean;
  photoIssuesChecked: boolean;
  keywords?: string;
  priceCents: number;
  inventoryQuantity: number;
  reservedQuantity: number;
  status: string;
  primaryImageUrl?: string | null;
  rejectionReason?: string | null;
  sellerType?: string;
  sellerEmail?: string;
  sellerStatus?: string;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  images?: EditableProductImage[];
};
function Products({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const sellerRows =
    (data.sellers as Array<{ id: string; name: string }>) ?? [];
  const [query, setQuery] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const visible = useMemo(
    () =>
      ((data.products as AdminProduct[]) ?? []).filter(
        (product) =>
          (!sellerFilter || product.sellerId === sellerFilter) &&
          `${product.title} ${product.sellerSku} ${product.vehicleMake} ${product.vehicleModel}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data.products, query, sellerFilter],
  );
  const awaitingReview = visible.filter(
    (product) => product.sellerType === "collector" && product.status === "pending_review",
  );
  function reject(productId: string) {
    const reason = window.prompt("Optional rejection reason for the collector:") ?? "";
    void action({ action: "product_review", productId, decision: "reject", reason });
  }
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manual moderation</p>
            <h2>Collector Listings Awaiting Review</h2>
          </div>
          <b>{awaitingReview.length}</b>
        </div>
        {awaitingReview.length ? (
          <div className="review-grid">
            {awaitingReview.map((product) => (
              <article key={product.id}>
                {product.images?.[0] && (
                  <Image src={product.images[0].url} alt={product.images[0].alt} width={240} height={190} unoptimized />
                )}
                <div>
                  <span className="status pending_review">Awaiting Review</span>
                  <h3>{product.title}</h3>
                  <p>{product.scale} · {product.modelManufacturer} · model {product.modelCondition.replaceAll("_", " ")} · packaging {product.packagingCondition.replaceAll("_", " ")}</p>
                  <p><b>Disclosures:</b> Missing parts: {product.missingParts}; defects: {product.defects}; restoration/customization: {product.restorationCustomization}</p>
                  <p>{product.sellerName} · {product.sellerEmail}</p>
                  <p>{money(product.priceCents)} · {product.inventoryQuantity} available</p>
                  <div className="row-actions">
                    <button onClick={() => void action({ action: "product_review", productId: product.id, decision: "approve" })}>Approve</button>
                    <button onClick={() => reject(product.id)}>Reject</button>
                    <button onClick={() => void action({ action: "product_status", productId: product.id, status: "inactive" })}>Suspend listing</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <p>No collector listings are waiting for review.</p>}
      </section>
      <section className="admin-panel">
        <div className="panel-heading">
          <h2>Products</h2>
          <button
            className="button dark small"
            onClick={() => setEditing(emptyProduct(sellerRows[0]?.id ?? ""))}
          >
            Create product
          </button>
        </div>
        <div className="admin-filters">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
          />
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="">All sellers</option>
            {sellerRows.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Seller</th>
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
                    <br />
                    {product.sellerSku} · {product.scale} ·{" "}
                    {product.modelManufacturer}
                  </td>
                  <td>{product.sellerName}</td>
                  <td>{money(product.priceCents)}</td>
                  <td>
                    {product.inventoryQuantity} total /{" "}
                    {product.reservedQuantity} reserved
                  </td>
                  <td>
                    <span className={`status ${product.status}`}>
                      {product.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setEditing(product)}>Edit</button>
                      {product.status === "active" ? (
                        <button
                          onClick={() =>
                            void action({
                              action: "product_status",
                              productId: product.id,
                              status: "inactive",
                            })
                          }
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            void action({
                              action: "product_status",
                              productId: product.id,
                              status: "active",
                            })
                          }
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <ProductEditor
          product={editing}
          sellers={sellerRows}
          action={action}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function emptyProduct(sellerId: string): AdminProduct {
  return {
    id: "",
    sellerId,
    sellerName: "",
    sellerSku: "",
    title: "",
    slug: "",
    scale: "1:18",
    modelManufacturer: "",
    vehicleMake: "",
    vehicleModel: "",
    modelCondition: "",
    packagingCondition: "",
    originalBoxStatus: "",
    missingParts: "",
    defects: "",
    restorationCustomization: "",
    material: "",
    coaStatus: "",
    accessories: "",
    provenance: "",
    photoFrontChecked: false,
    photoRearChecked: false,
    photoSidesChecked: false,
    photoBaseChecked: false,
    photoPackagingChecked: false,
    photoIssuesChecked: false,
    priceCents: 0,
    inventoryQuantity: 1,
    reservedQuantity: 0,
    status: "draft",
  };
}
function ProductEditor({
  product,
  sellers,
  action,
  onClose,
}: {
  product: AdminProduct;
  sellers: Array<{ id: string; name: string }>;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState(product.id);
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(product.images ?? []);
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setImageError("");
    try {
      const form = new FormData(event.currentTarget);
      form.delete("images");
      const result = await action({
        action: "save_product",
        ...Object.fromEntries(form.entries()),
        id: productId,
      });
      const savedProductId = String(result.productId ?? "");
      setProductId(savedProductId);
      if (files.length && savedProductId) {
        let nextImages = images;
        await uploadProductPhotoFiles({
          endpoint: "/api/admin/images",
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
        window.location.reload();
        return;
      }
      onClose();
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
    const response = await fetch("/api/admin/images", {
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
    <section className="admin-panel">
      <h2>{product.id ? "Edit" : "Create"} product</h2>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-row">
          <label>
            Seller
            <select name="sellerId" required defaultValue={product.sellerId}>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seller SKU
            <input name="sellerSku" required defaultValue={product.sellerSku} />
          </label>
        </div>
        <label>
          Title
          <input name="title" required defaultValue={product.title} />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={product.description ?? ""}
          />
        </label>
        <div className="form-row">
          <label>
            Scale
            <input name="scale" required defaultValue={product.scale} />
          </label>
          <label>
            Model manufacturer
            <input
              name="modelManufacturer"
              required
              defaultValue={product.modelManufacturer}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Vehicle make
            <input
              name="vehicleMake"
              required
              defaultValue={product.vehicleMake}
            />
          </label>
          <label>
            Vehicle model
            <input
              name="vehicleModel"
              required
              defaultValue={product.vehicleModel}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Vehicle year
            <input
              name="vehicleYear"
              defaultValue={product.vehicleYear ?? ""}
            />
          </label>
          <label>
            Color
            <input name="color" defaultValue={product.color ?? ""} />
          </label>
        </div>
        <CollectibleListingFields product={product} />
        <div className="form-row">
          <label>
            Price, cents
            <input
              name="priceCents"
              type="number"
              min="0"
              required
              defaultValue={product.priceCents}
            />
          </label>
        </div>
        <label>
          Inventory quantity
          <input
            name="inventoryQuantity"
            type="number"
            min={product.reservedQuantity}
            required
            defaultValue={product.inventoryQuantity}
          />
        </label>
        <ProductImageFields
          images={images}
          primaryImageUrl={product.primaryImageUrl}
          files={files}
          disabled={busy}
          onFilesChange={setFiles}
          onRemove={productId ? removeImage : undefined}
        />
        <RequiredPhotoChecklist product={product} />
        <label>
          Keywords
          <input name="keywords" defaultValue={product.keywords ?? ""} />
        </label>
        {imageError && <p className="form-error" role="alert">{imageError}</p>}
        <div className="row-actions">
          <button className="button dark small" disabled={busy}>
            {busy
              ? "Saving…"
              : `Save as ${product.status === "active" ? "current status" : "draft"}`}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function Importer({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const sellers = (data.sellers as Array<{ id: string; name: string }>) ?? [];
  const [sellerId, setSellerId] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{
    valid: Array<Record<string, unknown>>;
    errors: Array<{ row: number; errors: string[] }>;
    validCount: number;
  } | null>(null);
  async function readFile(file?: File) {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
  }
  async function validate() {
    const result = await action({ action: "preview_import", sellerId, csv });
    setPreview(result.preview as typeof preview);
  }
  return (
    <section className="admin-panel import-panel">
      <div className="panel-heading">
        <div>
          <h2>CSV inventory import</h2>
          <p>
            Every row is validated before database changes. Later imports update
            the same seller SKU instead of duplicating it.
          </p>
        </div>
        <a
          className="button outline small"
          href="/api/admin/inventory-template"
        >
          Download template
        </a>
      </div>
      <label>
        Seller
        <select
          required
          value={sellerId}
          onChange={(e) => {
            setSellerId(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">Select seller</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Inventory CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void readFile(e.target.files?.[0])}
        />
      </label>
      {csv && (
        <p>{csv.split(/\r?\n/).filter(Boolean).length - 1} data rows loaded.</p>
      )}
      <button
        className="button dark small"
        disabled={!sellerId || !csv}
        onClick={() => void validate()}
      >
        Validate and preview
      </button>
      {preview && (
        <div className="import-preview">
          <h3>
            {preview.validCount} valid rows · {preview.errors.length} rows with
            errors
          </h3>
          {preview.errors.length > 0 && (
            <ul className="error-list">
              {preview.errors.map((item) => (
                <li key={item.row}>
                  Row {item.row}: {item.errors.join("; ")}
                </li>
              ))}
            </ul>
          )}
          {preview.valid.length > 0 && (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>SKU</th>
                    <th>Title</th>
                    <th>Scale</th>
                    <th>Price</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.map((row) => (
                    <tr key={String(row.rowNumber)}>
                      <td>{String(row.rowNumber)}</td>
                      <td>{String(row.sellerSku)}</td>
                      <td>{String(row.title)}</td>
                      <td>{String(row.scale)}</td>
                      <td>{money(Number(row.priceCents))}</td>
                      <td>{String(row.inventoryQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            className="button dark small"
            disabled={preview.errors.length > 0 || preview.validCount < 1}
            onClick={() =>
              void action({ action: "commit_import", sellerId, csv }).then(() =>
                setPreview(null),
              )
            }
          >
            Commit {preview.validCount} rows
          </button>
        </div>
      )}
    </section>
  );
}

type Hunt = {
  id: string;
  referenceCode: string;
  vehicleMake: string;
  vehicleModel: string;
  preferredScale: string;
  modelManufacturer?: string | null;
  collectorEmail: string;
  status: string;
  matchedProductId?: string | null;
  createdAt: string;
};
type Candidate = {
  id: string;
  slug: string;
  title: string;
  vehicleMake: string;
  vehicleModel: string;
  scale: string;
  modelManufacturer: string;
  sellerName: string;
  priceCents: number;
  currency: string;
};
function Hunts({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const hunts = (data.hunts as Hunt[]) ?? [];
  const products = (data.candidateProducts as Candidate[]) ?? [];
  const [filter, setFilter] = useState("open");
  const visible = hunts.filter((hunt) => !filter || hunt.status === filter);
  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <h2>Collector demand</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option>open</option>
          <option>possible_match</option>
          <option>matched</option>
          <option>closed</option>
        </select>
      </div>
      <div className="hunt-admin-grid">
        {visible.map((hunt) => {
          const matches = products.filter((product) =>
            modelHuntMatches(hunt, product),
          );
          return (
            <article key={hunt.id}>
              <div>
                <span className={`status ${hunt.status}`}>{hunt.status}</span>
                <b>{hunt.referenceCode}</b>
              </div>
              <h3>
                {hunt.preferredScale} {hunt.vehicleMake} {hunt.vehicleModel}
              </h3>
              <p>
                {hunt.modelManufacturer || "Any manufacturer"} ·{" "}
                {hunt.collectorEmail}
              </p>
              {matches.length > 0 ? (
                <label>
                  Probable matches
                  <select
                    defaultValue={hunt.matchedProductId ?? ""}
                    onChange={(e) => {
                      if (e.target.value)
                        void action({
                          action: "link_hunt",
                          huntId: hunt.id,
                          productId: e.target.value,
                        });
                    }}
                  >
                    <option value="">Select a confirmed match</option>
                    {matches.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title} — {product.sellerName} —{" "}
                        {money(product.priceCents, product.currency)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>No normalized make/model/scale match yet.</p>
              )}
              {hunt.matchedProductId && (
                <button
                  className="button dark small"
                  disabled={hunt.status === "matched"}
                  onClick={() =>
                    void action({ action: "notify_hunt", huntId: hunt.id })
                  }
                >
                  {hunt.status === "matched"
                    ? "Collector notified"
                    : "Notify collector"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

type AdminResolutionCase = {
  id: string;
  caseNumber: string;
  reason: string;
  requestedResolution: string;
  requestedRefundCents?: number | null;
  details: string;
  status: string;
  sellerRespondBy: string;
  buyerEvidenceBy: string;
  buyerShipBy?: string | null;
  returnAuthorizationNumber?: string | null;
  resolutionSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  sellerName: string;
  order: {
    id: string;
    orderNumber: string;
    buyerEmail: string;
    buyerName: string;
    currency: string;
    totalCents: number;
    refundedAmountCents: number;
    paymentStatus: string;
  };
  messages: Array<{
    id: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }>;
  files: Array<{
    id: string;
    kind: string;
    uploaderRole: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

function ResolutionCases({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const rows = (data.cases as AdminResolutionCase[]) ?? [];
  return (
    <div className="order-admin-list">
      {rows.length ? rows.map((item) => (
        <AdminCasePanel item={item} action={action} key={item.id} />
      )) : <div className="admin-panel">No resolution cases yet.</div>}
    </div>
  );
}

function AdminCasePanel({
  item,
  action,
}: {
  item: AdminResolutionCase;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [decision, setDecision] = useState("resolved");
  const [summary, setSummary] = useState("");
  const [amount, setAmount] = useState("");
  const closed = ["resolved", "closed", "denied"].includes(item.status);
  const remaining = Math.max(0, item.order.totalCents - item.order.refundedAmountCents);
  return (
    <article className="admin-panel order-admin admin-case-panel">
      <div className="panel-heading">
        <div>
          <span className={`status ${item.status}`}>{item.status.replaceAll("_", " ")}</span>
          <h2>{item.caseNumber}</h2>
          <p>{item.order.orderNumber} · {item.sellerName} · {item.order.buyerName || item.order.buyerEmail}</p>
        </div>
        <div><small>Remaining paid balance</small><br /><b>{money(remaining, item.order.currency)}</b></div>
      </div>
      <div className="admin-case-grid">
        <section>
          <h3>Claim</h3>
          <p><b>{item.reason.replaceAll("_", " ")}</b> · requested {item.requestedResolution.replaceAll("_", " ")}</p>
          <p>{item.details}</p>
          <small>Opened {shortDate(item.createdAt)} · seller response due {shortDate(item.sellerRespondBy)} · buyer evidence due {shortDate(item.buyerEvidenceBy)}</small>
          {item.returnAuthorizationNumber && <p><b>{item.returnAuthorizationNumber}</b> · return due {shortDate(item.buyerShipBy)}</p>}
        </section>
        <section>
          <h3>Private files</h3>
          <div className="admin-case-files">
            {item.files.map((file) => <a key={file.id} href={`/api/resolution/files/${file.id}`} target="_blank" rel="noreferrer">{file.kind === "return_label" ? "Return label" : "Evidence"}: {file.originalName} <small>({file.uploaderRole})</small></a>)}
            {!item.files.length && <p>No files.</p>}
          </div>
        </section>
      </div>
      <details className="admin-case-timeline">
        <summary>Review shared timeline ({item.messages.length})</summary>
        {item.messages.map((message) => <p key={message.id}><b>{message.authorRole}</b> · {shortDate(message.createdAt)}<br />{message.body}</p>)}
      </details>
      {!closed ? (
        <form className="admin-case-decision" onSubmit={(event) => {
          event.preventDefault();
          void action({ action: "admin_case_decision", caseId: item.id, decision, summary, amount });
        }}>
          <label>Outcome<select value={decision} onChange={(event) => setDecision(event.target.value)}><option value="resolved">Resolve without refund</option><option value="full_refund">Full remaining refund</option><option value="partial_refund">Partial refund</option><option value="denied">Deny claim</option></select></label>
          {decision === "partial_refund" && <label>Refund amount<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25.00" required /></label>}
          <label>Outcome explanation<textarea value={summary} onChange={(event) => setSummary(event.target.value)} minLength={10} maxLength={2000} rows={4} required /></label>
          <button className={decision.includes("refund") ? "danger-button" : "button dark small"}>Record final outcome</button>
        </form>
      ) : <div className="case-outcome"><p className="eyebrow">Final outcome</p><h3>{item.resolutionSummary || item.status}</h3></div>}
    </article>
  );
}

type AdminOrder = {
  id: string;
  orderNumber: string;
  sellerName: string;
  buyerEmail: string;
  buyerName: string;
  shippingAddress: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  marketplaceFeeBps: number;
  platformFeeCents: number;
  paymentProcessingFeeCents?: number | null;
  sellerProceedsCents?: number | null;
  totalCents: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    productTitleSnapshot: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};
function Orders({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const rows = (data.orders as AdminOrder[]) ?? [];
  return (
    <div className="order-admin-list">
      {rows.length ? (
        rows.map((order) => (
          <OrderPanel key={order.id} order={order} action={action} />
        ))
      ) : (
        <div className="admin-panel">No orders yet.</div>
      )}
    </div>
  );
}
function OrderPanel({
  order,
  action,
}: {
  order: AdminOrder;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [confirm, setConfirm] = useState("");
  const [restock, setRestock] = useState(false);
  return (
    <article className="admin-panel order-admin">
      <div className="panel-heading">
        <div>
          <span className={`status ${order.paymentStatus}`}>
            {order.paymentStatus}
          </span>{" "}
          <span className={`status ${order.fulfillmentStatus}`}>
            {order.fulfillmentStatus}
          </span>
          <h2>{order.orderNumber}</h2>
          <p>
            {order.sellerName} · {order.buyerName} · {order.buyerEmail}
          </p>
        </div>
        <b>{money(order.totalCents, order.currency)}</b>
      </div>
      <div className="order-admin-body">
        <div>
          <h3>Items</h3>
          {order.items.map((item) => (
            <p key={item.id}>
              {item.productTitleSnapshot} × {item.quantity} —{" "}
              {money(item.unitPriceCents * item.quantity, order.currency)}
            </p>
          ))}
          <p>
            Model Car Center fee ({feePercent(order.marketplaceFeeBps)}):{" "}
            <b>{money(order.platformFeeCents, order.currency)}</b>
            <br />
            Stripe processing: {order.paymentProcessingFeeCents == null
              ? "not recorded"
              : money(order.paymentProcessingFeeCents, order.currency)}
            <br />
            Seller proceeds: {order.sellerProceedsCents == null
              ? "not recorded"
              : money(order.sellerProceedsCents, order.currency)}
          </p>
        </div>
        <div>
          <h3>Ship to</h3>
          <pre>{formatAddress(order.shippingAddress)}</pre>
        </div>
      </div>
      {order.paymentStatus === "paid" &&
        order.fulfillmentStatus !== "shipped" && (
          <div className="fulfillment-controls">
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Carrier"
            />
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
            />
            <button
              className="button dark small"
              disabled={!carrier || !tracking}
              onClick={() =>
                void action({
                  action: "ship_order",
                  orderId: order.id,
                  carrier,
                  trackingNumber: tracking,
                })
              }
            >
              Mark shipped &amp; email buyer
            </button>
          </div>
        )}
      {order.paymentStatus === "paid" && (
        <details className="refund-controls">
          <summary>Issue a full refund</summary>
          <p>
            This reverses the seller transfer and refunds the platform fee.
            Partial refunds are not supported here.
          </p>
          <label>
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
            />{" "}
            Restock inventory after Stripe confirms the refund
          </label>
          <label>
            Type {order.orderNumber} to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            className="danger-button"
            disabled={confirm !== order.orderNumber}
            onClick={() =>
              void action({
                action: "refund_order",
                orderId: order.id,
                restock,
              })
            }
          >
            Refund full order
          </button>
        </details>
      )}
    </article>
  );
}

function feePercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}

function shortDate(value?: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Invalid date"
    : parsed.toLocaleDateString();
}
function formatAddress(raw: string) {
  try {
    const value = JSON.parse(raw) as {
      name?: string;
      address?: Record<string, string>;
    };
    return [
      value.name,
      value.address?.line1,
      value.address?.line2,
      [value.address?.city, value.address?.state, value.address?.postal_code]
        .filter(Boolean)
        .join(", "),
      value.address?.country,
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return raw;
  }
}
