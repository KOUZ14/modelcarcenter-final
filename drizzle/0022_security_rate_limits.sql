CREATE TABLE `security_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_rate_limits_expiry_idx` ON `security_rate_limits` (`expires_at`);