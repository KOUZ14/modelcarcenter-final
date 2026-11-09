CREATE TABLE `promotion_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotion_audit_campaign` ON `promotion_audit` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `promotion_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_mode` text NOT NULL,
	`tax_code` text NOT NULL,
	`terms_version` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotion_campaign_status" CHECK("promotion_campaigns"."status" IN ('pending_payment','active','paused','ended','expired')),
	CONSTRAINT "promotion_price_duration" CHECK("promotion_campaigns"."price_cents" >= 50 AND "promotion_campaigns"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_live_listing` ON `promotion_campaigns` (`product_id`) WHERE "promotion_campaigns"."status" IN ('pending_payment','active','paused');--> statement-breakpoint
CREATE INDEX `promotion_seller_date` ON `promotion_campaigns` (`seller_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `promotion_serving` ON `promotion_campaigns` (`status`,`ends_at`);--> statement-breakpoint
CREATE TABLE `promotion_daily_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`day` text NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `promotion_campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_metrics_day` ON `promotion_daily_metrics` (`campaign_id`,`day`);--> statement-breakpoint
CREATE TABLE `promotion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`nonce` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `promotion_campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "promotion_event_kind" CHECK("promotion_events"."kind" IN ('impression','click'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_event_once` ON `promotion_events` (`campaign_id`,`nonce`,`kind`);--> statement-breakpoint
CREATE INDEX `promotion_event_retention` ON `promotion_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `promotion_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`request_key` text NOT NULL,
	`session_id` text,
	`payment_intent_id` text,
	`charge_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`fee_cents` integer,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`dispute_status` text DEFAULT 'none' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `promotion_campaigns`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotion_payment_status" CHECK("promotion_payments"."status" IN ('pending','paid','failed','expired')),
	CONSTRAINT "promotion_payment_amounts" CHECK("promotion_payments"."total_cents" >= 0 AND "promotion_payments"."tax_cents" >= 0 AND "promotion_payments"."refunded_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_payments_campaign_id_unique` ON `promotion_payments` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_payments_session_id_unique` ON `promotion_payments` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_payments_payment_intent_id_unique` ON `promotion_payments` (`payment_intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_payments_charge_id_unique` ON `promotion_payments` (`charge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_purchase_request` ON `promotion_payments` (`seller_id`,`request_key`);--> statement-breakpoint
CREATE TABLE `promotion_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`stripe_refund_id` text,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`reason` text NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `promotion_campaigns`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotion_refund_amount" CHECK("promotion_refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_refunds_operation_key_unique` ON `promotion_refunds` (`operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_refunds_stripe_refund_id_unique` ON `promotion_refunds` (`stripe_refund_id`);--> statement-breakpoint
CREATE INDEX `promotion_refund_recovery` ON `promotion_refunds` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `promotion_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`updated_at` integer NOT NULL
);
