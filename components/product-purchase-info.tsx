import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { activeProtectionPolicy } from "@/lib/protection";
import styles from "./purchase-info.module.css";

export function ProductSellerLine({ product, preview = false }: { product: ProductDetail; preview?: boolean }) {
  return <div className={styles.sellerLine}>
    <p>Sold by {preview ? <span>{product.sellerName}</span> : <Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link>}</p>
    {preview ? <span className={styles.messageSeller} aria-disabled="true">Message seller</span> : <Link className={styles.messageSeller} href={`/messages?product=${encodeURIComponent(product.id)}`}>Message seller</Link>}
  </div>;
}

export function ProductPurchaseInfo({ product }: { product: ProductDetail }) {
  return <section className={styles.purchaseInfo} aria-label="Before you buy">
    <div className={styles.essentials}>
      <p><strong>Dispatch:</strong> Within {product.handlingTimeBusinessDays} business day{product.handlingTimeBusinessDays === 1 ? "" : "s"}{product.availabilityType === "preorder" ? " after release and balance payment" : " after payment"}. Carrier transit time is additional.</p>
      <p><strong>Returns &amp; problems:</strong> Open a return or refund request in <Link href="/resolution">MCC Customer Support</Link> within <strong>{activeProtectionPolicy.deliveredDays} calendar days after carrier-confirmed delivery</strong>. Messaging the seller alone does not open a platform request.</p>
    </div>
    <details className={styles.listingDetails} id="listing-returns">
      <summary>Seller&apos;s return policy &amp; buyer protection</summary>
      <div className={styles.summary}>
        <p><strong>Seller&apos;s separate return policy</strong></p>
        {product.returnPolicySummary ? <blockquote>{product.returnPolicySummary}</blockquote> : <p>The seller has not provided a policy. Ask before buying; do not assume change-of-mind returns are accepted.</p>}
        <p>Follow any seller contact requirements above as well. A longer seller window does not extend the <strong>{activeProtectionPolicy.deliveredDays}-calendar-day MCC request deadline after carrier-confirmed delivery</strong>. Open your platform request on time even while discussing a return with the seller.</p>
        <p>For a covered problem, such as damage or a materially inaccurate listing, the seller pays reasonable authorized return shipping. Change-of-mind eligibility follows the seller&apos;s disclosed policy; the buyer normally pays authorized return shipping.</p>
        <p>Wait for return authorization and shipping instructions before sending the model back.</p>
        <p><strong>Non-delivery:</strong> Open a request in <Link href="/resolution">MCC Customer Support</Link> within {activeProtectionPolicy.shipmentDays} calendar days after shipment, or {activeProtectionPolicy.paymentDays} after payment if unshipped. Your order shows the exact deadline.</p>
        <p><Link href="/returns">Return rules</Link> · <Link href="/protection">Full protection details</Link></p>
      </div>
    </details>
  </section>;
}
