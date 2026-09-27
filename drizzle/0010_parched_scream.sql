CREATE TABLE `resolution_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`recipient_role` text NOT NULL,
	`recipient_email` text NOT NULL,
	`message` text,
	`deadline_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `resolution_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "resolution_notifications_attempts_nonnegative" CHECK("resolution_notifications"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_notifications_event_unique` ON `resolution_notifications` (`event_key`);--> statement-breakpoint
CREATE INDEX `resolution_notifications_pending_idx` ON `resolution_notifications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `resolution_notifications_case_idx` ON `resolution_notifications` (`case_id`,`created_at`);