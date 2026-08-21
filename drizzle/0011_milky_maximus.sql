CREATE TABLE `availability_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_at` text NOT NULL,
	`notified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_alerts_product_email_unique` ON `availability_alerts` (`product_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `availability_alerts_token_unique` ON `availability_alerts` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `availability_alerts_product_status_idx` ON `availability_alerts` (`product_id`,`status`);--> statement-breakpoint
CREATE INDEX `availability_alerts_user_idx` ON `availability_alerts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_user_id` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_thread_idx` ON `conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_user_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`product_id` text,
	`product_slug_snapshot` text NOT NULL,
	`product_title_snapshot` text NOT NULL,
	`product_image_url_snapshot` text,
	`last_message_preview` text DEFAULT '' NOT NULL,
	`last_message_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`buyer_last_read_at` text,
	`seller_last_read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_buyer_seller_product_unique` ON `conversations` (`buyer_user_id`,`seller_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `conversations_buyer_activity_idx` ON `conversations` (`buyer_user_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_seller_activity_idx` ON `conversations` (`seller_id`,`last_message_at`);--> statement-breakpoint
ALTER TABLE `checkout_reservation_items` ADD `availability_type_snapshot` text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE `checkout_reservation_items` ADD `release_date_snapshot` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `availability_type_snapshot` text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `release_date_snapshot` text;--> statement-breakpoint
ALTER TABLE `products` ADD `availability_type` text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `release_date` text;