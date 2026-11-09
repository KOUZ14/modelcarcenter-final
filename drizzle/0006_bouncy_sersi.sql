CREATE TABLE `seller_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_user_id` text,
	`rating` integer NOT NULL,
	`comment` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "seller_feedback_rating_range" CHECK("seller_feedback"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seller_feedback_order_unique` ON `seller_feedback` (`order_id`);--> statement-breakpoint
CREATE INDEX `seller_feedback_seller_idx` ON `seller_feedback` (`seller_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `ship_by_at` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `handling_time_business_days` integer DEFAULT 3 NOT NULL CHECK (`handling_time_business_days` BETWEEN 1 AND 10);
