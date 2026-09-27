CREATE TABLE `preorder_waitlist` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`batch_id` text NOT NULL,
	`buyer_user_id` text,
	`contact_email` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`reservation_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `incoming_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reservation_id`) REFERENCES `preorder_reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "waitlist_quantity" CHECK("preorder_waitlist"."quantity" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_waitlist_id` ON `preorder_waitlist` (`id`);--> statement-breakpoint
CREATE INDEX `preorder_waitlist_queue` ON `preorder_waitlist` (`batch_id`,`status`,`sequence`);