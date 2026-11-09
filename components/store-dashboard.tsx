"use client";

import { StoreInventory, type InventoryPage } from "./store-inventory";
import { storeRequest } from "@/lib/store-client";
import { SellerFeeDisclosure } from "./seller-fee-disclosure";
import { SellerPayments, SellerHelp, SellerThumbnail } from "./seller-setup";
import { StoreLogoUpload } from "./store-logo-upload";
import { StoreCountrySelect } from "./store-country-select";
import { trackEvent, sellerSetupElapsed } from "@/lib/analytics-client";
import { activeProtectionPolicy } from "@/lib/protection";
import type { buildSellerSetup } from "@/lib/seller-setup";
import "./seller-workflows.css";
import "./seller-dashboard.css";
import { SellerNavigation } from "./seller-navigation";
import { needsShipment, orderHandlingReminder, prioritizeOrders, sellerOrderPayout } from "@/lib/seller-dashboard";
import { SellerShipmentPanel } from "./seller-shipment-panel";
import { SellerOrderAmounts } from "./seller-order-amounts";
import { SellerShippingDeadline } from "./seller-shipping-deadline";
import { SellerPreorderOrders } from "./preorder-seller";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HubOverview, HubGrowth, HubAnalytics } from "./seller-hub-panels";
import { hubViews, orderViews, matchesOrderView, type HubView, type HubNavigate, type SellerHubMetrics } from "@/lib/seller-hub";
import type { SellerHubDemand } from "@/lib/seller-hub-data";
import { FormEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { SHIP_FROM_FIELD_NAMES, shipFromAddressValues } from "@/lib/address";
import { formatMoney, formatUtcDate, formatUtcDateTime } from "@/lib/format";
import type { EditableProductImage } from "@/components/product-image-fields";
import {
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

export type Product = {
  slug?: string;
  issues?: Record<string, string>;
  detailsLoaded?: boolean;
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
  foundingFeeFreeUnits?: number;
  foundingFeeFreeSubtotalCents?: number;
  platformFeeCents: number;
  processingFeePayer: "platform" | "seller";
  paymentProcessingFeeCents: number | null;
  sellerProceedsCents: number | null;
  shippingLabelCostCents: number;
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
  inventoryPage?: InventoryPage;
  inventoryEditor?: Product | null;
  inventoryPreorder?: Product | null;
  asOf: string;
  store: Store;
  setup: ReturnType<typeof buildSellerSetup>;
  fee: {
    marketplaceFeeBps: number;
    foundingFeeOffer?: { active: boolean; used: number; reserved: number; remaining: number };
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

function usePageHash() {
  return useSyncExternalStore(onChange => { window.addEventListener("hashchange", onChange); return () => window.removeEventListener("hashchange", onChange); }, () => window.location.hash, () => "");
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
    let body: Record<string, unknown>;
    try { body = await storeRequest("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
    catch (reason) { if (view !== "inventory") setError(reason instanceof Error ? reason.message : "The change could not be saved."); throw reason; }
    setMessage(options.message ?? "Saved.");
    if (payload.action === "save_store") trackEvent("seller_setup_step_completed", { step: payload.section === "introduction" ? "store" : "shipping" });
    const hasListedItems = data.inventoryPage ? data.inventoryPage.counts.listed > 0 : data.inventory.some(product => ["active", "sold_out"].includes(product.status));
    if (payload.action === "product_status" && payload.status === "active" && !hasListedItems && data.analytics.paidOrders === 0) trackEvent("first_listing_published", { durationMs: sellerSetupElapsed(data.store.id) }, { onceKey: `first-listing-${data.store.id}` });
    trackEvent("seller_tool_used", { step: String(payload.action), result: "success" });
    if (options.reload) router.refresh();
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
        {data.fee.foundingFeeOffer?.active && <aside className="seller-founding-note" aria-label="Founding-store fee allowance">
          <b>{data.fee.foundingFeeOffer.used === 10 ? "Founding-store offer complete — standard 7% fee applies." : "Founding-store offer: 0% marketplace fee on your first 10 units after activation."}</b>
          <p>{data.fee.foundingFeeOffer.used}/10 sold · {data.fee.foundingFeeOffer.reserved} in checkout · {data.fee.foundingFeeOffer.remaining} available. Stripe processing remains separate.</p>
          <button type="button" onClick={() => selectView("settings", "payments")}>View fee details</button>
        </aside>}
        {view === "overview" && (
          <HubOverview data={data} navigate={selectView} />
        )}
        {view === "payments" && <SellerPayments data={data} action={action} />}
        {view === "help" && <SellerHelp />}
        {view === "growth" && <HubGrowth data={data} navigate={selectView} filter={growthFilter} />}
        {view === "messages" && messages}
        {view === "inventory" && (
          <StoreInventory key={JSON.stringify([data.inventoryPage?.page, data.inventoryPage?.search, data.inventoryPage?.filter, data.inventoryPage?.stock, initialProductId, initialPreorderId])} data={data} initialProductId={initialProductId} initialFilter={initialFilter} initialPreorderId={initialPreorderId} action={action} />
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
    <div className="seller-order-status"><span className={`status ${order.paymentStatus}`}>{order.paymentStatus.replaceAll("_", " ")}</span><span className={`status ${order.fulfillmentStatus}`}>{order.fulfillmentStatus.replaceAll("_", " ")}</span></div>
    <ul className="seller-packing-items">{order.items.map(item => <li key={item.id}><SellerThumbnail src={item.imageUrlSnapshot} title={item.productTitleSnapshot}/><div><strong>{item.productTitleSnapshot}</strong><p>{item.scaleSnapshot} · {item.manufacturerSnapshot}</p><p><b>Qty {item.quantity}</b> · SKU {item.sellerSkuSnapshot}</p>{item.availabilityTypeSnapshot === "preorder" && item.releaseDateSnapshot && <p>Preorder · expected {date(item.releaseDateSnapshot)}</p>}</div></li>)}</ul>
    {!order.items.length && <div className="seller-data-note"><strong>Item details are missing from this order.</strong><p>The model, SKU, and quantity were not recorded. Confirm the packing details with support before shipping.</p><Link href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}>Resolve missing order items →</Link></div>}
    <SellerShippingDeadline order={order} />
    <details className="seller-fulfillment"><summary>{readyToShip && order.items.length && !order.shipment ? "Create shipment" : "Delivery & tracking details"}</summary><div className="seller-fulfillment-content"><h4>Ship to</h4><p><strong>{order.buyerName || "Customer"}</strong><br/>{formatAddress(order.shippingAddress)}</p><p><a href={`mailto:${order.buyerEmail}`}>{order.buyerEmail}</a></p>
      {order.shippingMode === "calculated" && <p><b>Buyer selected:</b> {order.selectedShippingCarrier} {order.selectedShippingService}{order.selectedShippingEstimatedDays == null ? "" : ` · about ${order.selectedShippingEstimatedDays} business days`}. Use this service or an equal/faster one.</p>}
      {["paid", "partially_refunded"].includes(order.paymentStatus) && (order.items.length || !readyToShip) ? <SellerShipmentPanel order={order} compatibleOrders={compatibleOrdersFor(order, rows).filter(candidate => candidate.items.length > 0)} store={store} shipping={shipping} disabled={disabled} action={action}/> : <p>{readyToShip ? "Shipment creation is unavailable until this order’s items are confirmed." : "Shipment creation requires a paid order."}</p>}
    </div></details>
    <details className="seller-order-finances"><summary>Payment & fee details</summary><SellerOrderAmounts order={order}/><p><b>Payout:</b> {sellerOrderPayout(order).label}</p>{order.processingFeePayer === "platform" && <p>This order records processing paid by MCC under its earlier fee arrangement. New orders deduct actual processing from seller proceeds.</p>}{order.paymentFlow === "destination" && <p>Legacy direct payouts are excluded from MCC’s held/released totals. Check Stripe for this payment’s payout history.</p>}</details>
    <div className="seller-task-links"><Link href={`/store?view=messages`}>Buyer messages →</Link><Link href={`/resolution?order=${order.id}`}>Order support →</Link></div>
  </article>;
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
              <span>I am authorized to accept the <Link href="/seller-terms">Seller Terms</Link> for this store, including deductions for marketplace commission and payment processing.</span>
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
      <section hidden={selected !== "payments"} className="store-panel payout-status"><h3>{feePercent(fee.marketplaceFeeBps)} standard marketplace fee</h3>{fee.foundingFeeOffer?.active && <div className="seller-founding-note"><h4>Founding-store offer: your first 10 units at 0%</h4><p>{fee.foundingFeeOffer.used} sold · {fee.foundingFeeOffer.reserved} in checkout · {fee.foundingFeeOffer.remaining} available</p><p>Starts when an admin grants the offer. Each unit counts, including quantities of the same model. Unpaid checkouts hold slots temporarily; paid sales consume them. Refunds do not refill the allowance. After 10 units, the standard 7% applies. Stripe processing remains separate.</p><p>If an order crosses the limit, remaining fee-free slots apply to its highest-priced units first; the other units incur 7%.</p></div>}<SellerFeeDisclosure marketplaceFeeBps={fee.marketplaceFeeBps} /><p>New-order proceeds become eligible {activeProtectionPolicy.deliveredDays} calendar days after confirmed delivery if no case is open and actual processing fees are available. See Payments for each order’s dates and holds.</p></section>
    </div>
  );
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
