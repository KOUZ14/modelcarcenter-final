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
      label: "Seller reviews",
      value:
        reputation.averageRating == null
          ? "No reviews yet"
          : `${reputation.averageRating.toFixed(1)} / 5`,
      detail: `${reputation.feedbackCount.toLocaleString("en-US")} verified purchase review${reputation.feedbackCount === 1 ? "" : "s"}`,
    },
  ];

  if (reputation.completedTransactions === 0 && reputation.feedbackCount === 0) {
    return <section className="seller-reputation-new" id={compact ? undefined : "reputation"} aria-label="Seller history"><h2>New to Model Car Center</h2><p>This seller has no completed marketplace transactions or verified purchase feedback yet. Community likes and followers are separate from purchase feedback.</p><p>A professional store&apos;s approval means its application was accepted. Collector listings are reviewed before publication. Stripe handles payment-account checks. These checks do not guarantee a model&apos;s authenticity or condition.</p><details><summary>View marketplace history</summary><dl>{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value} · {metric.detail}</dd></div>)}</dl></details>{compact && <Link href={`/sellers/${sellerSlug}`}>About this seller</Link>}</section>;
  }

  if (compact) {
    return (
      <section className="reputation-compact" aria-label="Verified seller record">
        <div className="reputation-compact-heading">
          <div>
            <p className="eyebrow">Seller Information</p>
            <h2>Verified seller record</h2>
          </div>
          <Link href={`/sellers/${sellerSlug}#reputation`}>Full history</Link>
        </div>
        <dl>
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>
                <span className="reputation-compact-value">{metric.value}</span>
                <small>{metric.detail}</small>
              </dd>
            </div>
          ))}
        </dl>
        <SellerReviews feedback={reputation.recentFeedback.slice(0, 2)} />
      </section>
    );
  }

  return (
    <section className="seller-reputation" id="reputation">
      <header>
        <div>
          <p className="eyebrow">Verified marketplace record</p>
          <h2>Seller reputation</h2>
        </div>
        <p>
          These signals come from Model Car Center orders, shipment deadlines,
          and verified purchase reviews. Sellers cannot
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
      <SellerReviews feedback={reputation.recentFeedback} />
    </section>
  );
}

function SellerReviews({ feedback }: { feedback: SellerReputationData["recentFeedback"] }) {
  return (
    <div className="verified-feedback">
      <div className="verified-feedback-heading">
        <div>
          <p className="eyebrow">Verified purchases</p>
          <h3>Seller reviews</h3>
        </div>
        <span>Verified purchase only</span>
      </div>
      {feedback.length ? (
        <div className="feedback-list">
          {feedback.map((review) => (
            <article key={review.id}>
              <div>
                <b>{review.buyerName}</b>
                <span>
                  <strong aria-label={`${review.rating} out of 5`}>
                    {review.rating.toFixed(1)} / 5
                  </strong>
                  <em>Verified purchase</em>
                </span>
              </div>
              <p>{review.comment}</p>
              <time dateTime={review.createdAt}>
                {monthYear(review.createdAt)}
              </time>
            </article>
          ))}
        </div>
      ) : (
        <p className="feedback-empty">No verified purchase reviews yet.</p>
      )}
    </div>
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
