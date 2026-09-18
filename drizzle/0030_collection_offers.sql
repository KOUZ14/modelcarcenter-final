CREATE TABLE `collection_offer_checkouts` (
	`checkout_id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `collection_offers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `collection_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`item_id` text,
	`buyer_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`proposer_id` text NOT NULL,
	`thread_id` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`terms` text NOT NULL,
	`item_version` integer NOT NULL,
	`destination` text NOT NULL,
	`expires_at` integer NOT NULL,
	`payment_deadline` integer,
	`checkout_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`thread_id`) REFERENCES `collector_threads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "offer_status" CHECK("collection_offers"."status" IN ('proposed','reserved','completed','withdrawn','declined','superseded','expired')),
	CONSTRAINT "offer_amount" CHECK("collection_offers"."price_cents">=50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_buyer_offer` ON `collection_offers` (`buyer_id`,`item_id`) WHERE "collection_offers"."status" IN ('proposed','reserved');--> statement-breakpoint
CREATE UNIQUE INDEX `one_piece_reservation` ON `collection_offers` (`item_id`) WHERE "collection_offers"."status"='reserved';--> statement-breakpoint
CREATE INDEX `offer_expiry` ON `collection_offers` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `community_payment_exceptions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
