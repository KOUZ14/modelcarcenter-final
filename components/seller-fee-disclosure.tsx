import Link from "next/link";

export function SellerFeeDisclosure({ marketplaceFeeBps }: { marketplaceFeeBps: number }) {
  const rate = marketplaceFeeBps / 100;
  const commission = Math.round(20_000 * marketplaceFeeBps / 10_000) / 100;
  return <div className="seller-fee-disclosure">
    <p><b>You pay {rate}% marketplace commission + actual payment processing.</b></p>
    <ul>
      <li><b>Commission:</b> {rate}% of the item subtotal. Shipping and sales tax are excluded.</li>
      <li><b>Payment processing:</b> Stripe’s actual transaction fee, deducted from your proceeds with no markup. It is based on the customer’s full payment, including shipping and tax, and varies by payment method and card.</li>
      <li><b>Your proceeds:</b> item subtotal + buyer-paid shipping − commission − payment processing. Collected sales tax is withheld and is not paid to you.</li>
    </ul>
    <p>You cover fulfillment costs. Model Car Center covers its Stripe Tax service and Connect account/payout fees. No listing or monthly selling fees.</p>
    <details>
      <summary>See an example of what you receive</summary>
      <dl className="store-order-totals">
        <div><dt>Item subtotal</dt><dd>$200.00</dd></div>
        <div><dt>Buyer-paid shipping</dt><dd>$10.00</dd></div>
        <div><dt>Illustrative sales tax</dt><dd>$20.00</dd></div>
        <div><dt>Customer pays</dt><dd>$230.00</dd></div>
        <div><dt>Sales tax withheld</dt><dd>−$20.00</dd></div>
        <div><dt>Marketplace commission ({rate}%)</dt><dd>−${commission.toFixed(2)}</dd></div>
        <div><dt>Assumed processing fee</dt><dd>−$6.97</dd></div>
        <div><dt>You receive before fulfillment costs</dt><dd>${(210 - commission - 6.97).toFixed(2)}</dd></div>
      </dl>
      <p>Example only: tax and processing fees vary. The $10 shipping payment is included in your proceeds; your postage, packaging, and inventory costs still need to be paid.</p>
    </details>
    <p><Link href="/seller-terms#fees">Full fee, refund, and payout terms</Link></p>
  </div>;
}
