CREATE TABLE `preorder_deposit_checkouts` (
	`reservation_id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`request` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `preorder_reservations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_deposit_checkouts_session_id_unique` ON `preorder_deposit_checkouts` (`session_id`);--> statement-breakpoint
CREATE TABLE `preorder_refund_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`target_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_refund_target` ON `preorder_refund_requests` (`order_id`,`target_cents`);--> statement-breakpoint
ALTER TABLE `orders` ADD `preorder_deposit_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_payment_ledger` ADD `kind` text DEFAULT 'balance' NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_payment_ledger` ADD `subtotal_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_payment_ledger` ADD `tax_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_payment_ledger` ADD `processing_fee_cents` integer;--> statement-breakpoint
ALTER TABLE `preorder_payment_ledger` ADD `refunded_cents` integer DEFAULT 0 NOT NULL;