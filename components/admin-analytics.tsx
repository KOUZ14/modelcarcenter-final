"use client";

import { useState } from "react";
import { summarizeAdminAnalytics, type AdminAnalyticsReport } from "@/lib/admin-analytics";
import type { AnalyticsEventName } from "@/lib/analytics-rules";
import { trafficPages, trafficSources, type TrafficPage, type TrafficSource } from "@/lib/traffic-rules";

const activityGroups: Array<{ title: string; events: Array<[AnalyticsEventName, string]> }> = [
  { title: "Buyer activity", events: [
    ["buyer_search", "Searches"], ["buyer_empty_results", "Searches with no results"],
    ["listing_viewed", "Listing views"], ["add_to_cart", "Adds to cart"],
    ["shipping_completed", "Shipping completed"], ["checkout_started", "Checkouts started"],
    ["purchase_completed", "Confirmed purchase returns"],
  ] },
  { title: "Seller activity", events: [
    ["seller_setup_started", "Setup starts observed"], ["seller_setup_step_completed", "Setup steps completed"],
    ["first_listing_published", "First publications observed"], ["inventory_import", "Import previews and commits"],
    ["seller_tool_used", "Seller tool actions"],
  ] },
  { title: "Unfinished tasks", events: [["task_abandoned", "Edited tasks left unfinished"]] },
];
const number = (value: number) => value.toLocaleString("en-US");

export function AdminAnalytics({ report }: { report: AdminAnalyticsReport }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const summary = summarizeAdminAnalytics(report, days);
  const peak = Math.max(1, ...summary.daily.map(row => row.accounts));
  return <div className="admin-analytics">
    <div className="admin-queue-filters">
      <label>Date range<select value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}>
        <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
      </select></label>
      <p className="admin-muted">{summary.start} to {summary.end} (UTC). Today is partial.</p>
    </div>

    <section aria-labelledby="analytics-traffic">
      <h2 id="analytics-traffic">Website traffic</h2>
      <p className="admin-muted">Consenting browsers only. Visitors are distinct browser identifiers, not individual people. Multiple devices, cleared storage, or identifier expiry can count the same person again.</p>
      <div className="metric-grid">
        <article><span>Visitors (browsers)</span><b>{number(summary.visitors)}</b><small>Distinct in the last {days} days</small></article>
        <article><span>Page views</span><b>{number(summary.views)}</b><small>Last {days} days</small></article>
      </div>
      {summary.views === 0 && <p className="admin-message">No traffic recorded in this period. Traffic collection starts after deployment and a visitor accepts the updated usage-measurement choice. Earlier traffic cannot be backfilled.</p>}
      <div className="admin-analytics-groups">
        <section className="admin-analytics-card"><h3>Traffic sources</h3><p className="admin-muted">Page views by the tab’s entry source. Missing referrers appear as Direct / unknown.</p>
          <dl>{Object.entries(trafficSources).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{number(summary.sources[key as TrafficSource] ?? 0)}</dd></div>)}</dl>
        </section>
        <section className="admin-analytics-card"><h3>Pages visited</h3><p className="admin-muted">Page categories; private URLs and search terms are excluded.</p>
          {Object.keys(summary.pages).length ? <dl>{Object.entries(summary.pages).sort((a, b) => b[1] - a[1]).map(([key, count]) => <div key={key}><dt>{trafficPages[key as TrafficPage] ?? "Other pages"}</dt><dd>{number(count)}</dd></div>)}</dl> : <p>No page views yet.</p>}
        </section>
      </div>
    </section>

    <section aria-labelledby="analytics-accounts">
      <h2 id="analytics-accounts">Account growth</h2>
      <p className="admin-muted">Current registered accounts, including staff and test accounts. Deleted accounts and guest shoppers are excluded. Subscribers are counted separately in Subscribers.</p>
      <div className="metric-grid">
        <article><span>Registered accounts</span><b>{number(report.accounts.total)}</b><small>Current total</small></article>
        <article><span>New accounts</span><b>{number(summary.newAccounts)}</b><small>Last {days} days</small></article>
        <article><span>Verified emails</span><b>{number(report.accounts.verified)}</b><small>Current total</small></article>
        <article><span>Accounts with seller profiles</span><b>{number(report.accounts.sellers)}</b><small>Any seller status</small></article>
      </div>
      <figure className="admin-signup-trend">
        <figcaption>New accounts per day · {number(summary.newAccounts)} in this period</figcaption>
        <div className="admin-signup-bars" aria-hidden="true">
          {summary.daily.map(row => <div key={row.day} title={`${row.day}: ${number(row.accounts)} new accounts`}>
            <span style={{ height: `${row.accounts / peak * 100}%` }} />
          </div>)}
        </div>
        <div className="admin-signup-axis" aria-hidden="true"><span>{summary.start}</span><span>{summary.end}</span></div>
      </figure>
      {summary.newAccounts === 0 && <p>No new accounts in this period.</p>}
    </section>

    <section aria-labelledby="analytics-activity">
      <h2 id="analytics-activity">Measured activity</h2>
      <p className="admin-muted">{number(summary.totalEvents)} opted-in events in this period. These are task counts, not unique users or conversion rates. Known staff and test activity is excluded; events expire after 90 days.</p>
      {!report.measurementEnabled && <p className="admin-warning">Usage measurement is paused in test mode. Account totals still reflect this database; any previously recorded events remain visible for the reporting period.</p>}
      {summary.totalEvents === 0 && <p className="admin-message" role="status">No measured activity in this period. Events are recorded in live mode only when visitors allow usage measurement in Cookie settings. Global Privacy Control and Do Not Track keep measurement off.</p>}
      <div className="admin-analytics-groups">{activityGroups.map(group => <section className="admin-analytics-card" key={group.title}>
        <h3>{group.title}</h3>
        <dl>{group.events.map(([name, label]) => <div key={name}><dt>{label}</dt><dd>{number(summary.events[name] ?? 0)}</dd></div>)}</dl>
      </section>)}</div>
      <p className="admin-muted">Confirmed purchase returns count consenting buyers who return to confirmation, once per checkout. Use Orders for sales totals. Seller setup observations are device-based; unfinished tasks do not necessarily indicate an error.</p>
    </section>

    <details className="admin-analytics-daily">
      <summary>Daily account and activity counts</summary>
      <div className="admin-table-wrap" role="region" aria-label="Daily analytics" tabIndex={0}>
        <table className="admin-table"><caption>Last {days} UTC days, newest first</caption>
          <thead><tr><th scope="col">Date (UTC)</th><th scope="col">New accounts</th><th scope="col">Visitors (browsers)</th><th scope="col">Page views</th><th scope="col">Task events</th></tr></thead>
          <tbody>{[...summary.daily].reverse().map(row => <tr key={row.day}><th scope="row">{row.day}</th><td>{number(row.accounts)}</td><td>{number(row.visitors)}</td><td>{number(row.views)}</td><td>{number(row.events)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <p className="admin-muted">Report generated {report.checkedAt.replace("T", " ").slice(0, 19)} UTC. Reload to update. Daily visitor counts cannot be added to get distinct visitors for the full period.</p>
  </div>;
}
