CREATE TABLE `collection_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`catalog_id` text,
	`listing_id` text,
	`title` text NOT NULL,
	`scale` text NOT NULL,
	`maker` text NOT NULL,
	`car_make` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`condition` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`availability` text DEFAULT 'not_for_sale' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`private_notes` text DEFAULT '' NOT NULL,
	`purchase_cost` text DEFAULT '' NOT NULL,
	`minimum_cents` integer DEFAULT 0 NOT NULL,
	`comments_enabled` integer DEFAULT 1 NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collection_visibility" CHECK("collection_items"."visibility" IN ('private','public')),
	CONSTRAINT "collection_availability" CHECK("collection_items"."availability" IN ('not_for_sale','open_to_offers','for_sale','reserved','previously_owned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_items_listing_id_unique` ON `collection_items` (`listing_id`);--> statement-breakpoint
CREATE INDEX `collection_owner` ON `collection_items` (`owner_id`,`visibility`,`availability`);--> statement-breakpoint
CREATE TABLE `collection_shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collector_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`body` text NOT NULL,
	`photo_id` text,
	`offer_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `collector_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collector_thread_messages` ON `collector_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `collector_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "relationship_kind" CHECK("collector_relationships"."kind" IN ('follow','mute','block'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_relationship` ON `collector_relationships` (`owner_id`,`target_id`,`kind`);--> statement-breakpoint
CREATE TABLE `collector_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`item_id` text,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'request' NOT NULL,
	`sender_read_at` integer DEFAULT 0 NOT NULL,
	`recipient_read_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collector_inbox` ON `collector_threads` (`recipient_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `community_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`post_id` text,
	`item_id` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'public' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_editorial` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`topic` text NOT NULL,
	`spotlight_id` text,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spotlight_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `community_media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text,
	`post_id` text,
	`thread_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `collector_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`actor_id` text,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`href` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_notification_owner` ON `community_notifications` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_post_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_action_kind" CHECK("community_post_actions"."kind" IN ('like','save','hide'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_action` ON `community_post_actions` (`owner_id`,`post_id`,`kind`);--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`body` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`catalog_id` text,
	`item_id` text,
	`commercial` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'public' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `community_feed` ON `community_posts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_model_posts` ON `community_posts` (`catalog_id`,`status`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reviewed_by` text,
	`resolution` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`cover_id` text,
	`contact` text DEFAULT 'requests' NOT NULL,
	`social_notifications` integer DEFAULT 1 NOT NULL,
	`discovery_notifications` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "community_visibility" CHECK("community_settings"."visibility" IN ('private','public')),
	CONSTRAINT "community_contact" CHECK("community_settings"."contact" IN ('requests','everyone','following','existing'))
);
--> statement-breakpoint
CREATE TABLE `model_wishlist` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`catalog_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_wishlist_entry` ON `model_wishlist` (`owner_id`,`catalog_id`);--> statement-breakpoint
CREATE TABLE `shelf_members` (
	`id` text PRIMARY KEY NOT NULL,
	`shelf_id` text NOT NULL,
	`item_id` text NOT NULL,
	FOREIGN KEY (`shelf_id`) REFERENCES `collection_shelves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `collection_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shelf_piece` ON `shelf_members` (`shelf_id`,`item_id`);