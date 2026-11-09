# Weekly seller bank payouts

MCC uses weekly Monday bank payouts on its managed Express connected accounts. This changes the bank schedule, not the order's delivery-based transfer eligibility, seller commission, processing deductions, refunds, or MCC's own manual bank payout setting.

- New accounts request `settings[payouts][schedule][interval]=weekly` and `weekly_anchor=monday` at creation.
- Migration `0043_weekly_seller_payouts.sql` records each account's verification and retry state. Scheduled maintenance applies the schedule to active/onboarding sellers, verifies Stripe's response, and queues a one-time transactional email in `legal_notifications`. Existing email delivery retries handle notices.
- Failed checks retry after 15 minutes. Verified accounts are checked daily. Account ownership and the managed Express configuration must match before any update. Suspended/unconnected sellers are excluded.
- Seller payment pages, listing disclosures, and Seller Terms explain Mondays, the 14-day delivery hold for new orders, funds availability, and possible additional bank/holiday delays. Existing recorded release deadlines remain authoritative.
- A payout schedule is not a bank arrival promise. Funds unavailable when Stripe processes Monday's payout wait for a later scheduled payout.

## Rollout verification

Apply the migration with the site deployment. Confirm the deployed scheduled handler runs; local Wrangler cron configuration alone does not prove that production has an hourly trigger. The authenticated Admin Sellers action can also run a bounded synchronization and attempt queued notices.

Check `seller_payout_schedules.verified_at` and `last_error`, Stripe's account payout schedule, and `legal_notifications.sent_at` for IDs starting `payout-schedule:weekly-monday-v1:`. An empty verification time is not a successful migration; an empty sent time is not delivered email. Provider acceptance of email does not prove the seller read it.

Stripe references: https://docs.stripe.com/connect/manage-payout-schedule and https://docs.stripe.com/api/accounts/update.
