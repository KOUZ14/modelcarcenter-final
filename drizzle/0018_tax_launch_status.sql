ALTER TABLE `tax_profiles` ADD `business_approved_at` text;--> statement-breakpoint
ALTER TABLE `tax_profiles` ADD `business_launch_status` text DEFAULT 'not_set' NOT NULL;
--> statement-breakpoint
-- Owner-confirmed setup. Do not replace a profile created or edited meanwhile.
INSERT OR IGNORE INTO `tax_profiles`
  (`id`, `business_approved_at`, `business_launch_status`, `business_started_at`,
   `seller_permit_status`, `notes`, `updated_by`)
VALUES
  ('primary', '2026-05-22', 'prelaunch', NULL, 'active',
   'Owner confirmed approval on May 22, 2026; the business has not launched and has made no sales. California seller permit held (owner confirmation). Confirm the assigned CDTFA filing frequency and due dates separately.',
   'Owner-confirmed setup');
--> statement-breakpoint
INSERT OR IGNORE INTO `tax_activity`
  (`id`, `action`, `subject_type`, `subject_id`, `summary`, `actor_email`)
SELECT 'owner-tax-setup-2026-09-15', 'profile_initialized', 'tax_profile', 'primary',
  'Recorded owner-confirmed approval date, prelaunch status, and California seller permit. Operations start date remains unset.',
  'Owner-confirmed setup'
FROM `tax_profiles`
WHERE `id` = 'primary' AND `updated_by` = 'Owner-confirmed setup';
--> statement-breakpoint
-- Correct the untouched 2026 federal planning periods already on this site.
-- Keep statuses, payments, confirmations, and edited tasks intact.
UPDATE `tax_tasks`
SET `period_start` = CASE `calendar_key`
    WHEN '2026-federal-estimate-q1' THEN '2026-01-01'
    WHEN '2026-federal-estimate-q2' THEN '2026-04-01'
    WHEN '2026-federal-estimate-q3' THEN '2026-06-01'
    WHEN '2026-federal-estimate-q4' THEN '2026-09-01' END,
  `period_end` = CASE `calendar_key`
    WHEN '2026-federal-estimate-q1' THEN '2026-03-31'
    WHEN '2026-federal-estimate-q2' THEN '2026-05-31'
    WHEN '2026-federal-estimate-q3' THEN '2026-08-31'
    WHEN '2026-federal-estimate-q4' THEN '2026-12-31' END,
  `notes` = 'Standard estimated-tax planning date (IRS Form 1040-ES). The period shows when income is earned. Review all personal income, withholding, annualization, and any disaster relief before deciding whether a payment is required.',
  `updated_by` = 'Tax calendar migration', `updated_at` = CURRENT_TIMESTAMP
WHERE `calendar_key` IN ('2026-federal-estimate-q1', '2026-federal-estimate-q2', '2026-federal-estimate-q3', '2026-federal-estimate-q4')
  AND `status` = 'upcoming' AND `updated_at` = `created_at`
  AND `amount_due_cents` IS NULL AND `amount_paid_cents` IS NULL
  AND `filed_at` IS NULL AND `paid_at` IS NULL AND `confirmation_reference` = ''
  AND `notes` = 'Planning date from the standard sole-proprietor calendar; confirm the amount and any holiday adjustment before paying.';
