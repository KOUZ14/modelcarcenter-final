import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { formatCondition } from "@/lib/format";
import { activeProtectionPolicy } from "@/lib/protection";
import styles from "./purchase-info.module.css";

export function ProductSellerLine({ product }: { product: ProductDetail }) {
  return <div className={styles.sellerLine}>
    <p>Sold by <Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link></p>
    <Link className={styles.messageSeller} href={`/messages?product=${encodeURIComponent(product.id)}`}>Message seller</Link>
  </div>;
}

export function ProductPurchaseInfo({ product }: { product: ProductDetail }) {
  return <section className={styles.purchaseInfo} aria-label="Before you buy">
    <div className={styles.essentials}>
      <p><strong>Dispatch:</strong> Within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. Carrier transit time is additional.</p>
      <p><strong>Order protection:</strong> Report damage, a materially inaccurate listing or another covered problem within <strong>{activeProtectionPolicy.deliveredDays} calendar days after confirmed delivery</strong>. <Link href="/protection">Full protection details</Link></p>
    </div>
    <details className={styles.listingDetails}>
      <summary>Seller, packaging and returns details</summary>
      <div className={styles.summary}>
        <dl>
          <div><dt>Sold by</dt><dd><Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link><small>{product.sellerType === "collector" ? "Individual collector" : "Professional store"} · Active marketplace seller</small></dd></div>
          <div><dt>Model</dt><dd>{formatCondition(product.modelCondition)}{product.packagingCondition === "sealed" && <small>Factory sealed; hidden contents cannot be inspected.</small>}</dd></div>
          <div><dt>Original box</dt><dd>{formatCondition(product.originalBoxStatus)}</dd></div>
          <div><dt>Packaging</dt><dd>{formatCondition(product.packagingCondition)}</dd></div>
        </dl>
        <p>Seller pays reasonable authorized return shipping for covered problems.</p>
        <p><strong>Non-delivery:</strong> Report within {activeProtectionPolicy.shipmentDays} calendar days after shipment, or {activeProtectionPolicy.paymentDays} after payment if unshipped. Your order shows the exact deadline.</p>
        <p><strong>Change of mind:</strong> {product.returnPolicySummary || "The seller has not provided a policy. Ask before buying; do not assume change-of-mind returns are accepted."} The platform request window is {activeProtectionPolicy.deliveredDays} calendar days after delivery; the buyer normally pays authorized return shipping. <Link href="/returns">Return rules</Link></p>
        <p><Link href="#product-information-title">Condition, photos and full listing details</Link></p>
      </div>
    </details>
  </section>;
}
