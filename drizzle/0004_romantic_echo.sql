ALTER TABLE `products` ADD `model_condition` text DEFAULT 'not_specified' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `packaging_condition` text DEFAULT 'not_specified' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `original_box_status` text DEFAULT 'not_specified' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `missing_parts` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `defects` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `restoration_customization` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `material` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `product_number` text;--> statement-breakpoint
ALTER TABLE `products` ADD `edition_serial` text;--> statement-breakpoint
ALTER TABLE `products` ADD `coa_status` text DEFAULT 'not_specified' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `accessories` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `provenance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_front_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_rear_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_sides_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_base_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_packaging_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `photo_issues_checked` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `products` SET `model_condition` = CASE
  WHEN `condition` IN ('new', 'new_sealed', 'new_opened') THEN 'mint'
  WHEN `condition` IN ('displayed', 'used_excellent') THEN 'excellent'
  WHEN `condition` IN ('used', 'preowned', 'used_good') THEN 'good'
  WHEN `condition` = 'used_fair' THEN 'fair'
  ELSE 'not_specified'
END;--> statement-breakpoint
UPDATE `products` SET
  `packaging_condition` = 'sealed',
  `original_box_status` = 'included'
WHERE `condition` = 'new_sealed';--> statement-breakpoint
CREATE INDEX `products_model_condition_idx` ON `products` (`model_condition`);
