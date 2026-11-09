// Bank payouts are separate from the order's delivery-based release deadline.
export const SELLER_PAYOUT_DAY = "monday";
export const SELLER_PAYOUT_DAY_LABEL = "Monday";
export const SELLER_PAYOUT_POLICY_VERSION = "weekly-monday-v1";
export const SELLER_PAYOUT_EFFECTIVE_DATE = "November 8, 2026";
export const SELLER_PAYOUT_SUMMARY = "Available seller funds are scheduled for bank payout every Monday. Bank arrival can take additional business days; holidays and Stripe account restrictions can delay a payout.";
export const SELLER_PAYOUT_RELEASE_EXPLANATION = "New-order proceeds become eligible for release 14 calendar days after confirmed delivery, subject to open cases, final processing fees, and account readiness. Existing orders keep their recorded release deadlines. Funds must be available in Stripe before they can be included in a weekly bank payout.";

export type SellerPayoutSchedule = {
  interval?: string;
  weekly_anchor?: string | null;
  weekly_payout_days?: string[] | null;
};

export function isWeeklySellerPayoutSchedule(schedule?: SellerPayoutSchedule) {
  if (schedule?.interval !== "weekly") return false;
  // Newer API versions can return multiple days. Accept only our single day.
  if (schedule.weekly_payout_days?.length) {
    return schedule.weekly_payout_days.length === 1 && schedule.weekly_payout_days[0] === SELLER_PAYOUT_DAY;
  }
  return schedule.weekly_anchor === SELLER_PAYOUT_DAY;
}

export function weeklySellerPayoutParameters() {
  return new URLSearchParams({
    "settings[payouts][schedule][interval]": "weekly",
    "settings[payouts][schedule][weekly_anchor]": SELLER_PAYOUT_DAY,
  });
}

export function sellerPayoutNotice(siteUrl: string, sellerType: string) {
  const paymentsPath = sellerType === "professional" ? "/store?view=payments" : "/account?view=payments";
  return {
    subject: "Your MCC bank payouts are now weekly on Mondays",
    body: `Your Model Car Center payout account is now set to weekly bank payouts on Mondays.\n\n${SELLER_PAYOUT_SUMMARY}\n\n${SELLER_PAYOUT_RELEASE_EXPLANATION}\n\nYour commission agreement, processing-fee arrangement, and order release deadlines have not changed. Model Car Center continues to cover its Stripe Connect account and standard payout fees.\n\nReview your proceeds and open Stripe for bank arrival estimates: ${siteUrl}${paymentsPath}\nPayout terms: ${siteUrl}/seller-terms#payout-schedule\n\nReply to this email if you need help.`,
  };
}
