import Link from "next/link";
import { estimateSellerProceeds } from "@/lib/seller-calculator";

export function SellerFeeDisclosure({ marketplaceFeeBps, price }: { marketplaceFeeBps: number; price?: string }) {
  if (price !== undefined) {
    const valid = /^\$?\d+(\.\d{1,2})?$/.test(price.trim()) && Number(price.replace(/^\$/, "")) <= 1_000_000;
    const cents = valid ? Math.round(Number(price.replace(/^\$/, "")) * 100) : 0;
    const commission = Math.round(cents * marketplaceFeeBps / 10000);
    const money = (value: number) => `$${(value / 100).toFixed(2)}`;
    return <div className="seller-fee-disclosure listing-fee-estimate">
      <p><b>{marketplaceFeeBps / 100}% marketplace commission</b> on the item price, plus actual payment processing. No listing or monthly fees.</p>
      {valid ? <dl><div><dt>Commission per item</dt><dd>{money(commission)}</dd></div><div><dt>Item amount after commission</dt><dd>{money(cents - commission)}</dd></div></dl> : <p>Enter a price to see this listing’s commission.</p>}
      <p className="field-note">Before processing and fulfillment costs. Buyer-paid shipping is added to your proceeds; sales tax is withheld. Final processing and shipping costs are not yet known.</p>
      <details><summary>How fees and payouts work</summary><p>Commission excludes shipping and sales tax. Stripe’s actual processing fee applies to the buyer’s full payment, including shipping and tax, and varies by payment method. You pay postage, packaging, and inventory costs. Model Car Center covers its Stripe Tax service and Connect account/payout fees.</p><Link href="/seller-terms#fees">Full fee, refund, and payout terms</Link></details>
    </div>;
  }
  const rate = marketplaceFeeBps / 100;
  const estimate = estimateSellerProceeds({ itemCents: 20000, shippingCents: 1000, taxCents: 2000, feeBps: marketplaceFeeBps, processingBps: 290, processingFixedCents: 30 });
  const commission = estimate.platformFeeCents / 100;
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
        <div><dt>You receive before fulfillment costs</dt><dd>${(estimate.proceedsCents / 100).toFixed(2)}</dd></div>
      </dl>
      <p>Example only: processing assumes 2.9% + $0.30 of the full payment; actual fees and tax vary. The $10 shipping payment is included in your proceeds; your postage, packaging, and inventory costs still need to be paid. <Link href="/sell#proceeds-title">Try the proceeds calculator for each seller type</Link>.</p>
    </details>
    <p><Link href="/seller-terms#fees">Full fee, refund, and payout terms</Link></p>
  </div>;
}
