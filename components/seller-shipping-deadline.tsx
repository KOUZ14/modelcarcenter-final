import Link from "next/link";
import { formatUtcDateTime } from "@/lib/format";
import { needsShipment, orderHandlingReminder, sellerTimestamp, type ShippingDeadlineOrder } from "@/lib/seller-dashboard";
import "./seller-shipping-deadline.css";

export function SellerShippingDeadline({ order }: { order: ShippingDeadlineOrder & { orderNumber: string } }) {
  if (!needsShipment(order)) return null;
  const reminder = orderHandlingReminder(order);
  const deadline = sellerTimestamp(order.shipByAt);
  const recorded = Number.isFinite(deadline);
  return <section className="seller-shipping-deadline" aria-label="Shipping deadline">
    {reminder.level !== "none" && <span className={`handling-badge ${reminder.level}`}>{reminder.label}</span>}
    <p><strong>{recorded ? <>Ship by <time dateTime={new Date(deadline).toISOString()}>{formatUtcDateTime(order.shipByAt!)}</time></> : "Ship-by date not recorded"}</strong></p>
    <p>{recorded ? "Hand the package to the carrier by this deadline. Creating a label does not count as shipping." : "Contact support to confirm the shipping deadline for this order."}</p>
    {recorded && reminder.level !== "overdue"
      ? <Link href="/shipping/requests">Request a shipping delay before the deadline</Link>
      : <Link href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}>Contact support about this order</Link>}
  </section>;
}
