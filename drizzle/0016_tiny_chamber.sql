CREATE TABLE `seller_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`label` text NOT NULL,
	`street_1` text NOT NULL,
	`street_2` text,
	`city` text NOT NULL,
	`region` text,
	`postal_code` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`phone` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seller_addresses_seller_idx` ON `seller_addresses` (`seller_id`,`is_default`,`created_at`);--> statement-breakpoint
ALTER TABLE `checkout_reservations` ADD `ship_from_address` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `ship_from_address` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `ship_from_address_id` text REFERENCES seller_addresses(id);--> statement-breakpoint
CREATE INDEX `products_ship_from_address_idx` ON `products` (`ship_from_address_id`);
--> statement-breakpoint
INSERT INTO `seller_addresses`
  (`id`, `seller_id`, `label`, `street_1`, `street_2`, `city`, `region`, `postal_code`, `country`, `phone`, `is_default`)
SELECT
  'legacy-' || `id`, `id`, 'Primary ship-from', `shipping_origin_street_1`,
  `shipping_origin_street_2`, `shipping_origin_city`, `shipping_origin_region`,
  `shipping_origin_postal_code`, `shipping_origin_country`, `shipping_origin_phone`, 1
FROM `sellers`
WHERE `shipping_origin_street_1` IS NOT NULL
  AND `shipping_origin_city` IS NOT NULL
  AND `shipping_origin_postal_code` IS NOT NULL
  AND `shipping_origin_phone` IS NOT NULL;
--> statement-breakpoint
UPDATE `products`
SET `ship_from_address_id` = 'legacy-' || `seller_id`
WHERE EXISTS (
  SELECT 1 FROM `seller_addresses`
  WHERE `seller_addresses`.`id` = 'legacy-' || `products`.`seller_id`
);
