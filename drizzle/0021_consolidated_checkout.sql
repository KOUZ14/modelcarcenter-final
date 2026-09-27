CREATE TABLE `checkout_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_checkout_session_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`currency` text NOT NULL,
	`total_before_tax_cents` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_groups_stripe_checkout_session_id_unique` ON `checkout_groups` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE TABLE `combined_shipping_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`items` text NOT NULL,
	`cart_fingerprint` text NOT NULL,
	`destination_address` text NOT NULL,
	`currency` text NOT NULL,
	`amount_cents` integer,
	`carrier` text,
	`service` text,
	`estimated_days` integer,
	`seller_note` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "combined_shipping_amount_valid" CHECK("combined_shipping_requests"."amount_cents" IS NULL OR "combined_shipping_requests"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `combined_shipping_buyer_idx` ON `combined_shipping_requests` (`buyer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `combined_shipping_seller_idx` ON `combined_shipping_requests` (`seller_id`,`status`);--> statement-breakpoint
DROP INDEX `checkout_reservations_session_unique`;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `checkout_group_id` text REFERENCES checkout_groups(id);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `combined_shipping_request_id` text REFERENCES combined_shipping_requests(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `checkout_reservations_session_idx` ON `checkout_reservations` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `checkout_reservations_group_idx` ON `checkout_reservations` (`checkout_group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_reservations_combined_shipping_unique` ON `checkout_reservations` (`combined_shipping_request_id`);--> statement-breakpoint
DROP INDEX `orders_checkout_session_unique`;--> statement-breakpoint
ALTER TABLE `orders` ADD `checkout_group_id` text REFERENCES checkout_groups(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `checkout_reservation_id` text REFERENCES checkout_reservations(id);--> statement-breakpoint
CREATE INDEX `orders_checkout_session_idx` ON `orders` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_reservation_unique` ON `orders` (`checkout_reservation_id`);
