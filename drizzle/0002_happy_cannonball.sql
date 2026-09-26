ALTER TABLE `checkout_reservations` ADD `policy_version` text;--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `policy_accepted_at` text;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `seller_terms_version` text;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `seller_terms_accepted_at` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `seller_terms_version` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `seller_terms_accepted_at` text;
