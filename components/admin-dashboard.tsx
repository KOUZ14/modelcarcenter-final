"use client";

import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/components/brand-logo";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modelHuntMatches } from "@/lib/business";
import { formatMoney as money } from "@/lib/format";
import { taxDate, taxTaskTiming } from "@/lib/tax-admin";
import { ProductionReadiness } from "@/components/production-readiness";
import type { ReadinessCheck } from "@/lib/production-readiness";
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
  "community",
  "orders",
  "tax",
  "resolution",
  "production",
] as const;

export function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview");
  const [data, setData] = useState<AdminData>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionLink, setActionLink] = useState("");
  const apiSection = tab === "import" ? "products" : tab;
  const activeSection = useRef(apiSection);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    if (activeSection.current !== apiSection) return false;
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch(`/api/admin?section=${apiSection}`, { cache: "no-store" });
      const body = (await response.json()) as AdminData & { error?: string };
      if (!response.ok)
        throw new Error(body.error || "Admin data unavailable.");
      if (sequence !== loadSequence.current || activeSection.current !== apiSection) return false;
      setData(body);
      setError("");
      return true;
    } catch (reason) {
      if (sequence !== loadSequence.current || activeSection.current !== apiSection) return false;
      setError(
        reason instanceof Error ? reason.message : "Admin data unavailable.",
      );
      return false;
    } finally {
      if (sequence === loadSequence.current && activeSection.current === apiSection) setLoading(false);
    }
  }, [apiSection]);
  useEffect(() => {
    activeSection.current = apiSection;
    queueMicrotask(() => void load());
    return () => { loadSequence.current += 1; };
  }, [apiSection, load]);
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
          : payload.action === "seed_tax_calendar"
            ? `Calendar saved: ${body.created ?? 0} added, ${body.updated ?? 0} refreshed.`
            : "Saved successfully.",
      );
      if (typeof body.onboardingUrl === "string")
        setActionLink(body.onboardingUrl);
      const refreshed = await load();
      if (!refreshed && activeSection.current === apiSection) {
        setMessage("Saved, but the latest data could not be loaded. Refresh to verify the update.");
      }
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
          <Link className="brand" href="/" aria-label="Model Car Center home">
            <BrandLogo priority/>
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
              if (item === tab) {
                void load();
                return;
              }
              setLoading((item === "import" ? "products" : item) !== apiSection);
              setTab(item);
              setMessage("");
              setError("");
              setActionLink("");
            }}
          >
            {item === "hunts"
              ? "Model Hunts"
              : item === "tax"
                ? "Tax & compliance"
                : item}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        <div className="admin-title">
          <p className="eyebrow">Founder-operated V1</p>
          <h1>
            {tab === "hunts"
              ? "Model Hunts"
              : tab === "tax"
                ? "Tax & compliance"
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
        {loading || data.section !== apiSection ? (
          <div className="catalog-status">{error ? <button className="button outline small" onClick={() => void load()}>Retry loading</button> : "Loading…"}</div>
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
  if (tab === "production") return <ProductionReadiness checks={(data.checks as ReadinessCheck[]) ?? []} configurationReady={data.configurationReady === true} />;
  if (tab === "sellers") return <Sellers data={data} action={action} />;
  if (tab === "products") return <Products data={data} action={action} />;
  if (tab === "import") return <Importer data={data} action={action} />;
  if (tab === "hunts") return <Hunts data={data} action={action} />;
  if (tab === "community") return <Community data={data} />;
  if (tab === "orders") return <Orders data={data} action={action} />;
  if (tab === "tax") return <TaxCenter data={data} action={action} />;
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
  handlingTimeBusinessDays: number;
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
                          {shortDate(seller.foundingRateStartsAt)} –{" "}
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
    handlingTimeBusinessDays: 3,
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
        <div className="form-row">
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
            Handling time, business days
            <input
              name="handlingTimeBusinessDays"
              type="number"
              min="1"
              max="10"
              required
              defaultValue={seller.handlingTimeBusinessDays}
            />
          </label>
        </div>
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
  availabilityType: "in_stock" | "preorder";
  releaseDate: string | null;
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
    availabilityType: "in_stock",
    releaseDate: null,
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
  const [primaryImageUrl, setPrimaryImageUrl] = useState(
    product.primaryImageUrl ?? null,
  );
  const [primaryUploadFinished, setPrimaryUploadFinished] = useState(false);
  const [imageError, setImageError] = useState("");
  const [availabilityType, setAvailabilityType] = useState<
    "in_stock" | "preorder"
  >(product.availabilityType ?? "in_stock");
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
            if (processedCount === 1) {
              setPrimaryUploadFinished(true);
              setPrimaryImageUrl(uploaded[0]?.url ?? null);
            }
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
    const response = await fetch("/api/admin/images", {
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
    const response = await fetch("/api/admin/images", {
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
                <option value="in_stock">In stock</option>
                <option value="preorder">Preorder</option>
              </select>
            </label>
            <label>
              Expected release date
              <input
                name="releaseDate"
                type="date"
                required={availabilityType === "preorder"}
                disabled={availabilityType !== "preorder"}
                defaultValue={product.releaseDate ?? ""}
              />
            </label>
          </div>
        </fieldset>
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

type CommunitySubscriber = {
  id: string;
  email: string;
  consentTimestamp: string;
  createdAt: string;
};

function Community({ data }: { data: AdminData }) {
  const subscribers = (data.subscribers as CommunitySubscriber[]) ?? [];
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? subscribers.filter((subscriber) =>
        subscriber.email.toLowerCase().includes(normalizedQuery),
      )
    : subscribers;
  return (
    <section className="admin-panel community-admin">
      <div className="panel-heading">
        <div>
          <h2>Community subscribers</h2>
          <p>
            {subscribers.length.toLocaleString()} confirmed signup
            {subscribers.length === 1 ? "" : "s"}, newest first.
          </p>
        </div>
        <a
          className="button dark small"
          href="/api/admin?section=community_export"
        >
          Export CSV
        </a>
      </div>
      <div className="admin-filters community-filters">
        <label>
          <span className="sr-only">Search subscriber emails</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email address"
            autoComplete="off"
          />
        </label>
        <span className="community-result-count" aria-live="polite">
          Showing {visible.length.toLocaleString()} of{" "}
          {subscribers.length.toLocaleString()}
        </span>
      </div>
      {visible.length ? (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email address</th>
                <th>Joined</th>
                <th>Consent recorded</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((subscriber) => (
                <tr key={subscriber.id}>
                  <td>
                    <a href={`mailto:${subscriber.email}`}>
                      {subscriber.email}
                    </a>
                  </td>
                  <td>
                    <time dateTime={subscriber.createdAt}>
                      {shortDateTime(subscriber.createdAt)}
                    </time>
                  </td>
                  <td>
                    <time dateTime={subscriber.consentTimestamp}>
                      {shortDateTime(subscriber.consentTimestamp)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="community-empty">
          {subscribers.length
            ? `No subscriber emails match “${query.trim()}”.`
            : "No community signups yet."}
        </p>
      )}
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

type TaxProfile = {
  id: string;
  businessStartedAt?: string | null;
  businessApprovedAt?: string | null;
  businessLaunchStatus?: "not_set" | "prelaunch" | "launched";
  sellerPermitStatus: string;
  marketplaceFacilitatorStatus: string;
  stripeCaliforniaRegistrationStatus: string;
  salesTaxFilingFrequency: string;
  nextSalesTaxDueAt?: string | null;
  caAccountVerifiedAt?: string | null;
  sellerDocumentationIssued: boolean;
  w9CollectionReady: boolean;
  stripeTaxReportingReady: boolean;
  incomeTaxReserveBps: number;
  notes: string;
  updatedAt?: string;
};

type TaxTotals = {
  orderCount: number;
  merchandiseCents: number;
  shippingCents: number;
  grossChargesCents: number;
  taxCollectedCents: number;
  taxOnFullyRefundedOrdersCents: number;
  taxAfterFullRefundsCents: number;
  refundsCents: number;
  netCustomerCollectionsCents: number;
  platformFeesCents: number;
  platformFeesAfterFullRefundsCents: number;
  stripeFeesCents: number;
  processingFeesRecoveredCents: number;
  sellerProceedsCents: number;
  netSellerTransferCents: number;
  californiaOrderCount: number;
  californiaMerchandiseCents: number;
  californiaShippingCents: number;
  californiaTaxCollectedCents: number;
  californiaTaxOnFullyRefundedOrdersCents: number;
  californiaTaxAfterFullRefundsCents: number;
  partialRefundReviewCount: number;
  missingStateCount: number;
  missingStripeFeeCount: number;
};

type TaxYearReport = {
  year: number;
  totals: TaxTotals;
  months: Array<TaxTotals & { month: string; label: string }>;
};

type TaxTask = {
  id: string;
  calendarKey?: string | null;
  kind: string;
  title: string;
  jurisdiction: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueAt: string;
  status: string;
  amountDueCents?: number | null;
  amountPaidCents?: number | null;
  confirmationReference: string;
  notes: string;
  filedAt?: string | null;
  paidAt?: string | null;
  updatedAt: string;
};

type LedgerEntry = {
  id: string;
  entryType: "expense" | "owner_draw" | "other_income";
  category: string;
  description: string;
  vendor: string;
  occurredAt: string;
  amountCents: number;
  reference: string;
  notes: string;
  status: "active" | "voided";
  updatedAt: string;
};

type SellerTaxRow = {
  id: string;
  storeName: string;
  sellerType: string;
  status: string;
  stripeAccountId?: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  taxInfoStatus: string;
  taxInfoVerifiedAt?: string | null;
  sellerTermsAcceptedAt?: string | null;
};

type TaxActivityRow = {
  id: string;
  summary: string;
  actorEmail: string;
  createdAt: string;
};

const EMPTY_TAX_TOTALS: TaxTotals = {
  orderCount: 0,
  merchandiseCents: 0,
  shippingCents: 0,
  grossChargesCents: 0,
  taxCollectedCents: 0,
  taxOnFullyRefundedOrdersCents: 0,
  taxAfterFullRefundsCents: 0,
  refundsCents: 0,
  netCustomerCollectionsCents: 0,
  platformFeesCents: 0,
  platformFeesAfterFullRefundsCents: 0,
  stripeFeesCents: 0,
  processingFeesRecoveredCents: 0,
  sellerProceedsCents: 0,
  netSellerTransferCents: 0,
  californiaOrderCount: 0,
  californiaMerchandiseCents: 0,
  californiaShippingCents: 0,
  californiaTaxCollectedCents: 0,
  californiaTaxOnFullyRefundedOrdersCents: 0,
  californiaTaxAfterFullRefundsCents: 0,
  partialRefundReviewCount: 0,
  missingStateCount: 0,
  missingStripeFeeCount: 0,
};

function TaxCenter({
  data,
  action: adminAction,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function action(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (savingRef.current) return { ok: false };
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await adminAction(payload);
      if (result.ok && payload.action === "create_ledger_entry" && typeof payload.occurredAt === "string") {
        setYear(Number(payload.occurredAt.slice(0, 4)));
      }
      return result;
    } catch {
      // The dashboard displays the error; keep the form values for retry.
      return { ok: false };
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const reports = (data.reports as TaxYearReport[]) ?? [];
  const excludedTestOrders = (data.excludedTestOrders as Array<{
    id: string;
    orderNumber: string;
    year: number | null;
    reason: string | null;
  }>) ?? [];
  const currentYear = Number(data.currentYear ?? new Date().getFullYear());
  const profile = data.profile as TaxProfile;
  const tasks = (data.tasks as TaxTask[]) ?? [];
  const ledgerByYear =
    (data.ledgerByYear as Array<{
      year: number;
      expensesCents: number;
      ownerDrawsCents: number;
      otherIncomeCents: number;
    }>) ?? [];
  const yearOptions = [
    ...new Set([
      currentYear,
      ...reports.map((row) => row.year),
      ...excludedTestOrders.flatMap((row) => row.year ? [row.year] : []),
      ...ledgerByYear.map((row) => row.year),
      ...((data.ledger as LedgerEntry[]) ?? []).map((row) => Number(row.occurredAt.slice(0, 4))),
      ...tasks.map((row) => Number((row.periodStart || row.dueAt).slice(0, 4))),
      ...(profile?.businessStartedAt ? [Number(profile.businessStartedAt.slice(0, 4))] : []),
    ]),
  ].sort((a, b) => b - a);
  const [year, setYear] = useState(currentYear);
  const report = reports.find((row) => row.year === year);
  const excludedForYear = excludedTestOrders.filter((row) => row.year === year);
  const totals = report?.totals ?? EMPTY_TAX_TOTALS;
  const ledgerSummary = ledgerByYear.find((row) => row.year === year) ?? {
    expensesCents: 0,
    ownerDrawsCents: 0,
    otherIncomeCents: 0,
  };
  const readiness =
    (data.readiness as Array<{
      id: string;
      label: string;
      detail: string;
      ready: boolean;
    }>) ?? [];
  const readyCount = readiness.filter((item) => item.ready).length;
  const marginProxy =
    totals.platformFeesAfterFullRefundsCents +
    totals.processingFeesRecoveredCents +
    ledgerSummary.otherIncomeCents -
    totals.stripeFeesCents -
    ledgerSummary.expensesCents;
  const reserveTarget = Math.max(
    0,
    Math.round((marginProxy * (profile?.incomeTaxReserveBps ?? 0)) / 10_000),
  );
  const ledger = ((data.ledger as LedgerEntry[]) ?? []).filter(
    (entry) => Number(entry.occurredAt.slice(0, 4)) === year,
  );
  return (
    <fieldset className="tax-center tax-controls" disabled={saving} aria-busy={saving}>
      <legend className="sr-only">Tax and compliance controls</legend>
      <section className="tax-command-bar">
        <div>
          <p className="eyebrow">California sole proprietor</p>
          <h2>One place for every tax deadline, dollar, and proof point.</h2>
          <p>
            Order figures come from your checkout records. Checklist confirmations,
            filings, payments, expenses, and owner draws are private admin records.
          </p>
          <p><b>Approval date:</b> {profile?.businessApprovedAt ? shortDate(profile.businessApprovedAt) : "Not recorded"} · <b>Launch status:</b> {profile?.businessLaunchStatus === "prelaunch" ? "Not launched (owner reported)" : profile?.businessLaunchStatus === "launched" ? "Launched" : "Not recorded"}</p>
          <p><b>Business start:</b> {profile?.businessStartedAt ? shortDate(profile.businessStartedAt) : "Not recorded"}. An approval date does not establish when business operations began.</p>
        </div>
        <div className={`tax-readiness-score ${readyCount === readiness.length ? "ready" : "attention"}`}>
          <span>Launch tax readiness</span>
          <b>{readyCount}/{readiness.length}</b>
          <small>{readyCount === readiness.length ? "All tracked controls are ready" : `${readiness.length - readyCount} controls need attention`}</small>
        </div>
      </section>

      {profile?.businessLaunchStatus === "prelaunch" && <div className="tax-warning" role="note"><b>Before launch.</b> Estimated-tax calendar items are planning reminders for review, not confirmed unpaid bills. Your personal income and withholding still matter. A California seller’s permit also requires assigned returns even with no sales; confirm your filing frequency and due dates in CDTFA. Order reports retain any recorded payments and refunds.</div>}

      <section className="tax-readiness-grid" aria-label="Tax readiness checklist">
        {readiness.map((item) => (
          <article key={item.id} className={item.ready ? "ready" : "attention"}>
            <span>{item.ready ? "Ready" : "Action needed"}</span>
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="tax-section-heading">
        <div>
          <p className="eyebrow">Order-derived reporting</p>
          <h2>{year} financial picture</h2>
        </div>
        <div className="tax-year-actions">
          <label>
            Reporting year
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {yearOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <a className="button outline small" href={`/api/admin?section=tax_export&year=${year}`}>
            Download orders CSV
          </a>
        </div>
      </section>

      <div className="tax-metric-grid">
        <TaxMetric label="California merchandise" value={money(totals.californiaMerchandiseCents, "usd")} detail={`${totals.californiaOrderCount} California orders, before refunds`} />
        <TaxMetric label="California tax collected" value={money(totals.californiaTaxCollectedCents, "usd")} detail={`${money(totals.californiaTaxAfterFullRefundsCents, "usd")} after full refunds`} />
        <TaxMetric label="Marketplace fees" value={money(totals.platformFeesAfterFullRefundsCents, "usd")} detail={`${money(totals.platformFeesCents, "usd")} before full-refund adjustments`} />
        <TaxMetric label="Recorded Stripe fees" value={money(totals.stripeFeesCents, "usd")} detail={`${money(totals.processingFeesRecoveredCents, "usd")} recovered from sellers after refunds`} />
        <TaxMetric label="Manual business expenses" value={money(ledgerSummary.expensesCents, "usd")} detail="Excludes owner draws and personal tax payments" />
        <TaxMetric label="Operating margin proxy" value={money(marginProxy, "usd")} detail="Commission + processing recovered + other income − Stripe fees − recorded expenses" tone={marginProxy < 0 ? "warning" : undefined} />
        <TaxMetric label="Income-tax reserve target" value={money(reserveTarget, "usd")} detail={`${((profile?.incomeTaxReserveBps ?? 0) / 100).toFixed(1)}% planning rate`} />
        <TaxMetric label="Owner draws" value={money(ledgerSummary.ownerDrawsCents, "usd")} detail="Tracked separately; not a business expense" />
      </div>

      {(totals.partialRefundReviewCount > 0 || totals.missingStateCount > 0 || totals.missingStripeFeeCount > 0) && (
        <div className="tax-warning" role="note">
          <b>Reconciliation needed.</b>{" "}
          {totals.partialRefundReviewCount > 0 && `${totals.partialRefundReviewCount} partially refunded order(s) need their Stripe Tax adjustment checked. `}
          {totals.missingStateCount > 0 && `${totals.missingStateCount} paid order(s) have no readable destination state.`}
          {totals.missingStripeFeeCount > 0 && ` ${totals.missingStripeFeeCount} order(s) are missing Stripe processing fees. The margin and reserve may be overstated until those fees are recorded.`}
        </div>
      )}

      <section className="admin-panel tax-monthly-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Monthly reconciliation</p><h2>California filing support</h2></div>
          <small>Orders are grouped by payment date in California time. Refunds adjust the original sale month. This is an order reconciliation view; verify refund timing and partial-refund tax in Stripe before filing. The CSV contains orders only. Orders marked as tests are excluded from tax totals and the CSV.</small>
        </div>
        {excludedForYear.length > 0 && (
          <div role="note">
            <p><b>{excludedForYear.length} test {excludedForYear.length === 1 ? "order excluded" : "orders excluded"} for {year}.</b> Order history is preserved.</p>
            <ul>{excludedForYear.map((order) => (
              <li key={order.id}>{order.orderNumber}{order.reason ? `: ${order.reason}` : ""}</li>
            ))}</ul>
          </div>
        )}
        <div className="admin-table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Orders</th><th>CA merchandise</th><th>CA shipping</th><th>CA tax collected</th><th>After full refunds</th><th>All refunds</th></tr></thead>
            <tbody>
              {report?.months.length ? report.months.map((month) => (
                <tr key={month.month}><td><b>{month.label}</b></td><td>{month.orderCount}</td><td>{money(month.californiaMerchandiseCents, "usd")}</td><td>{money(month.californiaShippingCents, "usd")}</td><td>{money(month.californiaTaxCollectedCents, "usd")}</td><td>{money(month.californiaTaxAfterFullRefundsCents, "usd")}</td><td>{money(month.refundsCents, "usd")}</td></tr>
              )) : <tr><td colSpan={7}>No reportable paid orders for {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <TaxProfileForm key={profile?.updatedAt ?? "new"} profile={profile} automaticTaxEnabled={Boolean(data.automaticTaxEnabled)} action={action} />
      <TaxTaskManager tasks={tasks} year={year} businessStartedAt={profile?.businessStartedAt} launchStatus={profile?.businessLaunchStatus} action={action} />
      <LedgerManager entries={ledger} year={year} action={action} />
      <SellerTaxReadiness sellers={(data.sellers as SellerTaxRow[]) ?? []} action={action} />
      <TaxActivity rows={(data.activity as TaxActivityRow[]) ?? []} />
      <TaxReferencePanel />
    </fieldset>
  );
}

function TaxMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={tone ?? ""}><span>{label}</span><b>{value}</b><small>{detail}</small></article>;
}

function TaxProfileForm({
  profile,
  automaticTaxEnabled,
  action,
}: {
  profile: TaxProfile;
  automaticTaxEnabled: boolean;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [form, setForm] = useState({
    businessStartedAt: profile?.businessStartedAt ?? "",
    businessApprovedAt: profile?.businessApprovedAt ?? "",
    businessLaunchStatus: profile?.businessLaunchStatus ?? "not_set",
    sellerPermitStatus: profile?.sellerPermitStatus ?? "not_checked",
    marketplaceFacilitatorStatus: profile?.marketplaceFacilitatorStatus ?? "not_checked",
    stripeCaliforniaRegistrationStatus: profile?.stripeCaliforniaRegistrationStatus ?? "not_checked",
    salesTaxFilingFrequency: profile?.salesTaxFilingFrequency ?? "not_set",
    nextSalesTaxDueAt: profile?.nextSalesTaxDueAt ?? "",
    caAccountVerifiedAt: profile?.caAccountVerifiedAt ?? "",
    sellerDocumentationIssued: profile?.sellerDocumentationIssued ?? false,
    w9CollectionReady: profile?.w9CollectionReady ?? false,
    stripeTaxReportingReady: profile?.stripeTaxReportingReady ?? false,
    incomeTaxReservePercent: (profile?.incomeTaxReserveBps ?? 0) / 100,
    notes: profile?.notes ?? "",
  });
  function field(name: string, value: string | number | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  return (
    <section className="admin-panel tax-profile-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Control record</p><h2>California tax setup</h2></div>
        <span className={`status ${automaticTaxEnabled ? "paid" : "failed"}`}>Automatic tax {automaticTaxEnabled ? "enabled" : "disabled"}</span>
      </div>
      <form className="tax-profile-form" onSubmit={(event) => {
        event.preventDefault();
        void action({
          action: "save_tax_profile",
          ...form,
          incomeTaxReserveBps: Math.round(Number(form.incomeTaxReservePercent) * 100),
        });
      }}>
        <label>Business approval date<input type="date" value={form.businessApprovedAt} onChange={(event) => field("businessApprovedAt", event.target.value)} /><small>Record the approval separately from starting operations or making your first sale.</small></label>
        <label>Launch status<select value={form.businessLaunchStatus} onChange={(event) => field("businessLaunchStatus", event.target.value)}><option value="not_set">Not recorded</option><option value="prelaunch">Not launched</option><option value="launched">Launched</option></select></label>
        <label>Business start date<input type="date" value={form.businessStartedAt} onChange={(event) => field("businessStartedAt", event.target.value)} /><small>Enter the actual operations start date when known. Approval and launch can be different dates.</small></label>
        <label>Seller’s permit<select value={form.sellerPermitStatus} onChange={(event) => field("sellerPermitStatus", event.target.value)}><option value="not_checked">Not checked</option><option value="active">Active (owner confirmed)</option><option value="needs_attention">Needs attention</option></select></label>
        <label>CDTFA marketplace status<select value={form.marketplaceFacilitatorStatus} onChange={(event) => field("marketplaceFacilitatorStatus", event.target.value)}><option value="not_checked">Not confirmed</option><option value="confirmed">Confirmed</option><option value="needs_attention">Needs attention</option></select></label>
        <label>Stripe California registration<select value={form.stripeCaliforniaRegistrationStatus} onChange={(event) => field("stripeCaliforniaRegistrationStatus", event.target.value)}><option value="not_checked">Not checked</option><option value="active">Active</option><option value="needs_attention">Needs attention</option></select></label>
        <label>CDTFA filing frequency<select value={form.salesTaxFilingFrequency} onChange={(event) => field("salesTaxFilingFrequency", event.target.value)}><option value="not_set">Not set</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
        <label>Next sales-tax due date<input type="date" value={form.nextSalesTaxDueAt} onChange={(event) => field("nextSalesTaxDueAt", event.target.value)} /></label>
        <label>CDTFA account last verified<input type="date" value={form.caAccountVerifiedAt} onChange={(event) => field("caAccountVerifiedAt", event.target.value)} /></label>
        <label>Income-tax reserve target (%)<input type="number" min="0" max="100" step="0.1" value={form.incomeTaxReservePercent} onChange={(event) => field("incomeTaxReservePercent", event.target.value)} /><small>Planning aid only. Set this with your tax preparer.</small></label>
        <div className="tax-profile-facts"><span><b>Structure</b>Sole proprietor</span><span><b>Home state</b>California</span><span><b>Product code</b>txcd_99999999</span></div>
        <fieldset className="tax-checklist-fields">
          <legend>Process confirmations</legend>
          <label><input type="checkbox" checked={form.sellerDocumentationIssued} onChange={(event) => field("sellerDocumentationIssued", event.target.checked)} /> Sellers received marketplace tax documentation</label>
          <label><input type="checkbox" checked={form.w9CollectionReady} onChange={(event) => field("w9CollectionReady", event.target.checked)} /> Seller W-9 collection process is ready</label>
          <label><input type="checkbox" checked={form.stripeTaxReportingReady} onChange={(event) => field("stripeTaxReportingReady", event.target.checked)} /> Stripe Connect tax reporting was reviewed</label>
        </fieldset>
        <label className="tax-notes-field">Private notes<textarea rows={4} maxLength={4000} value={form.notes} onChange={(event) => field("notes", event.target.value)} placeholder="Advisor guidance, CDTFA call date, filing instructions…" /><small>Do not store a full permit number, SSN, EIN, or seller TIN here.</small></label>
        <button className="button dark small">Save tax profile</button>
      </form>
    </section>
  );
}

function TaxTaskManager({
  tasks,
  year,
  businessStartedAt,
  launchStatus,
  action,
}: {
  tasks: TaxTask[];
  year: number;
  businessStartedAt?: string | null;
  launchStatus?: string;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [form, setForm] = useState({
    kind: "ca_sales_tax",
    title: "",
    jurisdiction: "California CDTFA",
    periodStart: "",
    periodEnd: "",
    dueAt: "",
    amountDue: "",
    notes: "",
  });
  function field(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  return (
    <section className="admin-panel tax-task-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Deadlines and payments</p><h2>Tax calendar</h2></div>
        <button className="button outline small" onClick={() => void action({ action: "seed_tax_calendar", year })}>Add / refresh {year} calendar</button>
      </div>
      <p>All recorded deadlines are shown below, including payments due in the following year. Add / refresh uses the selected reporting year, repairs untouched planning dates, and preserves your recorded updates.</p>
      {businessStartedAt && <p>Business started {shortDate(businessStartedAt)}. Earlier planning deadlines are flagged for review. Estimated taxes depend on all personal income and withholding; review annualization for a midyear start.</p>}
      <form className="tax-task-create" onSubmit={(event) => {
        event.preventDefault();
        void action({
          action: "create_tax_task",
          ...form,
          amountDueCents: form.amountDue ? dollarsToCents(form.amountDue) : null,
        }).then((result) => { if (result.ok) setForm((current) => ({ ...current, title: "", dueAt: "", amountDue: "", notes: "" })); });
      }}>
        <label>Type<select value={form.kind} onChange={(event) => field("kind", event.target.value)}><option value="ca_sales_tax">California sales tax</option><option value="federal_estimated_tax">Federal estimated tax</option><option value="ca_estimated_tax">California estimated tax</option><option value="annual_income_tax">Annual income tax</option><option value="seller_reporting">Seller reporting</option><option value="other">Other</option></select></label>
        <label className="tax-task-title">Task<input required maxLength={180} value={form.title} onChange={(event) => field("title", event.target.value)} placeholder="Q3 CDTFA return and payment" /></label>
        <label>Jurisdiction<input maxLength={100} value={form.jurisdiction} onChange={(event) => field("jurisdiction", event.target.value)} /></label>
        <label>Period start<input type="date" value={form.periodStart} onChange={(event) => field("periodStart", event.target.value)} /></label>
        <label>Period end<input type="date" value={form.periodEnd} onChange={(event) => field("periodEnd", event.target.value)} /></label>
        <label>Due date<input required type="date" value={form.dueAt} onChange={(event) => field("dueAt", event.target.value)} /></label>
        <label>Expected amount<input type="number" min="0" step="0.01" inputMode="decimal" value={form.amountDue} onChange={(event) => field("amountDue", event.target.value)} placeholder="0.00" /></label>
        <label className="tax-task-notes">Notes<input maxLength={2000} value={form.notes} onChange={(event) => field("notes", event.target.value)} placeholder="Filing portal, preparer instructions, records needed…" /></label>
        <button className="button dark small">Add deadline</button>
      </form>
      <div className="tax-task-list">
        {tasks.length ? tasks.map((task) => <TaxTaskRow key={`${task.id}-${task.updatedAt}`} task={task} businessStartedAt={businessStartedAt} launchStatus={launchStatus} action={action} />) : <p className="tax-empty">No deadlines recorded. Add the planning calendar, then add your CDTFA filing dates.</p>}
      </div>
    </section>
  );
}

function TaxTaskRow({
  task,
  businessStartedAt,
  launchStatus,
  action,
}: {
  task: TaxTask;
  businessStartedAt?: string | null;
  launchStatus?: string;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [status, setStatus] = useState(task.status);
  const [dueAt, setDueAt] = useState(task.dueAt);
  const [amountDue, setAmountDue] = useState(task.amountDueCents == null ? "" : (task.amountDueCents / 100).toFixed(2));
  const [amountPaid, setAmountPaid] = useState(task.amountPaidCents == null ? "" : (task.amountPaidCents / 100).toFixed(2));
  const [confirmationReference, setConfirmationReference] = useState(task.confirmationReference);
  const [notes, setNotes] = useState(task.notes);
  const timing = taxTaskTiming(task, businessStartedAt, undefined, launchStatus);
  const overdue = timing === "overdue";
  const timingLabel = timing === "prelaunch_review" ? "Prelaunch — review" : timing === "before_start" ? "Before business start — review" : timing === "due_today" ? "Due today" : overdue ? "Overdue — review" : task.status.replaceAll("_", " ");
  return (
    <article className={`tax-task ${overdue ? "overdue" : ""}`}>
      <div className="tax-task-summary">
        <span className={`status ${task.status}`}>{timingLabel}</span>
        <h3>{task.title}</h3>
        <p>{task.jurisdiction || "No jurisdiction"} · Due {shortDate(task.dueAt)}</p>
        <small>{task.periodStart && task.periodEnd ? `${shortDate(task.periodStart)}–${shortDate(task.periodEnd)}` : "No reporting period recorded"}</small>
        {task.amountDueCents != null && <b>{money(task.amountDueCents, "usd")} expected</b>}
        {task.status === "filed" && timing !== "closed" && <small>Filed; payment or a zero balance still needs confirmation.</small>}
        {task.filedAt && <small>Filing recorded {shortDateTime(task.filedAt)}</small>}
        {task.paidAt && <small>Payment recorded {shortDateTime(task.paidAt)}</small>}
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        void action({
          action: "update_tax_task",
          taskId: task.id,
          status,
          dueAt,
          amountDueCents: amountDue ? dollarsToCents(amountDue) : null,
          amountPaidCents: amountPaid ? dollarsToCents(amountPaid) : null,
          confirmationReference,
          notes,
        });
      }}>
        <label>Due date<input required type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
        <label>Expected amount<input type="number" min="0" step="0.01" value={amountDue} onChange={(event) => setAmountDue(event.target.value)} placeholder="0.00" /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="upcoming">Upcoming</option><option value="ready">Ready to file/pay</option><option value="filed">Filed</option><option value="paid">Paid</option><option value="not_required">Not required</option></select></label>
        <label>Amount paid<input type="number" min="0" step="0.01" inputMode="decimal" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} placeholder="0.00" /></label>
        <label>Confirmation/reference<input maxLength={300} value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="Confirmation ID or receipt location" /></label>
        <label className="tax-task-row-notes">Notes<input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="button dark small">Update</button>
      </form>
    </article>
  );
}

function LedgerManager({
  entries,
  year,
  action,
}: {
  entries: LedgerEntry[];
  year: number;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const [form, setForm] = useState({
    entryType: "expense",
    category: "Software and hosting",
    description: "",
    vendor: "",
    occurredAt: todayDateInput(),
    amount: "",
    reference: "",
    notes: "",
  });
  function field(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  return (
    <section className="admin-panel tax-ledger-panel">
      <div className="panel-heading"><div><p className="eyebrow">Schedule C support</p><h2>Bookkeeping entries</h2></div><small>Tax payments are tracked in the calendar, not as business expenses.</small></div>
      <form className="tax-ledger-form" onSubmit={(event) => {
        event.preventDefault();
        void action({ action: "create_ledger_entry", ...form, amountCents: dollarsToCents(form.amount) }).then((result) => { if (result.ok) setForm((current) => ({ ...current, description: "", vendor: "", amount: "", reference: "", notes: "" })); });
      }}>
        <label>Entry type<select value={form.entryType} onChange={(event) => field("entryType", event.target.value)}><option value="expense">Business expense</option><option value="owner_draw">Owner draw</option><option value="other_income">Other business income</option></select></label>
        <label>Category<select value={form.category} onChange={(event) => field("category", event.target.value)}><option>Software and hosting</option><option>Advertising</option><option>Professional services</option><option>Insurance</option><option>Office supplies</option><option>Shipping supplies</option><option>Bank fees</option><option>Home office</option><option>Owner draw</option><option>Other income</option><option>Other</option></select></label>
        <label>Date<input required type="date" value={form.occurredAt} onChange={(event) => field("occurredAt", event.target.value)} /></label>
        <label>Amount<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => field("amount", event.target.value)} placeholder="0.00" /></label>
        <label className="tax-ledger-description">Description<input required maxLength={240} value={form.description} onChange={(event) => field("description", event.target.value)} placeholder="Cloud hosting bill" /></label>
        <label>Vendor/source<input maxLength={160} value={form.vendor} onChange={(event) => field("vendor", event.target.value)} /></label>
        <label>Receipt/reference<input maxLength={300} value={form.reference} onChange={(event) => field("reference", event.target.value)} placeholder="Receipt filename or confirmation" /></label>
        <label className="tax-ledger-notes">Notes<input maxLength={2000} value={form.notes} onChange={(event) => field("notes", event.target.value)} /></label>
        <button className="button dark small">Record entry</button>
      </form>
      <div className="admin-table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Reference</th><th /></tr></thead>
          <tbody>
            {entries.length ? entries.map((entry) => (
              <tr key={entry.id} className={entry.status === "voided" ? "voided" : ""}><td>{shortDate(entry.occurredAt)}</td><td>{entry.entryType.replaceAll("_", " ")}</td><td><b>{entry.description}</b>{entry.notes && <small>{entry.notes}</small>}</td><td>{entry.category}</td><td>{entry.vendor || "—"}</td><td>{money(entry.amountCents, "usd")}</td><td>{entry.reference || "—"}</td><td>{entry.status === "active" ? <button onClick={() => void action({ action: "void_ledger_entry", entryId: entry.id })}>Void</button> : "Voided"}</td></tr>
            )) : <tr><td colSpan={8}>No manual bookkeeping entries for {year}.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SellerTaxReadiness({
  sellers,
  action,
}: {
  sellers: SellerTaxRow[];
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  return (
    <section className="admin-panel tax-seller-panel">
      <div className="panel-heading"><div><p className="eyebrow">Information reporting</p><h2>Seller tax readiness</h2></div><small>Track status only. TINs and W-9 documents stay in Stripe or your approved secure process.</small></div>
      <div className="admin-table-wrap">
        <table>
          <thead><tr><th>Seller</th><th>Marketplace status</th><th>Stripe</th><th>Terms</th><th>Tax information</th><th>Last verified</th></tr></thead>
          <tbody>
            {sellers.length ? sellers.map((seller) => <SellerTaxRowEditor key={`${seller.id}-${seller.taxInfoVerifiedAt ?? seller.taxInfoStatus}`} seller={seller} action={action} />) : <tr><td colSpan={6}>No sellers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SellerTaxRowEditor({ seller, action }: { seller: SellerTaxRow; action(payload: Record<string, unknown>): Promise<Record<string, unknown>> }) {
  const [status, setStatus] = useState(seller.taxInfoStatus);
  return (
    <tr>
      <td><b>{seller.storeName}</b><small>{seller.sellerType}</small></td>
      <td><span className={`status ${seller.status}`}>{seller.status}</span></td>
      <td>{seller.stripeAccountId && seller.stripeChargesEnabled && seller.stripePayoutsEnabled ? "Connected and enabled" : seller.stripeAccountId ? "Onboarding incomplete" : "Not connected"}</td>
      <td>{seller.sellerTermsAcceptedAt ? shortDate(seller.sellerTermsAcceptedAt) : "Not accepted"}</td>
      <td><div className="tax-seller-status"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="not_checked">Not checked</option><option value="collecting">Collecting</option><option value="ready">Ready</option><option value="needs_attention">Needs attention</option></select><button onClick={() => void action({ action: "seller_tax_status", sellerId: seller.id, status })}>Save</button></div></td>
      <td>{seller.taxInfoVerifiedAt ? shortDate(seller.taxInfoVerifiedAt) : "—"}</td>
    </tr>
  );
}

function TaxActivity({ rows }: { rows: TaxActivityRow[] }) {
  return (
    <section className="admin-panel tax-activity-panel">
      <div className="panel-heading"><div><p className="eyebrow">Evidence trail</p><h2>Recent tax activity</h2></div></div>
      {rows.length ? <ol>{rows.map((row) => <li key={row.id}><span>{shortDateTime(row.createdAt)}</span><p><b>{row.summary}</b><small>{row.actorEmail}</small></p></li>)}</ol> : <p>No tax activity recorded yet.</p>}
    </section>
  );
}

function TaxReferencePanel() {
  return (
    <aside className="tax-reference-panel">
      <div><p className="eyebrow light">Owner rules</p><h2>Keep these boundaries clear.</h2></div>
      <ul><li>Sales tax is a liability, not revenue.</li><li>Seller proceeds are not owner income.</li><li>Owner draws are not deductible expenses.</li><li>Partially refunded orders require a Stripe Tax adjustment check.</li><li>The margin proxy is a planning view, not a completed tax return.</li></ul>
      <nav aria-label="Official tax references"><a href="https://www.cdtfa.ca.gov/industry/MPFAct.htm" target="_blank" rel="noreferrer">CDTFA marketplace guide</a><a href="https://www.irs.gov/publications/p334" target="_blank" rel="noreferrer">IRS sole-proprietor guide</a><a href="https://www.ftb.ca.gov/file/business/types/sole-proprietorship.html" target="_blank" rel="noreferrer">California sole-proprietor guide</a><a href="https://docs.stripe.com/tax/tax-for-marketplaces" target="_blank" rel="noreferrer">Stripe marketplace tax setup</a></nav>
    </aside>
  );
}

function dollarsToCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

function todayDateInput() {
  return taxDate()!;
}

function shortDateTime(value: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);
  return Number.isNaN(parsed.getTime()) ? "Invalid date" : parsed.toLocaleString();
}

type AdminOrder = {
  id: string;
  orderNumber: string;
  isTestOrder: boolean;
  testOrderReason: string | null;
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
  processingFeePayer?: "platform" | "seller";
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
    availabilityTypeSnapshot: "in_stock" | "preorder";
    releaseDateSnapshot: string | null;
  }>;
};

type AdminDispute = {
  id: string;
  orderId?: string | null;
  orderNumber?: string | null;
  sellerName?: string | null;
  status: string;
  reason: string;
  amountCents: number;
  currency: string;
  evidenceDueBy?: string | null;
  closedAt?: string | null;
  updatedAt: string;
};

type AdminSellerAlert = {
  id: string;
  sellerId: string;
  sellerName: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  sourceObjectId?: string | null;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  createdAt: string;
};

function Orders({
  data,
  action,
}: {
  data: AdminData;
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const rows = (data.orders as AdminOrder[]) ?? [];
  const disputeRows = (data.disputes as AdminDispute[]) ?? [];
  const sellerAlertRows = (data.sellerAlerts as AdminSellerAlert[]) ?? [];
  return (
    <div className="admin-stack">
      <StripeRiskPanels
        disputes={disputeRows}
        sellerAlerts={sellerAlertRows}
        action={action}
      />
      <div className="order-admin-list">
        {rows.length ? (
          rows.map((order) => (
            <OrderPanel key={order.id} order={order} action={action} />
          ))
        ) : (
          <div className="admin-panel">No orders yet.</div>
        )}
      </div>
    </div>
  );
}

function StripeRiskPanels({
  disputes,
  sellerAlerts,
  action,
}: {
  disputes: AdminDispute[];
  sellerAlerts: AdminSellerAlert[];
  action(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}) {
  const openDisputes = disputes.filter(
    (row) => !["won", "prevented", "warning_closed"].includes(row.status),
  );
  const openAlerts = sellerAlerts.filter((row) => !row.acknowledged);
  return (
    <>
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stripe payment risk</p>
            <h2>Disputes</h2>
          </div>
          <span className={`status ${openDisputes.length ? "failed" : "paid"}`}>
            {openDisputes.length} open
          </span>
        </div>
        {disputes.length ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Seller</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Evidence due</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.orderNumber ?? "Unmatched charge"}</b><br /><small>{row.id}</small></td>
                    <td>{row.sellerName ?? "Unknown seller"}</td>
                    <td><span className={`status ${["won", "prevented", "warning_closed"].includes(row.status) ? "paid" : "failed"}`}>{row.status.replaceAll("_", " ")}</span></td>
                    <td>{row.reason.replaceAll("_", " ") || "Not provided"}</td>
                    <td>{money(row.amountCents, row.currency)}</td>
                    <td>{row.evidenceDueBy ? shortDateTime(row.evidenceDueBy) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No Stripe disputes recorded.</p>
        )}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stripe Connect monitoring</p>
            <h2>Seller payout alerts</h2>
          </div>
          <span className={`status ${openAlerts.length ? "failed" : "paid"}`}>
            {openAlerts.length} unacknowledged
          </span>
        </div>
        {sellerAlerts.length ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Severity</th>
                  <th>Alert</th>
                  <th>When</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sellerAlerts.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.sellerName}</b></td>
                    <td><span className={`status ${row.severity === "info" ? "paid" : "failed"}`}>{row.severity}</span></td>
                    <td>{row.message}</td>
                    <td>{shortDateTime(row.createdAt)}</td>
                    <td>{row.acknowledged ? "Acknowledged" : <button className="button outline small" onClick={() => void action({ action: "acknowledge_seller_alert", alertId: row.id })}>Acknowledge</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No Stripe Connect alerts recorded.</p>
        )}
      </section>
    </>
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
          {order.isTestOrder && <p><b>Test order — excluded from tax reports.</b>{order.testOrderReason ? ` ${order.testOrderReason}` : ""}</p>}
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
              {item.availabilityTypeSnapshot === "preorder" && item.releaseDateSnapshot ? ` · Preorder releases ${shortDate(item.releaseDateSnapshot)}` : ""}
            </p>
          ))}
          <p>
            Model Car Center fee ({feePercent(order.marketplaceFeeBps)}):{" "}
            <b>{money(order.platformFeeCents, order.currency)}</b>
            <br />
            Stripe processing ({order.processingFeePayer === "seller" ? "deducted from seller proceeds" : "paid by platform"}): {order.paymentProcessingFeeCents == null
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
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
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
