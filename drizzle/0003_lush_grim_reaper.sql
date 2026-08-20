ALTER TABLE `checkout_reservations` ADD `marketplace_fee_bps` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `marketplace_fee_bps` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_processing_fee_cents` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_proceeds_cents` integer;--> statement-breakpoint
ALTER TABLE `sellers` ADD `is_founding_seller` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `founding_rate_starts_at` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `founding_rate_ends_at` text;