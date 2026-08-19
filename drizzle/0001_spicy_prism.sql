CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cart_items_quantity_positive" CHECK("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_items_cart_product_unique` ON `cart_items` (`cart_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cart_items_cart_idx` ON `cart_items` (`cart_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`seller_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carts_user_unique` ON `carts` (`user_id`);--> statement-breakpoint
CREATE INDEX `carts_seller_idx` ON `carts` (`seller_id`);--> statement-breakpoint
CREATE TABLE `collector_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`handle` text,
	`avatar_url` text,
	`bio` text DEFAULT '' NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_profiles_user_unique` ON `collector_profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collector_profiles_handle_unique` ON `collector_profiles` (`handle`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `wishlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_product_unique` ON `wishlist_items` (`user_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `wishlist_user_idx` ON `wishlist_items` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `buyer_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `checkout_reservations_buyer_idx` ON `checkout_reservations` (`buyer_user_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `buyer_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `orders_buyer_user_idx` ON `orders` (`buyer_user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `product_images` ADD `source` text DEFAULT 'external' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_images` ADD `storage_key` text;--> statement-breakpoint
ALTER TABLE `product_images` ADD `uploaded_by_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `product_images` ADD `created_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `products` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `seller_type` text DEFAULT 'professional' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `owner_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_country` text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `shipping_origin_region` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_owner_user_unique` ON `sellers` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `wanted_requests` ADD `user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `wanted_requests_user_idx` ON `wanted_requests` (`user_id`,`created_at`);
