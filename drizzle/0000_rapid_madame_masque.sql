CREATE TABLE `checkout_reservation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_title_snapshot` text NOT NULL,
	`seller_sku_snapshot` text NOT NULL,
	`scale_snapshot` text NOT NULL,
	`manufacturer_snapshot` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`image_url_snapshot` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `checkout_reservations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "checkout_reservation_quantity_positive" CHECK("checkout_reservation_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `checkout_reservation_items_reservation_idx` ON `checkout_reservation_items` (`reservation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_reservation_product_unique` ON `checkout_reservation_items` (`reservation_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `checkout_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`stripe_checkout_session_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_reservations_session_unique` ON `checkout_reservations` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `checkout_reservations_status_idx` ON `checkout_reservations` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `community_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`consent_timestamp` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_subscribers_email_unique` ON `community_subscribers` (`email`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_title_snapshot` text NOT NULL,
	`seller_sku_snapshot` text NOT NULL,
	`scale_snapshot` text NOT NULL,
	`manufacturer_snapshot` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`image_url_snapshot` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_items_price_nonnegative" CHECK("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`seller_id` text NOT NULL,
	`stripe_checkout_session_id` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_charge_id` text,
	`stripe_refund_id` text,
	`buyer_email` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
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
	CONSTRAINT "orders_money_nonnegative" CHECK(
      "orders"."subtotal_cents" >= 0 AND "orders"."shipping_cents" >= 0 AND
      "orders"."platform_fee_cents" >= 0 AND "orders"."tax_cents" >= 0 AND "orders"."total_cents" >= 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_session_unique` ON `orders` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`payment_status`,`fulfillment_status`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`slug` text NOT NULL,
	`seller_sku` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`scale` text NOT NULL,
	`model_manufacturer` text NOT NULL,
	`vehicle_make` text NOT NULL,
	`vehicle_model` text NOT NULL,
	`vehicle_year` text,
	`color` text,
	`condition` text DEFAULT 'new' NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`inventory_quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`primary_image_url` text,
	`keywords` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "products_price_nonnegative" CHECK("products"."price_cents" >= 0),
	CONSTRAINT "products_inventory_nonnegative" CHECK("products"."inventory_quantity" >= 0),
	CONSTRAINT "products_reserved_nonnegative" CHECK("products"."reserved_quantity" >= 0),
	CONSTRAINT "products_reserved_within_inventory" CHECK("products"."reserved_quantity" <= "products"."inventory_quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_seller_sku_unique` ON `products` (`seller_id`,`seller_sku`);--> statement-breakpoint
CREATE INDEX `products_catalog_idx` ON `products` (`status`,`seller_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_scale_idx` ON `products` (`scale`);--> statement-breakpoint
CREATE INDEX `products_manufacturer_idx` ON `products` (`model_manufacturer`);--> statement-breakpoint
CREATE TABLE `seller_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`store_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`website` text,
	`current_selling_channels` text NOT NULL,
	`approximate_inventory_size` integer NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seller_applications_status_idx` ON `seller_applications` (`status`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`store_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`website_url` text,
	`logo_url` text,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'applicant' NOT NULL,
	`stripe_account_id` text,
	`stripe_charges_enabled` integer DEFAULT false NOT NULL,
	`stripe_payouts_enabled` integer DEFAULT false NOT NULL,
	`default_shipping_cents` integer DEFAULT 0 NOT NULL,
	`shipping_policy_summary` text DEFAULT '' NOT NULL,
	`return_policy_summary` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sellers_shipping_nonnegative" CHECK("sellers"."default_shipping_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_slug_unique` ON `sellers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_stripe_account_unique` ON `sellers` (`stripe_account_id`);--> statement-breakpoint
CREATE INDEX `sellers_status_idx` ON `sellers` (`status`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stripe_events_type_idx` ON `stripe_events` (`type`,`processed_at`);--> statement-breakpoint
CREATE TABLE `wanted_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_code` text NOT NULL,
	`vehicle_make` text NOT NULL,
	`vehicle_model` text NOT NULL,
	`preferred_scale` text NOT NULL,
	`model_manufacturer` text,
	`color` text,
	`condition_preference` text,
	`max_budget_cents` integer,
	`notes` text DEFAULT '' NOT NULL,
	`collector_email` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`matched_product_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`matched_at` text,
	`notified_at` text,
	FOREIGN KEY (`matched_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "wanted_requests_budget_positive" CHECK("wanted_requests"."max_budget_cents" IS NULL OR "wanted_requests"."max_budget_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wanted_requests_reference_unique` ON `wanted_requests` (`reference_code`);--> statement-breakpoint
CREATE INDEX `wanted_requests_status_idx` ON `wanted_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `wanted_requests_match_idx` ON `wanted_requests` (`vehicle_make`,`vehicle_model`,`preferred_scale`);