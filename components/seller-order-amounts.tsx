import { sellerProcessingDeduction, sellerProceedsAfterRefund, type SellerFeeAmounts } from "@/lib/seller-proceeds";

export function SellerOrderAmounts({ order }: { order: SellerFeeAmounts & {
  currency: string; subtotalCents: number; shippingCents: number;
  marketplaceFeeBps: number; sellerProceedsCents: number | null;
  refundedAmountCents: number; paymentStatus: string;
} }) {
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(cents / 100);
  const deduction = sellerProcessingDeduction(order);
  const sellerPays = order.processingFeePayer === "seller";
  const refunded = order.paymentStatus === "refunded" || order.refundedAmountCents > 0;
  const remaining = order.sellerProceedsCents == null ? null : order.paymentStatus === "refunded" ? 0 :
    sellerProceedsAfterRefund({ ...order, sellerProceedsCents: order.sellerProceedsCents });
  return <dl className="store-order-totals seller-order-amounts">
    <div><dt>Item subtotal</dt><dd>{money(order.subtotalCents)}</dd></div>
    <div><dt>Buyer-paid shipping</dt><dd>{money(order.shippingCents)}</dd></div>
    <div><dt>Sales tax collected</dt><dd>{money(order.taxCents)}</dd></div>
    <div><dt>Customer paid</dt><dd>{money(order.totalCents)}</dd></div>
    <div><dt>Sales tax withheld</dt><dd>−{money(order.taxCents)}</dd></div>
    <div><dt>Marketplace commission ({order.marketplaceFeeBps / 100}%)</dt><dd>−{money(order.platformFeeCents)}</dd></div>
    <div><dt>Payment processing {sellerPays ? "(your deduction)" : "(paid by Model Car Center)"}</dt><dd>{sellerPays
      ? deduction == null ? "Awaiting actual Stripe fee" : `−${money(deduction)}`
      : `${money(0)} deducted from you`}</dd></div>
    <div><dt>Your proceeds {refunded ? "before refunds" : "before fulfillment costs"}</dt><dd>{order.sellerProceedsCents == null
      ? sellerPays ? "Pending - waiting for Stripe fee" : "Not recorded for this order"
      : money(order.sellerProceedsCents)}</dd></div>
    {refunded && <><div><dt>Customer refunds</dt><dd>{money(order.refundedAmountCents)}</dd></div><div><dt>Your proceeds after refunds, before fulfillment costs</dt><dd>{remaining == null ? "Pending" : money(remaining)}</dd></div></>}
  </dl>;
}
