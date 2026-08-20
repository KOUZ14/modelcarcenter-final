"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { formatMoney } from "@/lib/format";

type GarageData = {
  wishlist: string[];
  orders: Array<
    Record<string, unknown> & { items: Array<Record<string, unknown>> }
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
  const professionalStore = data.seller?.sellerType === "professional";
  const [view, setView] = useState<(typeof tabs)[number]>(
    tabs.includes(initialView as never)
      ? (initialView as (typeof tabs)[number])
      : "overview",
  );
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
      window.location.assign("/");
      return body;
    }
    setMessage("Saved.");
    return body;
  }
  return (
    <div className="garage-layout">
      <aside className="garage-nav">
        <p className="eyebrow">Collector account</p>
        <h1>My Garage</h1>
        <p>
          {profile.displayName}
          <br />
          <span>{email}</span>
        </p>
        <nav aria-label="My Garage sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={view === tab ? "active" : ""}
              onClick={() => {
                setView(tab);
                history.replaceState(null, "", `/account?view=${tab}`);
              }}
            >
              {tab === "hunts"
                ? "Model Hunts"
                : tab === "listings"
                  ? "My Listings"
                  : tab === "sales"
                    ? "My Sales"
                    : tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        <Link className="button dark small" href={professionalStore ? "/store" : "/sell/model"}>
          {professionalStore ? "Open Store Console" : "Sell a Model"}
        </Link>
      </aside>
      <section className="garage-content">
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
  if (view === "wishlist")
    return (
      <EmptyOrCount
        count={data.wishlist.length}
        title="Wishlist"
        empty="No saved models yet."
        cta="Browse Models"
        href="/marketplace"
        detail={`${data.wishlist.length} model${data.wishlist.length === 1 ? "" : "s"} saved across your devices.`}
      />
    );
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
    ["active", "pending_review"].includes(String(listing.status)),
  ).length;
  return (
    <>
      <div className="garage-heading">
        <p className="eyebrow">Buy · Save · Hunt · Sell</p>
        <h2>Your collector activity</h2>
      </div>
      <div className="metric-grid garage-metrics">
        <article>
          <span>Wishlist</span>
          <b>{data.wishlist.length}</b>
        </article>
        <article>
          <span>Active Model Hunts</span>
          <b>{activeHunts}</b>
        </article>
        <article>
          <span>Orders</span>
          <b>{data.orders.length}</b>
        </article>
        <article>
          <span>Active listings</span>
          <b>{activeListings}</b>
        </article>
        <article>
          <span>Sales</span>
          <b>{data.sales.length}</b>
        </article>
      </div>
      <div className="garage-quick">
        <Link href="/marketplace">Find a Model</Link>
        <Link href="/#model-hunt">Start a Model Hunt</Link>
        <Link href={professionalStore ? "/store" : "/sell/model"}>
          {professionalStore ? "Manage Store" : "Sell a Model"}
        </Link>
      </div>
    </>
  );
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
  if (!rows.length)
    return (
      <EmptyOrCount
        count={0}
        title="Orders"
        empty="No orders yet."
        cta="Find a Model"
        href="/marketplace"
        detail=""
      />
    );
  return (
    <div className="garage-section">
      <p className="eyebrow">Orders</p>
      <h2>Purchase history</h2>
      <div className="garage-list">
        {rows.map((order) => (
          <article key={String(order.id)}>
            <div>
              <b>{String(order.orderNumber)}</b>
              <span>{date(String(order.createdAt))}</span>
            </div>
            <h3>{String(order.sellerName)}</h3>
            {order.items.map((item) => (
              <div className="order-line" key={String(item.id)}>
                {Boolean(item.imageUrlSnapshot) ? (
                  <Image
                    src={String(item.imageUrlSnapshot)}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                  />
                ) : (
                  <span />
                )}
                <p>
                  {String(item.productTitleSnapshot)} × {String(item.quantity)}
                </p>
              </div>
            ))}
            <p>
              <span className={`status ${String(order.paymentStatus)}`}>
                {String(order.paymentStatus)}
              </span>{" "}
              <span className={`status ${String(order.fulfillmentStatus)}`}>
                {String(order.fulfillmentStatus)}
              </span>{" "}
              · {formatMoney(Number(order.totalCents), String(order.currency))}
            </p>
            {Boolean(order.trackingNumber) && (
              <p>
                Tracking: {String(order.carrier)} ·{" "}
                {String(order.trackingNumber)}
              </p>
            )}
            <Link className="button outline small" href={`/resolution?order=${String(order.id)}`}>
              Get help with this order
            </Link>
            {["paid", "partially_refunded"].includes(
              String(order.paymentStatus),
            ) &&
              ["shipped", "delivered"].includes(
                String(order.fulfillmentStatus),
              ) && (
                <VerifiedFeedbackForm order={order} action={action} />
              )}
          </article>
        ))}
      </div>
    </div>
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
            <option value={5}>5 — Excellent</option>
            <option value={4}>4 — Good</option>
            <option value={3}>3 — Fair</option>
            <option value={2}>2 — Poor</option>
            <option value={1}>1 — Very poor</option>
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
  if (seller?.sellerType === "professional")
    return (
      <div className="garage-section">
        <p className="eyebrow">Professional store</p>
        <h2>Manage inventory in your Store Console.</h2>
        <p>
          Create products, import inventory, publish listings, and monitor stock
          from the workspace built for your store.
        </p>
        <Link className="button dark small" href="/store?view=inventory">
          Open inventory
        </Link>
      </div>
    );
  async function onboarding() {
    setBusy(true);
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stripe_onboarding" }),
      });
      const body = (await response.json()) as {
        onboardingUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.onboardingUrl) throw new Error(body.error);
      window.location.assign(body.onboardingUrl);
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
        <Link className="button dark small" href="/sell/model">
          Sell a Model
        </Link>
      </div>
      {seller &&
        (!seller.stripeChargesEnabled || !seller.stripePayoutsEnabled) && (
          <div className="account-callout">
            <b>Complete payout setup before submitting a listing.</b>
            <p>
              Stripe securely collects identity and bank information on its
              hosted site.
            </p>
            <button
              className="button outline small"
              disabled={busy}
              onClick={() => void onboarding()}
            >
              {busy ? "Opening Stripe…" : "Complete Stripe onboarding"}
            </button>
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
                  Review note: {String(listing.rejectionReason)}
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
              </p>
            ))}
            <p>
              {String(sale.buyerName)}
              <br />
              {formatAddress(sale.shippingAddress)}
            </p>
            <p>
              Sale price {formatMoney(Number(sale.subtotalCents), String(sale.currency))}
              {" · "}Model Car Center fee ({Number(sale.marketplaceFeeBps) / 100}%){" "}
              {formatMoney(Number(sale.platformFeeCents), String(sale.currency))}
              {" · "}Payment processing{" "}
              {sale.paymentProcessingFeeCents == null
                ? "recorded separately after Stripe settlement"
                : `${formatMoney(Number(sale.paymentProcessingFeeCents), String(sale.currency))} paid separately by Model Car Center`}
              {" · "}Seller proceeds{" "}
              {sale.sellerProceedsCents == null
                ? "not recorded for this order"
                : formatMoney(Number(sale.sellerProceedsCents), String(sale.currency))}
            </p>
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
      <h2>Your collector identity</h2>
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
          This revokes sessions, removes your profile, and deactivates listings.
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
        pending_review: "Awaiting Review",
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
function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value),
  );
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
