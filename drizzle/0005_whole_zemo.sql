CREATE TABLE `resolution_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`case_number` text NOT NULL,
	`order_id` text NOT NULL,
	`opened_by_user_id` text,
	`reason` text NOT NULL,
	`requested_resolution` text NOT NULL,
	`requested_refund_cents` integer,
	`details` text NOT NULL,
	`status` text DEFAULT 'awaiting_seller' NOT NULL,
	`policy_version` text NOT NULL,
	`report_deadline` text NOT NULL,
	`seller_respond_by` text NOT NULL,
	`buyer_evidence_by` text NOT NULL,
	`buyer_escalate_by` text,
	`buyer_ship_by` text,
	`return_authorization_number` text,
	`return_carrier` text,
	`return_tracking_number` text,
	`resolution_summary` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "resolution_cases_requested_refund_nonnegative" CHECK("resolution_cases"."requested_refund_cents" IS NULL OR "resolution_cases"."requested_refund_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_cases_number_unique` ON `resolution_cases` (`case_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_cases_order_unique` ON `resolution_cases` (`order_id`);--> statement-breakpoint
CREATE INDEX `resolution_cases_status_idx` ON `resolution_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `resolution_files` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`uploaded_by_user_id` text,
	`uploader_role` text NOT NULL,
	`kind` text DEFAULT 'evidence' NOT NULL,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `resolution_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "resolution_files_size_positive" CHECK("resolution_files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_files_storage_key_unique` ON `resolution_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `resolution_files_case_idx` ON `resolution_files` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `resolution_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`author_user_id` text,
	`author_role` text NOT NULL,
	`kind` text DEFAULT 'message' NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `resolution_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resolution_messages_case_idx` ON `resolution_messages` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `resolution_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`order_id` text NOT NULL,
	`initiated_by_user_id` text,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`stripe_refund_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `resolution_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "resolution_refunds_amount_positive" CHECK("resolution_refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_refunds_stripe_unique` ON `resolution_refunds` (`stripe_refund_id`);--> statement-breakpoint
CREATE INDEX `resolution_refunds_case_idx` ON `resolution_refunds` (`case_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_user_id` text,
	`stripe_checkout_session_id` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_charge_id` text,
	`stripe_refund_id` text,
	`buyer_email` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`marketplace_fee_bps` integer DEFAULT 1000 NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`payment_processing_fee_cents` integer,
	`seller_proceeds_cents` integer,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`refunded_amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`buyer_name` text DEFAULT '' NOT NULL,
	`shipping_address` text DEFAULT '{}' NOT NULL,
	`carrier` text,
	`tracking_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text,
	`shipped_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "orders_money_nonnegative" CHECK(
      "__new_orders"."subtotal_cents" >= 0 AND "__new_orders"."shipping_cents" >= 0 AND
      "__new_orders"."platform_fee_cents" >= 0 AND "__new_orders"."tax_cents" >= 0 AND "__new_orders"."total_cents" >= 0 AND
      "__new_orders"."refunded_amount_cents" >= 0 AND "__new_orders"."refunded_amount_cents" <= "__new_orders"."total_cents"
    )
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_number", "seller_id", "buyer_user_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_refund_id", "buyer_email", "currency", "subtotal_cents", "shipping_cents", "marketplace_fee_bps", "platform_fee_cents", "payment_processing_fee_cents", "seller_proceeds_cents", "tax_cents", "total_cents", "refunded_amount_cents", "payment_status", "fulfillment_status", "buyer_name", "shipping_address", "carrier", "tracking_number", "created_at", "paid_at", "shipped_at", "updated_at") SELECT "id", "order_number", "seller_id", "buyer_user_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_refund_id", "buyer_email", "currency", "subtotal_cents", "shipping_cents", "marketplace_fee_bps", "platform_fee_cents", "payment_processing_fee_cents", "seller_proceeds_cents", "tax_cents", "total_cents", 0, "payment_status", "fulfillment_status", "buyer_name", "shipping_address", "carrier", "tracking_number", "created_at", "paid_at", "shipped_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_session_unique` ON `orders` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`payment_status`,`fulfillment_status`);--> statement-breakpoint
CREATE INDEX `orders_buyer_user_idx` ON `orders` (`buyer_user_id`,`created_at`);
