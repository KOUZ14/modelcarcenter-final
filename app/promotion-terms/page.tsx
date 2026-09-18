import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PROMOTION_TERMS_VERSION } from "@/lib/promotion-rules";
export const metadata = { title: "Promotion terms" };
export default function Page() {
  return <main><SiteHeader/><article className="inner-page shell legal-page" id="main-content" tabIndex={-1}>
    <h1>Promotion terms</h1><p>Version {PROMOTION_TERMS_VERSION}</p>
    <h2>What you purchase</h2><p>A promotion gives one eligible listing access to rotating sponsored placements for seven calendar days from payment verification and activation. The price and any applicable tax are shown before payment. There is no automatic renewal.</p>
    <h2>Placement and availability</h2><p>Placements match a collector&apos;s search and filters, appear on the first marketplace results page, and rotate between stores. There may be no placement when the listing is already visible in regular results. No minimum views, clicks, sales, or particular position is guaranteed.</p><p>Your store must remain active and accept current seller terms. Your listing must remain active, in stock, have available units and a primary photo. Unavailable listings are suppressed and can reappear during the remaining campaign period when eligible again.</p>
    <h2>Pauses, cancellation, and refunds</h2><p>You may pause, resume, or end eligible campaigns from Seller Hub. Pausing or temporarily losing listing eligibility does not extend the expiry. Voluntary cancellation after activation does not qualify for a refund. If payment succeeds but activation cannot occur, a full refund is requested. Refund processing may take time and the campaign shows its refund status.</p><p>Contact support about a platform service failure. Model Car Center can terminate campaigns and issue full or partial refunds for service adjustments. Refund requests and payment disputes stop placement. These terms do not limit rights that cannot be excluded by applicable law.</p>
    <h2>Reporting</h2><p>Impressions count recorded views where at least half the sponsored card was visible for a continuous second. Clicks count recorded product-link interactions. Reporting can be affected by browser settings, blocked requests, and unidentified automated traffic. Counts do not represent unique people, attributed sales, or guaranteed results.</p>
    <p><Link href="/contact">Contact support</Link> · <Link href="/store?view=marketing&filter=promoted">Return to promotions</Link></p>
  </article><SiteFooter/></main>;
}
