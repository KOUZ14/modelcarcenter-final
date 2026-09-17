"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { StoreData } from "./store-dashboard";
import { availableUnits, inventoryViews, matchesInventoryView, type HubNavigate } from "@/lib/seller-hub";
import { formatMoney, formatUtcDate } from "@/lib/format";

type Props = { data: StoreData; navigate: HubNavigate };
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;

function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="store-page-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}

function Metric({ label, value, note, onClick }: { label: string; value: ReactNode; note: string; onClick?: () => void }) {
  return <article><span>{label}</span><b>{value}</b>{onClick ? <button onClick={onClick}>{note}</button> : <small>{note}</small>}</article>;
}

function OpportunityCards({ data, navigate }: Props) {
  const pricingCount = data.demand.products.filter((row) => row.saves > 0 && data.inventory.some((product) => product.id === row.productId && product.status === "active" && availableUnits(product) > 0)).length;
  const cards = [
    { label: "Collectors watching", value: data.demand.savedBuyers.toLocaleString(), detail: "Buyers who saved your listings", action: "See buyer interest", click: () => navigate("demand", "saved") },
    { label: "Pricing opportunities", value: pricingCount.toLocaleString(), detail: "Available listings with interested collectors", action: "Review marketing options", click: () => navigate("marketing", "offers") },
    { label: "Slow inventory", value: formatMoney(data.hub.slowValueCents), detail: `${data.hub.slowIds.length} listings with no sale in 90 days`, action: "Review slow stock", click: () => navigate("inventory", "slow") },
    { label: "Trending upward", value: data.demand.products.filter((row) => row.trending).length.toLocaleString(), detail: "Listings gaining wishlist interest", action: "Explore rising demand", click: () => navigate("demand", "trending") },
  ];
  return <div className="hub-opportunity-grid">{cards.map((card) => <button className="hub-opportunity" onClick={card.click} key={card.label}><span className="eyebrow">{card.label}</span><strong>{card.value}</strong><span>{card.detail}</span><b>{card.action} <span aria-hidden="true">↗</span></b></button>)}</div>;
}

export function HubOverview({ data, navigate }: Props) {
  const { hub, analytics } = data;
  return <div className="store-stack">
    <Heading eyebrow="Seller Hub / Overview" title="Overview" description="Sales, orders, payouts, and inventory at a glance." action={<button className="button dark small" disabled={data.store.status === "suspended"} onClick={() => navigate("inventory", "all", "new")}>+ Add product</button>} />
    <div className="metric-grid store-metrics hub-overview-metrics">
      <Metric label="Sales" value={formatMoney(analytics.grossSalesCents)} note="Lifetime gross item sales" onClick={() => navigate("analytics")} />
      <Metric label="Orders" value={analytics.paidOrders} note={`${analytics.unfulfilledOrders} awaiting shipment`} onClick={() => navigate("orders", "open")} />
      <Metric label="Payouts" value={formatMoney(hub.releasedCents)} note="Released to Stripe · View details" onClick={() => navigate("analytics", "payouts")} />
      <Metric label="Inventory value" value={formatMoney(hub.inventoryValueCents)} note={`${hub.availableUnits} available in-stock units`} onClick={() => navigate("inventory")} />
      <Metric label="Sell-through" value={percent(hub.sellThroughPercent)} note="Last 90 days · View definition" onClick={() => navigate("analytics")} />
    </div>
    <section className="hub-opportunities-section" aria-labelledby="overview-opportunities">
      <div className="panel-heading"><div><p className="eyebrow">Buyer interest and inventory</p><h3 id="overview-opportunities">Opportunities</h3></div><button className="text-button" onClick={() => navigate("opportunities")}>All opportunities →</button></div>
      <OpportunityCards data={data} navigate={navigate} />
    </section>
    <div className="hub-two-column">
      <section className="store-panel"><p className="eyebrow">Daily operations</p><h3>Tasks</h3><div className="hub-action-list">
        <button onClick={() => navigate("orders", "open")}><span>Awaiting shipment</span><b>{analytics.unfulfilledOrders} →</b></button>
        <button onClick={() => navigate("orders", "returns")}><span>Return requests</span><b>{data.demand.returnOrderIds.length} →</b></button>
        <button onClick={() => navigate("inventory", "low")}><span>Low-stock listings</span><b>{data.inventory.filter((row) => matchesInventoryView(row, "low", hub.slowIds)).length} →</b></button>
        <Link href="/messages"><span>Buyer conversations</span><b>Open inbox →</b></Link>
      </div></section>
      <section className="store-panel"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h3>Latest orders</h3></div><button className="text-button" onClick={() => navigate("orders", "all")}>View all →</button></div>
        {data.orders.length ? <div className="hub-recent-orders">{data.orders.slice(0, 4).map((order) => <div key={order.id}><div><b>{order.orderNumber}</b><small>{formatUtcDate(order.createdAt)} · {order.fulfillmentStatus.replaceAll("_", " ")}</small></div><b>{formatMoney(order.totalCents, order.currency)}</b></div>)}</div> : <p className="store-empty">No orders yet. Add products to your inventory to start selling.</p>}
      </section>
    </div>
  </div>;
}

export function HubOpportunities({ data, navigate }: Props) {
  return <div className="store-stack">
    <Heading eyebrow="Seller Hub / Opportunities" title="Opportunities" description="Review buyer interest, pricing, and slow inventory." />
    <OpportunityCards data={data} navigate={navigate} />
    <section className="store-panel"><p className="eyebrow">Inventory status</p><h3>Inventory by status</h3><div className="hub-action-list">{inventoryViews.slice(1).map(([value, label]) => <button key={value} onClick={() => navigate("inventory", value)}><span>{label}</span><b>{data.inventory.filter((row) => matchesInventoryView(row, value, data.hub.slowIds)).length} listings →</b></button>)}</div></section>
    <p className="hub-note">Wishlist saves indicate interest, not a commitment to buy. Pricing opportunities identify listings to review; targeted offer delivery is not available yet.</p>
  </div>;
}

const demandViews = [["saved", "Buyer interest"], ["searches", "Buyer searches"], ["wants", "Want List demand"], ["trending", "Models trending"], ["unfulfilled", "Unfulfilled demand"]] as const;

export function HubDemand({ data, navigate, filter }: Props & { filter?: string }) {
  const selected = demandViews.some(([key]) => key === filter) ? filter : "saved";
  const rows = data.demand.products.filter((row) => selected === "trending" ? row.trending : selected === "unfulfilled" ? row.restockSubscribers > 0 && data.inventory.some((product) => product.id === row.productId && availableUnits(product) === 0) : row.saves > 0);
  const wants = selected === "unfulfilled" ? data.demand.wants.filter((want) => !want.productIds.some((id) => data.inventory.some((product) => product.id === id && product.status === "active" && product.availabilityType !== "preorder" && availableUnits(product) > 0))) : data.demand.wants;
  return <div className="store-stack">
    <Heading eyebrow="Seller Hub / Demand" title="Demand" description="Wishlist saves, restock requests, and Model Hunts for your inventory." />
    <nav className="hub-filters" aria-label="Demand views">{demandViews.map(([value, label]) => <button key={value} aria-pressed={selected === value} onClick={() => navigate("demand", value)}>{label}</button>)}</nav>
    {selected === "searches" ? <Unavailable title="Buyer searches" detail="Search terms and search volume are not tracked yet. Explore saved listings and active Model Hunts for recorded buyer intent." action={<button className="button outline small" onClick={() => navigate("demand", "wants")}>Explore Want List demand</button>} /> : <>
      {selected !== "wants" && <section className="store-panel hub-data-panel"><div className="panel-heading"><div><p className="eyebrow">Your inventory</p><h3>{selected === "trending" ? "Rising wishlist interest" : selected === "unfulfilled" ? "Collectors waiting for stock" : "Listings collectors saved"}</h3></div></div>
        <p className="hub-note">{selected === "trending" ? "At least 3 new saves in the last 30 days, exceeding the previous 30 days. Based on currently saved listings, not search volume or market prices." : selected === "unfulfilled" ? "Active restock subscriptions for your unavailable listings." : "Current wishlist saves, excluding your own. Recent saves compare the last 30 days with the preceding 30 days."}</p>
        {rows.length ? <div className="admin-table-wrap"><table className="hub-table"><thead><tr><th>Model</th><th>Saved by</th><th>Last 30 days</th><th>Previous 30 days</th><th>Restock alerts</th><th>Next step</th></tr></thead><tbody>{rows.map((row) => { const product = data.inventory.find((item) => item.id === row.productId)!; return <tr key={row.productId}><td><b>{product.title}</b><small>{product.scale} · {product.sellerSku}</small></td><td>{row.saves}</td><td>{row.recent}</td><td>{row.previous}</td><td>{row.restockSubscribers}</td><td><button className="text-button" disabled={data.store.status === "suspended"} onClick={() => navigate("inventory", "all", row.productId)}>Review listing →</button></td></tr>; })}</tbody></table></div> : <p className="store-empty">{selected === "trending" ? "No listings meet the trend threshold yet." : selected === "unfulfilled" ? "No collectors are currently waiting on your out-of-stock listings." : "Buyer interest will appear when collectors save your listings."}</p>}
      </section>}
      {(selected === "wants" || selected === "unfulfilled") && <section className="store-panel hub-data-panel"><p className="eyebrow">Marketplace Model Hunts</p><h3>{selected === "unfulfilled" ? "Unfulfilled demand" : "Want List demand"}</h3><p className="hub-note">Open Model Hunts across the marketplace, grouped by preferences and budget. Matches compare your catalog with the requested model, scale, maker, color, condition, and price. Buyer contact details remain private.</p>
        {wants.length ? <div className="admin-table-wrap"><table className="hub-table"><thead><tr><th>Wanted model</th><th>Requests</th><th>Budget per model</th><th>Your inventory</th></tr></thead><tbody>{wants.map((want, index) => <tr key={index}><td><b>{want.vehicleMake} {want.vehicleModel}</b><small>{[want.preferredScale, want.modelManufacturer, want.color, want.conditionPreference].filter(Boolean).join(" · ")}</small></td><td>{want.requests}</td><td>{want.maxBudgetCents === null ? "Not specified" : formatMoney(want.maxBudgetCents)}</td><td>{want.productIds.length ? <div className="row-actions">{want.productIds.map((id) => <button key={id} className="text-button" disabled={data.store.status === "suspended"} onClick={() => navigate("inventory", "all", id)}>Review {data.inventory.find((product) => product.id === id)?.sellerSku} →</button>)}</div> : <span>No matching listing</span>}</td></tr>)}</tbody></table></div> : <p className="store-empty">No open Model Hunts in this view. New requests will appear as collectors add them.</p>}
      </section>}
    </>}
  </div>;
}

function Unavailable({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <section className="store-panel hub-unavailable"><span className="hub-status">Not available yet</span><h3>{title}</h3><p>{detail}</p>{action}</section>;
}

const marketingViews = [["offers", "Offers"], ["discounts", "Discounts"], ["promoted", "Promoted listings"], ["followers", "Followers"]] as const;

export function HubMarketing({ data, navigate, filter }: Props & { filter?: string }) {
  const selected = marketingViews.some(([key]) => key === filter) ? filter : "offers";
  return <div className="store-stack">
    <Heading eyebrow="Seller Hub / Marketing" title="Marketing" description="Review pricing options and available marketing tools." />
    <nav className="hub-filters" aria-label="Marketing tools">{marketingViews.map(([value, label]) => <button key={value} aria-pressed={selected === value} onClick={() => navigate("marketing", value)}>{label}</button>)}</nav>
    {selected === "offers" && <><Unavailable title="Offers" detail="Targeted offers and buyer acceptance are not available yet. Saved listings can help you decide where a price adjustment could make a difference." action={<button className="button outline small" onClick={() => navigate("demand", "saved")}>Review interested collectors</button>} /><section className="hub-callout"><div><h3>Slow inventory</h3><p>{formatMoney(data.hub.slowValueCents)} at list price across {data.hub.slowIds.length} slow listings.</p></div><button className="button dark small" onClick={() => navigate("inventory", "slow")}>Review pricing →</button></section></>}
    {selected === "discounts" && <section className="store-panel hub-unavailable"><span className="hub-status">Price edits available</span><h3>Discounts & pricing</h3><p>Adjust a listing’s current price in the inventory editor. Coupon codes, scheduled sales, and crossed-out sale prices are not available yet.</p><button className="button dark small" onClick={() => navigate("inventory", "slow")}>Choose listings to reprice</button></section>}
    {selected === "promoted" && <Unavailable title="Promoted listings" detail="Paid placement and promotion campaigns are not available yet. Keep titles, model details, and photos complete so collectors can find your stock." action={<button className="button outline small" onClick={() => navigate("inventory")}>Review listings</button>} />}
    {selected === "followers" && <Unavailable title="Followers" detail="Store follows and follower campaigns are not tracked yet. Your public storefront is ready to share with collectors." action={<Link className="button outline small" href={`/sellers/${data.store.slug}`}>Open storefront</Link>} />}
  </div>;
}

export function HubAnalytics({ data, navigate, children }: Props & { children: ReactNode }) {
  const { hub } = data;
  return <div className="store-stack">
    <Heading eyebrow="Seller Hub / Analytics" title="Analytics" description="Sales performance, repeat buyers, payouts, and inventory metrics." />
    <div className="metric-grid store-metrics">
      <Metric label="Revenue" value={formatMoney(data.analytics.grossSalesCents)} note="Lifetime gross item sales, before refunds" />
      <Metric label="Repeat buyers" value={hub.repeatBuyers} note={`${hub.totalBuyers} buyers with paid orders · Lifetime`} />
      <Metric label="Sell-through" value={percent(hub.sellThroughPercent)} note="90-day units sold ÷ (units sold + available stock)" />
      <Metric label="Units sold" value={hub.units90} note="Last 90 days · Paid and partially refunded orders" />
    </div>
    <p className="hub-note">Sales include paid and partially refunded orders; unpaid and fully refunded orders are excluded. Partial refunds are not deducted from gross item sales.</p>
    <section className="store-panel" id="payouts"><p className="eyebrow">Payouts</p><h3>Payout summary</h3><div className="hub-payouts"><div><span>Released to Stripe</span><b>{formatMoney(hub.releasedCents)}</b><small>Recorded transfers less reversals</small></div><div><span>Held proceeds</span><b>{formatMoney(hub.heldCents)}</b><small>{hub.pendingFeeOrders ? `${hub.pendingFeeOrders} additional orders awaiting final fee amounts` : "Orders awaiting release"}</small></div></div><p className="hub-note">Transfers are releases to Stripe, not confirmation of bank deposits. Legacy direct payouts are excluded. Review individual orders for holds, refunds, and release timing.</p><button className="text-button" onClick={() => navigate("orders", "all")}>Review order payouts →</button></section>
    <div className="hub-two-column"><ProfitEstimate baseCents={data.analytics.netSalesCents} /><section className="store-panel"><p className="eyebrow">Inventory turnover</p><h3>Cost history needed</h3><p className="hub-note">Turnover is cost of goods sold divided by average inventory at cost for the same period. Purchase costs and historical inventory balances are not recorded yet.</p><p className="hub-note">Use sell-through to assess movement today. It covers the current in-stock catalog, excludes preorders and rejected listings, and uses available units after reservations. It is a unit-based estimate; refunds do not reverse units sold.</p><button className="text-button" onClick={() => navigate("inventory", "slow")}>Review slow inventory →</button></section></div>
    {children}
    <section className="store-panel hub-data-panel"><p className="eyebrow">Last 90 days</p><h3>Product performance</h3><p className="hub-note">Gross item revenue before fees and refunds. Products are grouped by listing, including sales of listings since removed.</p>{hub.performance.length ? <div className="admin-table-wrap"><table className="hub-table"><thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th><th>Next step</th></tr></thead><tbody>{hub.performance.map((row) => <tr key={row.id ?? row.title}><td><b>{row.title}</b></td><td>{row.units}</td><td>{formatMoney(row.revenueCents)}</td><td>{row.id && data.inventory.some((product) => product.id === row.id) ? <button className="text-button" disabled={data.store.status === "suspended"} onClick={() => navigate("inventory", "all", row.id!)}>Review listing →</button> : "Listing removed"}</td></tr>)}</tbody></table></div> : <p className="store-empty">Product performance will appear after a paid sale.</p>}</section>
  </div>;
}

function ProfitEstimate({ baseCents }: { baseCents: number }) {
  const [costs, setCosts] = useState("");
  const parsed = Number(costs);
  const valid = costs.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER / 100;
  return <section className="store-panel hub-profit"><p className="eyebrow">Profit estimate</p><h3>Estimated profit</h3><p className="hub-note">Start with {formatMoney(baseCents)} in lifetime item sales after marketplace commission. Enter your total product costs, processing fees, refunds, and net fulfillment expenses for those sales.</p><label htmlFor="hub-costs">Total costs and adjustments (USD)<input id="hub-costs" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Enter total costs" value={costs} onChange={(event) => setCosts(event.target.value)} aria-describedby="hub-profit-note" /></label><output aria-live="polite">{valid ? formatMoney(baseCents - Math.round(parsed * 100)) : "Enter costs to estimate profit"}</output><small id="hub-profit-note">Planning estimate only. This input is not saved. Include fulfillment expenses after shipping collected; tax collected is excluded from item revenue.</small></section>;
}
