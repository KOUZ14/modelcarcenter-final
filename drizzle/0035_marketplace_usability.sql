CREATE TABLE `task_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`day` text NOT NULL,
	`step` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`count` integer,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE INDEX `task_measurements_day` ON `task_measurements` (`day`,`name`);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `protection_policy_version` text DEFAULT 'delivery-3-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `protection_policy_version` text DEFAULT 'delivery-3-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `specialty` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `packing_approach` text DEFAULT '' NOT NULL;