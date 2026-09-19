import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { formatCondition } from "@/lib/format";
import { activeProtectionPolicy } from "@/lib/protection";
import styles from "./purchase-info.module.css";

export function ProductPurchaseInfo({ product }: { product: ProductDetail }) {
  return <section className={styles.summary} aria-label="Before you buy">
    <dl>
      <div><dt>Sold by</dt><dd><Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link><small>{product.sellerType === "collector" ? "Individual collector" : "Professional store"} · Active marketplace seller</small></dd></div>
      <div><dt>Model</dt><dd>{formatCondition(product.modelCondition)}{product.packagingCondition === "sealed" && <small>Factory sealed; hidden contents cannot be inspected.</small>}</dd></div>
      <div><dt>Original box</dt><dd>{formatCondition(product.originalBoxStatus)}</dd></div>
      <div><dt>Packaging</dt><dd>{formatCondition(product.packagingCondition)}</dd></div>
      <div><dt>Dispatch</dt><dd>Within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. <small>This is time to ship, not arrival. Carrier transit time is additional.</small></dd></div>
    </dl>
    <p><strong>Order protection:</strong> Report damage, a materially inaccurate listing or another covered problem within <strong>{activeProtectionPolicy.deliveredDays} calendar days after confirmed delivery</strong>. Seller pays reasonable authorized return shipping for covered problems. <Link href="/protection">Full protection details</Link></p>
    <details><summary>Non-delivery and change-of-mind returns</summary>
      <p>Non-delivery: report within {activeProtectionPolicy.shipmentDays} calendar days after shipment, or {activeProtectionPolicy.paymentDays} after payment if unshipped. Your order shows the exact deadline.</p>
      <p><strong>Change of mind:</strong> {product.returnPolicySummary || "The seller has not provided a policy. Ask before buying; do not assume change-of-mind returns are accepted."} The platform request window is {activeProtectionPolicy.deliveredDays} calendar days after delivery; the buyer normally pays authorized return shipping. <Link href="/returns">Return rules</Link></p>
    </details>
    <p><Link href="#product-information-title">Condition, photos and full listing details</Link></p>
  </section>;
}
