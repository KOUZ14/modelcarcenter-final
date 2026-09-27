CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`stripe_charge_id` text,
	`stripe_payment_intent_id` text,
	`status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`evidence_due_by` text,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `disputes_order_idx` ON `disputes` (`order_id`);--> statement-breakpoint
CREATE INDEX `disputes_status_idx` ON `disputes` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `seller_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`source_object_id` text,
	`stripe_event_id` text NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL,
	`acknowledged_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seller_alerts_stripe_event_unique` ON `seller_alerts` (`stripe_event_id`);--> statement-breakpoint
CREATE INDEX `seller_alerts_seller_idx` ON `seller_alerts` (`seller_id`,`acknowledged`,`created_at`);--> statement-breakpoint
CREATE INDEX `seller_alerts_type_idx` ON `seller_alerts` (`type`,`created_at`);