CREATE TABLE `traffic_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`visitor_id` text NOT NULL,
	`page` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `traffic_measurements_day_visitor` ON `traffic_measurements` (`day`,`visitor_id`);