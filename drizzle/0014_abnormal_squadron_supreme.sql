CREATE TABLE `business_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_type` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`occurred_at` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "business_ledger_amount_positive" CHECK("business_ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `business_ledger_date_idx` ON `business_ledger_entries` (`status`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `tax_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text,
	`summary` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tax_activity_created_idx` ON `tax_activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `tax_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_structure` text DEFAULT 'sole_proprietor' NOT NULL,
	`home_state` text DEFAULT 'CA' NOT NULL,
	`product_tax_code` text DEFAULT 'txcd_99999999' NOT NULL,
	`seller_permit_status` text DEFAULT 'not_checked' NOT NULL,
	`marketplace_facilitator_status` text DEFAULT 'not_checked' NOT NULL,
	`stripe_california_registration_status` text DEFAULT 'not_checked' NOT NULL,
	`sales_tax_filing_frequency` text DEFAULT 'not_set' NOT NULL,
	`next_sales_tax_due_at` text,
	`ca_account_verified_at` text,
	`seller_documentation_issued` integer DEFAULT false NOT NULL,
	`w9_collection_ready` integer DEFAULT false NOT NULL,
	`stripe_tax_reporting_ready` integer DEFAULT false NOT NULL,
	`income_tax_reserve_bps` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`jurisdiction` text DEFAULT '' NOT NULL,
	`period_start` text,
	`period_end` text,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`amount_due_cents` integer,
	`amount_paid_cents` integer,
	`filed_at` text,
	`paid_at` text,
	`confirmation_reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`calendar_key` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "tax_tasks_amounts_nonnegative" CHECK(("tax_tasks"."amount_due_cents" IS NULL OR "tax_tasks"."amount_due_cents" >= 0) AND ("tax_tasks"."amount_paid_cents" IS NULL OR "tax_tasks"."amount_paid_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_tasks_calendar_key_unique` ON `tax_tasks` (`calendar_key`);--> statement-breakpoint
CREATE INDEX `tax_tasks_due_idx` ON `tax_tasks` (`status`,`due_at`);--> statement-breakpoint
ALTER TABLE `sellers` ADD `tax_info_status` text DEFAULT 'not_checked' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `tax_info_verified_at` text;