CREATE TABLE `seller_payout_schedules` (
	`stripe_account_id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`last_attempt_at` text NOT NULL,
	`verified_at` text,
	`last_error` text,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
