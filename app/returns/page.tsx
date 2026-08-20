import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Returns & Refunds",
  description: "Return, refund, cancellation, damage, and order-issue rules for Model Car Center purchases.",
};

export default function ReturnsPage() {
  return <PolicyPage title="Returns & Refunds" intro="Independent sellers fulfill marketplace orders. This policy provides the platform-wide process, while the seller policy shown on the listing controls discretionary returns.">
    <h2>1. Start with the listing policy</h2>
    <p>Each seller’s return-policy summary appears on its storefront and product pages. Review it before buying. A seller may allow change-of-mind returns, limit them to a stated period, or mark an item final sale when clearly disclosed and lawful. A final-sale label does not remove rights for an item that is damaged in transit, materially different from its listing, counterfeit, or otherwise covered by non-waivable law.</p>

    <h2>2. Report an order problem</h2>
    <p>Email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> as soon as possible with the order number, a description of the issue, and clear photographs of the item, packaging, shipping label, and damage when relevant. For the fastest review, report damage, a wrong item, a missing item, or a material listing discrepancy within seven calendar days after carrier-recorded delivery. A delayed report does not waive any right that cannot lawfully be waived.</p>

    <h2>3. Do not send an unauthorized return</h2>
    <p>Wait for return instructions and the correct return address. Do not return an item to Model Car Center, a payment address, or the address printed on a package unless instructed. Unless the problem requires otherwise, keep the item, original model packaging, certificates, accessories, inserts, and shipping materials in the condition received while the request is reviewed.</p>

    <h2>4. Eligible remedies</h2>
    <ul>
      <li><b>Damaged, wrong, counterfeit, or materially not as described:</b> when the claim is supported, the seller must provide an appropriate remedy, which may be a return for a full refund, replacement if expressly accepted by the buyer, or another remedy required by law. The seller is responsible for reasonable authorized return shipping.</li>
      <li><b>Lost or not delivered:</b> we will work with the seller and carrier. If the order cannot be located or delivered, an appropriate replacement or full refund will be provided as required by law.</li>
      <li><b>Change of mind:</b> eligibility, deadline, restocking terms, and return-shipping responsibility follow the seller policy disclosed before purchase. The buyer normally pays authorized return shipping.</li>
      <li><b>Shipping delay:</b> cancellation and refund rights follow our <Link href="/shipping">Shipping Policy</Link> and applicable law.</li>
    </ul>

    <h2>5. Return condition</h2>
    <p>For a discretionary return, the item must be sent by the authorized deadline in the same condition in which it was delivered, with all components and original product packaging. A seller may reduce or deny a discretionary refund for an item that has been opened when sold as sealed, assembled, modified, damaged after delivery, used beyond reasonable inspection, or returned incomplete. This condition rule does not excuse damage, defects, or listing inaccuracies that existed at delivery.</p>

    <h2>6. Cancellations</h2>
    <p>Contact support immediately to request cancellation. An order may be cancelled and fully refunded before shipment if the seller can stop fulfillment, but cancellation is not guaranteed after payment. Once shipped, the applicable return rules apply. If we or the seller cancels for inventory error, inability to fulfill, legal restriction, or suspected fraud, any captured payment for the cancelled item will be returned to the original payment method.</p>

    <h2>7. Refund timing and method</h2>
    <p>Approved refunds are issued to the original payment method through Stripe. For an authorized return, the refund is normally initiated after the seller receives and reasonably inspects the item. Model Car Center currently supports full-order refunds through its marketplace tools; support will coordinate any other legally required adjustment. Once initiated, a bank or card network may take additional time to post the credit. Required refunds for unshipped merchandise will be issued within the time required by applicable law. Marketplace credit is not substituted where a cash or original-payment refund is legally required.</p>

    <h2>8. Payment disputes</h2>
    <p>Please contact us first so we can investigate quickly. Filing a chargeback does not expand or reduce your legal rights, but the payment provider’s process may control the dispute while it is open. We may provide the provider with relevant order, delivery, policy, and communication records.</p>

    <h2>9. Legal rights and contact</h2>
    <p>This policy supplements and does not limit non-waivable consumer rights. For help, email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a> with your order number.</p>
  </PolicyPage>;
}
