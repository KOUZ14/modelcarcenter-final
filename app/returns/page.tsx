import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Returns & Refunds",
  description: "Return, refund, cancellation, damage, and order-issue rules for Model Car Center purchases.",
};

export default function ReturnsPage() {
  return <PolicyPage title="Returns & Refunds" intro="Independent sellers fulfill marketplace orders. This policy provides the platform-wide process, while the seller policy shown on the listing controls discretionary returns.">
    <h2>1. Start with the listing policy</h2>
    <p>Each seller’s return-policy summary appears on its storefront and product pages. A seller may allow change-of-mind returns, limit them to a stated period, or mark an item final sale when clearly disclosed and lawful. A final-sale label does not remove rights for an item damaged in transit, materially different from its listing, counterfeit, or otherwise protected by non-waivable law.</p>

    <h2>2. Report an order problem</h2>
    <p>Open the authenticated <Link href="/resolution">Resolution &amp; Protection Center</Link>, choose the order, describe the issue, and add clear photographs or PDFs of the item, packaging, shipping label, and damage when relevant. The case displays its status, seller response deadline, evidence deadline, and any return deadline. The marketplace reporting windows and responsibilities are stated in the <Link href="/protection">Buyer &amp; Seller Protection Rules</Link>.</p>

    <h2>3. Do not send an unauthorized return</h2>
    <p>Wait until the case displays a return authorization number, instructions, and downloadable label. Do not return an item to Model Car Center, a payment address, or an address printed on a package unless the case instructs you to do so. Preserve the item, original model packaging, certificates, accessories, inserts, and shipping materials in the condition received while the request is reviewed.</p>

    <h2>4. Eligible remedies</h2>
    <ul>
      <li><b>Damaged, wrong, counterfeit, missing, or materially not as described:</b> when supported, the remedy may be a return for a full refund, a partial refund the buyer accepts while keeping the item, a full refund without return, or another remedy required by law. The seller pays reasonable authorized return shipping for covered problems.</li>
      <li><b>Lost or not delivered:</b> the seller and platform review tracking and carrier records. If the order cannot be located or delivered, an appropriate full refund or accepted replacement is provided.</li>
      <li><b>Change of mind:</b> eligibility, deadline, restocking terms, and return-shipping responsibility follow the seller policy disclosed before purchase. The buyer normally pays authorized return shipping.</li>
      <li><b>Shipping delay:</b> cancellation and refund rights follow our <Link href="/shipping">Shipping Policy</Link> and applicable law.</li>
    </ul>

    <h2>5. Return condition</h2>
    <p>For a discretionary return, the item must be scanned by the carrier by the authorization deadline in the same condition in which it was delivered, with all components and original product packaging. A seller may reduce or deny a discretionary refund for an item opened when sold as sealed, assembled, modified, damaged after delivery, used beyond reasonable inspection, or returned incomplete. This rule does not excuse damage, defects, or listing inaccuracies that existed at delivery.</p>

    <h2>6. Cancellations</h2>
    <p>Contact support immediately to request cancellation. An order may be cancelled and fully refunded before shipment if the seller can stop fulfillment, but cancellation is not guaranteed after payment. Once shipped, applicable return rules apply. If Model Car Center or the seller cancels for inventory error, inability to fulfill, legal restriction, or suspected fraud, captured payment for the cancelled item is returned to the original payment method.</p>

    <h2>7. Refund timing and method</h2>
    <p>Approved partial and full refunds are issued through the case to the original payment method using Stripe. For an authorized return, the refund is normally initiated after the seller receives and reasonably inspects the item. The case records the refund amount and status. Once initiated, a bank or card network may take additional time to post the credit. Marketplace credit is not substituted where a cash or original-payment refund is required.</p>

    <h2>8. Payment disputes</h2>
    <p>Please use the Resolution Center first so the evidence and response history stay with the order. Filing a chargeback does not expand or reduce legal rights, but the payment provider’s process may control the dispute while open. Model Car Center may provide the provider with relevant order, delivery, policy, case, and communication records.</p>

    <h2>9. Legal rights</h2>
    <p>This policy and the Protection Rules supplement and do not limit non-waivable consumer rights.</p>
  </PolicyPage>;
}

