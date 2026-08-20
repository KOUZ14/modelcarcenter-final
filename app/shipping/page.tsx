import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Handling, delivery, tracking, delay, loss, and address rules for Model Car Center orders.",
};

export default function ShippingPage() {
  return <PolicyPage title="Shipping Policy" intro="Independent sellers package and ship orders placed through Model Car Center. This policy sets the marketplace-wide shipping standard.">
    <h2>1. Where we ship</h2>
    <p>Checkout is currently available only for delivery to supported addresses in the United States. A seller may be unable to ship to a P.O. box, military address, territory, or another restricted destination. Checkout will display the destinations available for the order. We do not currently offer international checkout.</p>

    <h2>2. Shipping price</h2>
    <p>The seller’s flat shipping charge is shown before checkout and applies once per single-seller order unless clearly stated otherwise. Taxes, when applicable, are shown at checkout. We do not add an undisclosed shipping or handling charge after payment.</p>

    <h2>3. Handling time</h2>
    <p>Unless a listing or seller policy clearly states a different handling time, the seller must tender the package to the carrier within five business days after payment confirmation. Weekends and U.S. federal holidays are not business days. Preorders are not permitted unless the expected shipping date and preorder status are clearly disclosed and approved by Model Car Center.</p>

    <h2>4. Tracking and delivery estimates</h2>
    <p>Sellers must use packaging appropriate for the collectible and provide valid carrier tracking promptly after shipment. We email tracking when it is recorded. Carrier transit dates are estimates, not guarantees, and may be affected by weather, service disruption, or other events outside reasonable control. A tracking label alone does not establish that a package was tendered to the carrier.</p>

    <h2>5. Delays and inability to ship</h2>
    <p>If a seller cannot ship within the promised time, Model Car Center or the seller will notify the buyer and provide the option to agree to the delay or cancel for a full refund as required by law. If no shipping time was stated, the order will be shipped within 30 days or the legally required delay-or-refund process will apply. The seller may cancel and refund instead of requesting consent to a delay.</p>

    <h2>6. Address accuracy</h2>
    <p>Review the delivery address in Stripe Checkout before paying. Contact us immediately if it is wrong. We cannot guarantee an address change after payment, and sellers must not redirect a package without confirmed instructions. If a package is returned because the buyer supplied an incomplete or incorrect address, the buyer may be responsible for reasonable reshipment cost unless law requires otherwise.</p>

    <h2>7. Loss, damage, and delivery disputes</h2>
    <p>The seller remains responsible for proper packaging and for responding to a package that is lost or damaged before carrier-recorded delivery. If tracking says delivered but the package is missing, check the delivery area and household, then contact us promptly so the seller can start a carrier inquiry. Signature confirmation may be used for higher-value orders. Remedies for loss, damage, a wrong item, or material listing discrepancy are described in our <Link href="/returns">Returns &amp; Refunds Policy</Link>.</p>

    <h2>8. Contact</h2>
    <p>For shipping help, email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with the order number.</p>
  </PolicyPage>;
}
