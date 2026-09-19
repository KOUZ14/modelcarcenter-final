import Link from "next/link";
import { protectionPolicyForOrder, reportDeadlineForOrder } from "@/lib/protection";
import styles from "./purchase-info.module.css";

export function OrderProtectionSummary({ order }: { order: { createdAt: string; paidAt?: string | null; shippedAt?: string | null; deliveredAt?: string | null; refundRequestDeadline?: string | null; protectionPolicyVersion?: string | null } }) {
  const deadline = reportDeadlineForOrder(order);
  const policy = protectionPolicyForOrder(order);
  return <aside className={styles.summary} aria-label="Order protection deadline">
    <strong>Report an order problem by <time dateTime={deadline}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(deadline))} UTC</time></strong>
    <p>{order.deliveredAt ? `${policy.deliveredDays} calendar days after confirmed delivery.` : `Current non-delivery deadline. Once delivery is confirmed, the deadline becomes ${policy.deliveredDays} calendar days after delivery.`} Damage, non-delivery or a materially inaccurate listing can qualify for protection. The seller pays reasonable authorized return shipping for covered problems.</p>
    <p>Change-of-mind returns depend on the seller’s policy shown before purchase; the buyer normally pays return shipping. Open cases keep their own displayed response and return deadlines. <Link href="/returns">Return details</Link> · <Link href="/protection">Protection rules</Link></p>
  </aside>;
}
