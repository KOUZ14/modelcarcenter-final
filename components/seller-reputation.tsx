import Link from "next/link";
import type { SellerReputation as SellerReputationData } from "@/lib/reputation";

export function SellerReputation({
  reputation,
  sellerSlug,
  compact = false,
}: {
  reputation: SellerReputationData;
  sellerSlug: string;
  compact?: boolean;
}) {
  const metrics = [
    {
      label: "Completed transactions",
      value: reputation.completedTransactions.toLocaleString("en-US"),
      detail: "Paid orders shipped to buyers",
    },
    {
      label: "On-time shipment",
      value:
        reputation.onTimeShipmentRate == null
          ? "Not yet rated"
          : `${reputation.onTimeShipmentRate}%`,
      detail: reputation.trackedShipments
        ? `${reputation.onTimeShipments} of ${reputation.trackedShipments} deadline-tracked shipments`
        : "No deadline-tracked shipments yet",
    },
    {
      label: "Seller tenure",
      value: tenure(reputation.sellerSince),
      detail: `Selling here since ${monthYear(reputation.sellerSince)}`,
    },
    {
      label: "Verified feedback",
      value:
        reputation.averageRating == null
          ? "No feedback yet"
          : `${reputation.averageRating.toFixed(1)} / 5`,
      detail: `${reputation.feedbackCount.toLocaleString("en-US")} verified purchase${reputation.feedbackCount === 1 ? "" : "s"}`,
    },
    {
      label: "Resolved cases",
      value: reputation.totalCases
        ? `${reputation.resolvedCases} of ${reputation.totalCases}`
        : "No cases",
      detail: reputation.totalCases
        ? "Closed, resolved, or denied through Customer Support"
        : "No Customer Support case history",
    },
  ];

  if (compact) {
    return (
      <section className="reputation-compact" aria-label="Verified seller record">
        <div className="reputation-compact-heading">
          <div>
            <p className="eyebrow">Verified seller record</p>
            <b>Marketplace activity, not self-reported claims</b>
          </div>
          <Link href={`/sellers/${sellerSlug}#reputation`}>Full history</Link>
        </div>
        <dl>
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <small>{metric.detail}</small>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <section className="seller-reputation" id="reputation">
      <header>
        <div>
          <p className="eyebrow">Verified marketplace record</p>
          <h2>Reputation you can inspect</h2>
        </div>
        <p>
          These signals come from Model Car Center orders, shipment deadlines,
          buyer-linked feedback, and Customer Support outcomes. Sellers cannot
          edit them.
        </p>
      </header>
      <dl className="reputation-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <small>{metric.detail}</small>
          </div>
        ))}
      </dl>
      <div className="verified-feedback">
        <div className="verified-feedback-heading">
          <div>
            <p className="eyebrow">Buyer feedback</p>
            <h3>From completed purchases</h3>
          </div>
          <span>Verified purchase only</span>
        </div>
        {reputation.recentFeedback.length ? (
          <div className="feedback-list">
            {reputation.recentFeedback.map((feedback) => (
              <article key={feedback.id}>
                <div>
                  <b>{feedback.buyerName}</b>
                  <span>
                    <strong aria-label={`${feedback.rating} out of 5`}>
                      {feedback.rating.toFixed(1)} / 5
                    </strong>
                    <em>Verified purchase</em>
                  </span>
                </div>
                <p>{feedback.comment}</p>
                <time dateTime={feedback.createdAt}>
                  {monthYear(feedback.createdAt)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <p className="feedback-empty">
            No verified-purchase feedback has been published for this seller yet.
          </p>
        )}
      </div>
    </section>
  );
}

function tenure(value: string) {
  const started = new Date(value);
  if (Number.isNaN(started.getTime())) return "New seller";
  const now = new Date();
  const months = Math.max(
    0,
    (now.getUTCFullYear() - started.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      started.getUTCMonth(),
  );
  if (months < 1) return "Joined this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder
    ? `${years}y ${remainder}m`
    : `${years} year${years === 1 ? "" : "s"}`;
}

function monthYear(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}
