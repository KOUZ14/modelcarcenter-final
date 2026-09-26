"use client";

import { SellerOrderAmounts } from "./seller-order-amounts";
import { OrderProtectionSummary } from "./order-protection-summary";
import { PreorderDashboard, PreorderOrderHistory } from "./preorder-dashboard";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatCondition, formatMoney, formatUtcDate } from "@/lib/format";
import { orderDeliveryLabel, orderTrackingHref, type SavedListingPreview } from "@/lib/account-presentation";
import { POLICY_VERSION } from "@/lib/legal";
import "./account-dashboard.css";
import {
  ShipmentTimeline,
  type ShipmentTimelineData,
} from "@/components/shipment-timeline";

type GarageData = {
  wishlist: string[];
  savedListings: SavedListingPreview[];
  orders: Array<
    Record<string, unknown> & {
      items: Array<Record<string, unknown>>;
      shipment: ShipmentTimelineData | null;
    }
  >;
  hunts: Array<Record<string, unknown>>;
  seller: (Record<string, unknown> & { id: string }) | null;
  listings: Array<Record<string, unknown>>;
  sales: Array<
    Record<string, unknown> & { items: Array<Record<string, unknown>> }
  >;
};
type Profile = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string;
  onboardingCompleted: boolean;
};

const tabs = [
  "overview",
  "wishlist",
  "hunts",
  "orders",
  "listings",
  "sales",
  "profile",
] as const;
const tabLabels: Record<(typeof tabs)[number], string> = {
  overview: "Overview", wishlist: "Wishlist", hunts: "Model Hunts", orders: "My Orders",
  listings: "My Listings", sales: "My Sales", profile: "Account settings",
};
const sectionHref = (view: string) => `/account?view=${view}#account-content`;

export function AccountDashboard({
  initialView,
  data,
  profile,
  email,
  isNew,
}: {
  initialView: string;
  data: GarageData;
  profile: Profile;
  email: string;
  isNew: boolean;
}) {
  const router = useRouter();
  const view = tabs.includes(initialView as never) ? initialView as (typeof tabs)[number] : "overview";
  const [message, setMessage] = useState(
    isNew && !profile.onboardingCompleted
      ? "Welcome to My Garage. Add the display name collectors will see."
      : "",
  );
  const [error, setError] = useState("");
  async function action(payload: Record<string, unknown>) {
    setMessage("");
    setError("");
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as {
      error?: string;
      deleted?: boolean;
    };
    if (!response.ok) {
      setError(body.error || "The change could not be saved.");
      throw new Error(body.error);
    }
    if (body.deleted) {
      router.push("/");
      return body;
    }
    setMessage("Saved.");
    return body;
  }
  return (
    <div className="garage-layout account-dashboard">
      <aside className="garage-nav">
        <h1>My Garage</h1>
        <p className="account-identity"><strong>{profile.displayName}</strong><span>{email}</span></p>
        <label className="account-section-picker" htmlFor="account-section">Account section
          <select id="account-section" value={view} onChange={event => router.push(sectionHref(event.target.value))}>
            {tabs.map(tab => <option key={tab} value={tab}>{tabLabels[tab]}</option>)}
          </select>
        </label>
        <nav aria-label="My Garage sections">
          {tabs.map((tab) => (
            <Link
              key={tab}
              href={sectionHref(tab)}
              aria-current={view === tab ? "page" : undefined}
            >
              {tabLabels[tab]}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="garage-content" id="account-content" tabIndex={-1} aria-label={tabLabels[view]}>
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
        <GarageView view={view} data={data} profile={profile} action={action} />
      </section>
    </div>
  );
}

function GarageView({
  view,
  data,
  profile,
  action,
}: {
  view: string;
  data: GarageData;
  profile: Profile;
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  if (view === "overview") return <Overview data={data} />;
  if (view === "wishlist") return <SavedModels data={data}/>;
  if (view === "hunts") return <Hunts rows={data.hunts} />;
  if (view === "orders") return <Orders rows={data.orders} action={action} />;
  if (view === "listings")
    return (
      <Listings rows={data.listings} seller={data.seller} action={action} />
    );
  if (view === "sales") return <Sales rows={data.sales} action={action} />;
  return (
    <ProfileForm
      profile={profile}
      action={action}
      canDeleteAccount={data.seller?.sellerType !== "professional"}
    />
  );
}

function Overview({ data }: { data: GarageData }) {
  const professionalStore = data.seller?.sellerType === "professional";
  const activeHunts = data.hunts.filter(
    (hunt) => !["closed"].includes(String(hunt.status)),
  ).length;
  const activeListings = data.listings.filter((listing) =>
    listing.status === "active",
  ).length;
  const latestOrder = data.orders[0];
  const metrics = [
    ["Wishlist", data.wishlist.length, "wishlist"], ["Orders", data.orders.length, "orders"],
    ["Active hunts", activeHunts, "hunts"], ["Active listings", activeListings, "listings"], ["Sales", data.sales.length, "sales"],
  ] as const;
  return <div className="account-overview">
    <h2 className="sr-only">Overview</h2>
    {latestOrder ? <section className="account-recent" aria-labelledby="recent-order-heading">
      <div className="account-activity-heading"><h3 id="recent-order-heading">Latest order</h3><Link href={sectionHref("orders")}>All orders</Link></div>
      <article className="account-order-preview">
        <OrderItems order={latestOrder} compact/>
        <p className="account-order-seller">{String(latestOrder.sellerName)} · {date(String(latestOrder.createdAt))}</p>
        <OrderProgress order={latestOrder}/>
        <Link className="button dark small" href={`/account?view=orders#order-${encodeURIComponent(String(latestOrder.id))}`}>View order</Link>
      </article>
    </section> : <section className="account-empty-activity"><h3>No orders yet</h3><p>Your purchases and delivery updates will appear here.</p><Link className="button dark small" href="/marketplace">Browse models</Link><Link className="account-inline-link" href={sectionHref("orders")}>Orders &amp; preorders</Link></section>}
    <SavedModels data={data} compact/>
    <nav className="account-totals" aria-label="Account activity totals">
      {metrics.map(([label, count, tab]) => <Link key={tab} href={sectionHref(tab)}><span>{label}</span><strong>{count}</strong></Link>)}
    </nav>
    <div className="account-secondary-links"><Link href="/model-hunt">Start a Model Hunt</Link><Link href={professionalStore ? "/store" : sectionHref("listings")}>{professionalStore ? "Open Seller Hub" : "Manage selling"}</Link></div>
  </div>;
}

function SavedModels({ data, compact = false }: { data: GarageData; compact?: boolean }) {
  return <section className="account-saved" aria-label="Saved listings">
    <div className="account-activity-heading">{compact ? <h3>Saved listings</h3> : <h2>Your wishlist</h2>}{data.wishlist.length > 0 && <Link href="/wishlist">View all ({data.wishlist.length})</Link>}</div>
    {!compact && <p>Specific sellers’ listings you’ve saved. Your wishlist also includes models you’re looking for.</p>}
    {data.savedListings.map(listing => <Link className="account-saved-row" key={listing.id} href={`/products/${encodeURIComponent(listing.slug)}`}>
      {listing.primaryImageUrl ? <Image src={listing.primaryImageUrl} alt="" width={96} height={72} unoptimized/> : <span className="account-image-placeholder">No photo</span>}
      <div><h3>{listing.title}</h3><p>{listing.scale} · {listing.modelManufacturer} · {formatCondition(listing.modelCondition)}</p><strong>{formatMoney(listing.priceCents, listing.currency)}</strong><p>{listing.sellerName}{listing.availabilityType === "preorder" ? " · Preorder" : listing.availableQuantity < 1 ? " · Not available" : ""}</p></div>
    </Link>)}
    {!data.savedListings.length && <p>{data.wishlist.length ? "Your saved listings aren’t currently available. Open your wishlist to review them." : "No saved listings yet. Save a seller’s listing while browsing to find it here."}</p>}
    {!compact && data.wishlist.length > 0 && <Link className="button dark small" href="/wishlist">Open your wishlist</Link>}
    {!data.wishlist.length && <Link className={compact ? "account-inline-link" : "button dark small"} href="/marketplace">Browse models</Link>}
  </section>;
}

function OrderItems({ order, compact = false }: { order: GarageData["orders"][number]; compact?: boolean }) {
  const items = compact ? order.items.slice(0, 1) : order.items;
  return <div className="account-order-items">
    {items.map(item => <div className="account-order-item" key={String(item.id)}>
      {item.imageUrlSnapshot ? <Image src={String(item.imageUrlSnapshot)} alt="" width={96} height={72} unoptimized/> : <span className="account-image-placeholder">No photo</span>}
      <div><h3>{String(item.productTitleSnapshot)}</h3><p>{[item.scaleSnapshot, item.manufacturerSnapshot].filter(Boolean).join(" · ")} · Qty {String(item.quantity)}</p>
        {item.availabilityTypeSnapshot === "preorder" && <p>Preorder{item.releaseDateSnapshot ? ` · Release ${date(String(item.releaseDateSnapshot))}` : ""}</p>}
        {!compact && order.fulfillmentStatus === "delivered" && <Link className="account-inline-link" href={`/collection?fromOrderItem=${encodeURIComponent(String(item.id))}`}>Add to my collection</Link>}
      </div>
    </div>)}
    {!items.length && <p>Item details are unavailable. Contact support with your order number.</p>}
    {compact && order.items.length > 1 && <p>+ {order.items.length - 1} more {order.items.length === 2 ? "model" : "models"} in this order</p>}
  </div>;
}

function OrderProgress({ order }: { order: GarageData["orders"][number] }) {
  return <div className="account-order-progress"><p><strong>{orderDeliveryLabel(order)}</strong><span>{String(order.paymentStatus).replaceAll("_", " ")}</span></p><strong>{formatMoney(Number(order.totalCents), String(order.currency))}</strong>
    {order.shipment?.eta && order.shipment.status !== "delivered" && order.fulfillmentStatus !== "delivered" && <p className="account-order-eta">Estimated delivery: {date(order.shipment.eta)}</p>}
  </div>;
}

function EmptyOrCount({
  count,
  title,
  empty,
  cta,
  href,
  detail,
}: {
  count: number;
  title: string;
  empty: string;
  cta: string;
  href: string;
  detail: string;
}) {
  return (
    <div className="garage-section">
      <p className="eyebrow">{title}</p>
      <h2>{count ? title : empty}</h2>
      <p>
        {count
          ? detail
          : "Your collector account keeps this information available on every device."}
      </p>
      <Link
        className="button dark small"
        href={count && title === "Wishlist" ? "/wishlist" : href}
      >
        {count && title === "Wishlist" ? "View saved models" : cta}
      </Link>
    </div>
  );
}

function Hunts({ rows }: { rows: GarageData["hunts"] }) {
  if (!rows.length)
    return (
      <EmptyOrCount
        count={0}
        title="Model Hunts"
        empty="You're not hunting for anything yet."
        cta="Start a Model Hunt"
        href="/#model-hunt"
        detail=""
      />
    );
  return (
    <div className="garage-section">
      <p className="eyebrow">Model Hunts</p>
      <h2>Models we’re tracking for you</h2>
      <div className="garage-list">
        {rows.map((hunt) => (
          <article key={String(hunt.id)}>
            <div>
              <span className={`status ${String(hunt.status)}`}>
                {huntStatus(String(hunt.status))}
              </span>
              <b>{String(hunt.referenceCode)}</b>
            </div>
            <h3>
              {String(hunt.preferredScale)} {String(hunt.vehicleMake)}{" "}
              {String(hunt.vehicleModel)}
            </h3>
            <p>
              {hunt.modelManufacturer
                ? String(hunt.modelManufacturer)
                : "Any manufacturer"}
              {hunt.color ? ` · ${String(hunt.color)}` : ""}
              {hunt.maxBudgetCents
                ? ` · up to ${formatMoney(Number(hunt.maxBudgetCents))}`
                : ""}
            </p>
            <p>{huntMessage(String(hunt.status))}</p>
            {Boolean(hunt.matchedProductSlug) && (
              <Link
                className="text-link"
                href={`/products/${String(hunt.matchedProductSlug)}`}
              >
                {String(hunt.matchedProductTitle)} ·{" "}
                {String(hunt.matchedSellerName)} ·{" "}
                {formatMoney(
                  Number(hunt.matchedProductPriceCents),
                  String(hunt.matchedProductCurrency),
                )}
              </Link>
            )}
            <small>Started {date(String(hunt.createdAt))}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function Orders({
  rows,
  action,
}: {
  rows: GarageData["orders"];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  return (
    <div className="garage-section account-orders">
      <h2>My Orders</h2>
      <p>Purchases, preorder deposits, payments and delivery updates.</p>
      <PreorderDashboard orderIds={rows.map(order => String(order.id))}>
        {preorders=>rows.map((order) => {
          const trackingHref = orderTrackingHref(order);
          return <article className="account-buyer-order" key={String(order.id)} id={`order-${String(order.id)}`}>
            <header className="account-order-meta">
              <b>{String(order.orderNumber)}</b>
              <span>{date(String(order.createdAt))}</span>
            </header>
            <OrderItems order={order}/>
            <p className="account-order-seller">From {order.sellerSlug ? <Link href={`/sellers/${encodeURIComponent(String(order.sellerSlug))}`}>{String(order.sellerName)}</Link> : String(order.sellerName)}</p>
            <OrderProgress order={order}/>
            {!order.shipment && Boolean(order.trackingNumber) && <p className="account-tracking-number">{String(order.carrier || "Carrier tracking")}: {String(order.trackingNumber)}</p>}
            {!order.shipment && !order.trackingNumber && order.fulfillmentStatus !== "cancelled" && <p className="account-tracking-note">Tracking has not been added yet.</p>}
            <div className="account-order-actions">
              {trackingHref && <a className="button dark small" href={trackingHref} target="_blank" rel="noopener noreferrer">Track package</a>}
              <Link className={`button ${trackingHref ? "outline" : "dark"} small`} href={`/resolution?order=${encodeURIComponent(String(order.id))}`}>
              Get help with this order
              </Link>
            </div>
            <OrderProtectionSummary compact order={{ createdAt: String(order.createdAt), paidAt: order.paidAt ? String(order.paidAt) : null, shippedAt: order.shippedAt ? String(order.shippedAt) : null, deliveredAt: order.deliveredAt ? String(order.deliveredAt) : null, refundRequestDeadline: order.refundRequestDeadline ? String(order.refundRequestDeadline) : null, protectionPolicyVersion: order.protectionPolicyVersion ? String(order.protectionPolicyVersion) : null }}/>
            {order.shipment && <details className="account-shipment-details"><summary>Shipment details &amp; tracking history</summary><ShipmentTimeline shipment={order.shipment}/></details>}
            <PreorderOrderHistory reservation={preorders.find(r=>r.orderId===String(order.id))}/>
            <VerifiedFeedbackAvailability order={order} action={action} />
          </article>;
        })}
      </PreorderDashboard>
    </div>
  );
}

function VerifiedFeedbackAvailability({
  order,
  action,
}: {
  order: GarageData["orders"][number];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  if (
    !["paid", "partially_refunded"].includes(String(order.paymentStatus)) ||
    !["shipped", "delivered"].includes(String(order.fulfillmentStatus))
  ) {
    return null;
  }
  const eligibility = order.feedbackEligibility as
    | { eligible?: boolean; eligibleAt?: string | null }
    | undefined;
  if (eligibility?.eligible) {
    return <VerifiedFeedbackForm order={order} action={action} />;
  }
  return (
    <p className="form-note">
      Verified feedback opens after the carrier confirms delivery
      {eligibility?.eligibleAt
        ? `, or on ${date(String(eligibility.eligibleAt))} if no delivery event arrives.`
        : "."}
    </p>
  );
}

function VerifiedFeedbackForm({
  order,
  action,
}: {
  order: GarageData["orders"][number];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  const existing = order.feedback as
    | { rating?: number; comment?: string }
    | null
    | undefined;
  const [rating, setRating] = useState(Number(existing?.rating ?? 5));
  const [comment, setComment] = useState(String(existing?.comment ?? ""));
  const [saved, setSaved] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await action({
        action: "seller_feedback",
        orderId: String(order.id),
        rating,
        comment,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="verified-feedback-form" open={!saved}>
      <summary>{saved ? "Edit verified feedback" : "Leave verified feedback"}</summary>
      <form onSubmit={submit}>
        <p>
          Your feedback will carry a Verified purchase label because it is tied
          to order {String(order.orderNumber)}.
        </p>
        <label>
          Rating
          <select
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
          >
            <option value={5}>5 - Excellent</option>
            <option value={4}>4 - Good</option>
            <option value={3}>3 - Fair</option>
            <option value={2}>2 - Poor</option>
            <option value={1}>1 - Very poor</option>
          </select>
        </label>
        <label>
          Feedback
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            minLength={10}
            maxLength={1000}
            rows={4}
            required
            placeholder="Describe the item, packing, communication, and shipping experience."
          />
        </label>
        <button className="button dark small" disabled={busy}>
          {busy ? "Saving…" : saved ? "Update feedback" : "Publish feedback"}
        </button>
      </form>
    </details>
  );
}

function Listings({
  rows,
  seller,
  action,
}: {
  rows: GarageData["listings"];
  seller: GarageData["seller"];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [acceptedSellerTerms, setAcceptedSellerTerms] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  if (seller?.sellerType === "professional")
    return (
      <div className="garage-section">
        <p className="eyebrow">Professional store</p>
        <h2>Manage inventory in your Seller Hub.</h2>
        <p>
          Create products, import inventory, publish listings, and monitor stock
          from the workspace built for your store.
        </p>
        <Link className="button dark small" href="/store?view=inventory">
          Open inventory
        </Link>
      </div>
    );
  async function connectPayments() {
    if (busy || !acceptedSellerTerms) return;
    setBusy(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stripe_onboarding", sellerTermsVersion: POLICY_VERSION }),
      });
      const body = (await response.json()) as {
        onboardingUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.onboardingUrl) throw new Error(body.error || "Payment setup could not be started.");
      window.location.assign(body.onboardingUrl);
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Payment setup could not be started.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="garage-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Selling</p>
          <h2>My Listings</h2>
        </div>
        {rows.length > 0 && <Link className="button dark small" href="/sell/model">
          Sell a Model
        </Link>}
      </div>
      {seller &&
        (!seller.stripeChargesEnabled || !seller.stripePayoutsEnabled) && (
          <div className="account-callout">
            <b>Connect your payment method before publishing a listing.</b>
            <p>
              Receive money from your sales. Stripe securely collects identity
              and bank information on its hosted site.
            </p>
            <label className="consent-check">
              <input type="checkbox" checked={acceptedSellerTerms} onChange={event => setAcceptedSellerTerms(event.target.checked)} />
              <span>I agree to the current <Link href="/seller-terms">Seller Terms</Link>.</span>
            </label>
            <button
              className="button outline small"
              disabled={busy || !acceptedSellerTerms}
              onClick={() => void connectPayments()}
            >
              {busy ? "Opening payment setup…" : "Connect payment method"}
            </button>
            {paymentError && <p className="form-error" role="alert">{paymentError}</p>}
          </div>
        )}
      {rows.length ? (
        <div className="garage-list">
          {rows.map((listing) => (
            <article key={String(listing.id)}>
              {Boolean(listing.primaryImageUrl) && (
                <Image
                  className="listing-thumb"
                  src={String(listing.primaryImageUrl)}
                  alt=""
                  width={112}
                  height={84}
                  unoptimized
                />
              )}
              <div>
                <span className={`status ${String(listing.status)}`}>
                  {listingStatusLabel(String(listing.status))}
                </span>
                <b>
                  {formatMoney(
                    Number(listing.priceCents),
                    String(listing.currency),
                  )}
                </b>
              </div>
              <h3>{String(listing.title)}</h3>
              <p>
                {String(listing.inventoryQuantity)} in inventory ·{" "}
                {String(listing.reservedQuantity)} reserved
              </p>
              {Boolean(listing.rejectionReason) && (
                <p className="form-error">
                  Marketplace note: {String(listing.rejectionReason)}
                </p>
              )}
              <div className="row-actions">
                <Link href={`/sell/model?id=${String(listing.id)}`}>Edit</Link>
                {String(listing.status) !== "inactive" && (
                  <button
                    onClick={() =>
                      void action({
                        action: "deactivate_listing",
                        productId: listing.id,
                      }).then(() => location.reload())
                    }
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyOrCount
          count={0}
          title="Listings"
          empty="Nothing for sale yet."
          cta="Sell a Model"
          href="/sell/model"
          detail=""
        />
      )}
    </div>
  );
}

function Sales({
  rows,
  action,
}: {
  rows: GarageData["sales"];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  if (!rows.length)
    return (
      <div className="garage-section">
        <p className="eyebrow">My Sales</p>
        <h2>No sales yet.</h2>
        <p>Paid orders for your collector listings will appear here.</p>
      </div>
    );
  return (
    <div className="garage-section">
      <p className="eyebrow">My Sales</p>
      <h2>Orders to fulfill</h2>
      <div className="garage-list">
        {rows.map((sale) => (
          <article key={String(sale.id)}>
            <div>
              <b>{String(sale.orderNumber)}</b>
              <span>{date(String(sale.createdAt))}</span>
            </div>
            {sale.items.map((item) => (
              <p key={String(item.id)}>
                {String(item.productTitleSnapshot)} × {String(item.quantity)}
                {item.availabilityTypeSnapshot === "preorder" && item.releaseDateSnapshot ? ` · Preorder releases ${date(String(item.releaseDateSnapshot))}` : ""}
              </p>
            ))}
            <p>
              {String(sale.buyerName)}
              <br />
              {formatAddress(sale.shippingAddress)}
            </p>
            <SellerOrderAmounts order={{
              currency: String(sale.currency), subtotalCents: Number(sale.subtotalCents),
              shippingCents: Number(sale.shippingCents), taxCents: Number(sale.taxCents),
              totalCents: Number(sale.totalCents), marketplaceFeeBps: Number(sale.marketplaceFeeBps),
              platformFeeCents: Number(sale.platformFeeCents),
              processingFeePayer: sale.processingFeePayer === "seller" ? "seller" : "platform",
              paymentProcessingFeeCents: sale.paymentProcessingFeeCents == null ? null : Number(sale.paymentProcessingFeeCents),
              sellerProceedsCents: sale.sellerProceedsCents == null ? null : Number(sale.sellerProceedsCents),
              refundedAmountCents: Number(sale.refundedAmountCents), paymentStatus: String(sale.paymentStatus),
            }} />
            <p><b>Payout:</b> {collectorPayoutLabel(sale)}</p>
            <p>
              <span className={`status ${String(sale.fulfillmentStatus)}`}>
                {String(sale.fulfillmentStatus)}
              </span>
            </p>
            {String(sale.shippingMode) === "calculated" && <p className="shipping-service-commitment"><b>Buyer selected:</b> {String(sale.selectedShippingCarrier ?? "")} {String(sale.selectedShippingService ?? "")}{sale.selectedShippingEstimatedDays == null ? "" : ` (about ${Number(sale.selectedShippingEstimatedDays)} business days)`}. Use this service or an equal/faster one.</p>}
            {String(sale.fulfillmentStatus) !== "shipped" && (
              <ShipmentForm orderId={String(sale.id)} sale={sale} action={action} />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function ShipmentForm({
  orderId,
  sale,
  action,
}: {
  orderId: string;
  sale: GarageData["sales"][number];
  action(payload: Record<string, unknown>): Promise<unknown>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await action({ action: "ship_sale", orderId, ...data });
    location.reload();
  }
  return (
    <form className="fulfillment-controls" onSubmit={submit}>
      <label>
        Carrier
        <input name="carrier" required maxLength={100} defaultValue={String(sale.selectedShippingCarrier ?? "")} />
      </label>
      <label>
        Carrier service
        <input name="fulfillmentService" required={String(sale.shippingMode) === "calculated"} maxLength={150} defaultValue={String(sale.selectedShippingService ?? "")} />
      </label>
      <label>
        Estimated transit days
        <input name="fulfillmentEstimatedDays" type="number" min={0} max={60} required={String(sale.shippingMode) === "calculated"} defaultValue={sale.selectedShippingEstimatedDays == null ? "" : String(sale.selectedShippingEstimatedDays)} />
      </label>
      <label>
        Tracking number
        <input name="trackingNumber" required maxLength={200} />
      </label>
      <button className="button dark small">Mark Shipped</button>
    </form>
  );
}

function ProfileForm({
  profile,
  action,
  canDeleteAccount,
}: {
  profile: Profile;
  action(payload: Record<string, unknown>): Promise<unknown>;
  canDeleteAccount: boolean;
}) {
  const [confirm, setConfirm] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action({
      action: "profile",
      ...Object.fromEntries(new FormData(event.currentTarget)),
    });
  }
  return (
    <div className="garage-section">
      <p className="eyebrow">Profile</p>
      <h2>Profile settings</h2>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Display name
          <input
            name="displayName"
            required
            maxLength={100}
            defaultValue={profile.displayName}
          />
        </label>
        <label>
          Handle <span>(optional)</span>
          <input
            name="handle"
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,39}"
            defaultValue={profile.handle ?? ""}
          />
        </label>
        <label>
          Avatar URL <span>(optional)</span>
          <input
            name="avatarUrl"
            type="url"
            defaultValue={profile.avatarUrl ?? ""}
          />
        </label>
        <label>
          Short bio <span>(optional)</span>
          <textarea name="bio" maxLength={280} defaultValue={profile.bio} />
        </label>
        <button className="button dark small">Save profile</button>
      </form>
      {canDeleteAccount ? <details className="delete-account">
        <summary>Delete account</summary>
        <p>
          This revokes sessions, removes your profile, cart, wishlist, Model Hunts,
          and optional email subscriptions, and deactivates listings.
          Paid order records are retained for transaction and legal
          requirements.
        </p>
        <label>
          Type DELETE to confirm
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <button
          className="danger-button"
          disabled={confirm !== "DELETE"}
          onClick={() => void action({ action: "delete_account", confirm })}
        >
          Delete my account
        </button>
      </details> : <div className="account-callout">
        <b>Store account closure is handled by support.</b>
        <p>
          Contact Model Car Center to close or transfer the professional store
          before removing this sign-in account.
        </p>
        <Link className="text-link" href="/contact">Contact support</Link>
      </div>}
    </div>
  );
}

function huntStatus(status: string) {
  return (
    (
      {
        open: "Searching",
        possible_match: "Possible Match",
        matched: "Match Found",
        closed: "Closed",
      } as Record<string, string>
    )[status] ?? status
  );
}
function listingStatusLabel(status: string) {
  return (
    (
      {
        draft: "Draft",
        pending_review: "Unpublished",
        active: "Live",
        sold_out: "Sold",
        rejected: "Rejected",
        inactive: "Inactive",
      } as Record<string, string>
    )[status] ?? status
  );
}
function huntMessage(status: string) {
  return (
    (
      {
        open: "We haven't found a match yet.",
        possible_match: "A possible model has been identified.",
        matched: "A confirmed match is ready to view.",
        closed: "This request is no longer active.",
      } as Record<string, string>
    )[status] ?? ""
  );
}
function collectorPayoutLabel(sale: GarageData["sales"][number]) {
  if (sale.paymentFlow === "destination") return "Legacy Stripe payout schedule";
  if (sale.sellerTransferStatus === "transferred")
    return sale.sellerTransferredAt
      ? `Released to Stripe ${date(String(sale.sellerTransferredAt))}`
      : "Released to Stripe";
  if (sale.sellerTransferStatus === "processing") return "Release processing";
  if (sale.sellerTransferStatus === "failed") return "Release will be retried";
  if (sale.sellerTransferStatus === "cancelled") return "Cancelled";
  if (sale.sellerTransferStatus === "reversed") return "Reversed for refund";
  if (sale.processingFeePayer === "seller" && sale.paymentProcessingFeeCents == null) return "Held - awaiting actual Stripe processing fee";
  return sale.payoutEligibleAt
    ? `Held through ${date(String(sale.payoutEligibleAt))}`
    : "Held until the protection deadline after delivery";
}

function date(value: string) {
  return formatUtcDate(value);
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object")
    return "Shipping address unavailable";
  const address = value as Record<string, unknown>;
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code]
      .filter(Boolean)
      .join(" "),
    address.country,
  ]
    .filter(Boolean)
    .map(String)
    .join(", ");
}
