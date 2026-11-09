CREATE TABLE `shipment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`order_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipment_orders_order_unique` ON `shipment_orders` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipment_orders_pair_unique` ON `shipment_orders` (`shipment_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`shippo_shipment_id` text NOT NULL,
	`shippo_transaction_id` text NOT NULL,
	`shippo_rate_id` text NOT NULL,
	`carrier` text NOT NULL,
	`service_level` text NOT NULL,
	`rate_amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`parcel_length` text NOT NULL,
	`parcel_width` text NOT NULL,
	`parcel_height` text NOT NULL,
	`parcel_weight` text NOT NULL,
	`declared_value_cents` integer NOT NULL,
	`insurance_required` integer DEFAULT false NOT NULL,
	`signature_required` integer DEFAULT false NOT NULL,
	`tracking_number` text NOT NULL,
	`tracking_url` text,
	`label_file_type` text DEFAULT 'PDF_4x6' NOT NULL,
	`status` text DEFAULT 'label_created' NOT NULL,
	`status_details` text DEFAULT '' NOT NULL,
	`eta` text,
	`shipped_at` text,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `shipping_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shipments_money_nonnegative" CHECK("shipments"."rate_amount_cents" >= 0 AND "shipments"."declared_value_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_quote_unique` ON `shipments` (`quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_transaction_unique` ON `shipments` (`shippo_transaction_id`);--> statement-breakpoint
CREATE INDEX `shipments_seller_status_idx` ON `shipments` (`seller_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `shipments_tracking_idx` ON `shipments` (`carrier`,`tracking_number`);--> statement-breakpoint
CREATE TABLE `shipping_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`created_by_user_id` text,
	`shippo_shipment_id` text NOT NULL,
	`order_ids` text NOT NULL,
	`rates` text NOT NULL,
	`parcel_length` text NOT NULL,
	`parcel_width` text NOT NULL,
	`parcel_height` text NOT NULL,
	`parcel_weight` text NOT NULL,
	`declared_value_cents` integer NOT NULL,
	`insurance_required` integer DEFAULT false NOT NULL,
	`signature_required` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'quoted' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shipping_quotes_value_nonnegative" CHECK("shipping_quotes"."declared_value_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_quotes_shippo_unique` ON `shipping_quotes` (`shippo_shipment_id`);--> statement-breakpoint
CREATE INDEX `shipping_quotes_seller_status_idx` ON `shipping_quotes` (`seller_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `tracking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`event_key` text NOT NULL,
	`status` text NOT NULL,
	`status_details` text DEFAULT '' NOT NULL,
	`status_date` text NOT NULL,
	`location` text DEFAULT '{}' NOT NULL,
	`source` text DEFAULT 'webhook' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracking_events_key_unique` ON `tracking_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `tracking_events_shipment_idx` ON `tracking_events` (`shipment_id`,`status_date`);--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_street_1` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_street_2` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_city` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_postal_code` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_phone` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `default_package_length` text DEFAULT '12' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `default_package_width` text DEFAULT '9' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `default_package_height` text DEFAULT '6' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `default_package_weight` text DEFAULT '2' NOT NULL;