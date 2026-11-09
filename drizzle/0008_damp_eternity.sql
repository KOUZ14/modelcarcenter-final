CREATE TABLE `checkout_shipping_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_user_id` text,
	`shippo_shipment_id` text NOT NULL,
	`cart_fingerprint` text NOT NULL,
	`destination_address` text NOT NULL,
	`rates` text NOT NULL,
	`parcel_length` text NOT NULL,
	`parcel_width` text NOT NULL,
	`parcel_height` text NOT NULL,
	`parcel_weight` text NOT NULL,
	`declared_value_cents` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "checkout_shipping_quotes_value_nonnegative" CHECK("checkout_shipping_quotes"."declared_value_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_shipping_quotes_shippo_unique` ON `checkout_shipping_quotes` (`shippo_shipment_id`);--> statement-breakpoint
CREATE INDEX `checkout_shipping_quotes_seller_status_idx` ON `checkout_shipping_quotes` (`seller_id`,`status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `shipping_mode` text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `checkout_shipping_quote_id` text REFERENCES checkout_shipping_quotes(id);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `selected_shipping_rate_id` text;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `selected_shipping_carrier` text;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `selected_shipping_service` text;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `selected_shipping_service_token` text;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `selected_shipping_estimated_days` integer;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `quoted_shipping_address` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_mode` text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `selected_shipping_carrier` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `selected_shipping_service` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `selected_shipping_service_token` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `selected_shipping_estimated_days` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfillment_service` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfillment_estimated_days` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `package_length` text;--> statement-breakpoint
ALTER TABLE `products` ADD `package_width` text;--> statement-breakpoint
ALTER TABLE `products` ADD `package_height` text;--> statement-breakpoint
ALTER TABLE `products` ADD `package_weight` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_mode` text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
UPDATE `sellers` SET `shipping_mode` = 'calculated' WHERE `seller_type` = 'collector';
