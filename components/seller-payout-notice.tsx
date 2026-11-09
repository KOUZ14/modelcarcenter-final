import Link from "next/link";
import { SELLER_PAYOUT_SUMMARY, SELLER_PAYOUT_RELEASE_EXPLANATION } from "@/lib/payout-schedule";

export function SellerPayoutNotice() {
  return <div className="seller-payout-notice">
    <p><strong>Weekly bank payouts · Mondays</strong></p>
    <p>{SELLER_PAYOUT_SUMMARY}</p>
    <p>{SELLER_PAYOUT_RELEASE_EXPLANATION}</p>
    <p>Check your Stripe dashboard for your account’s current schedule and estimated bank arrival. <Link href="/seller-terms#payout-schedule">Payout terms</Link>.</p>
  </div>;
}
