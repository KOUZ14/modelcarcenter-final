ALTER TABLE `catalog_products` ADD `edition` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `packaging_variant` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `version_kind` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `set_contents` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `release_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `manufacturer_release` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `release_source` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `release_checked_at` text;--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `preview_media` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- drizzle-kit splits comma-containing SQLite index expressions. Keep each
-- normalized nullable identity expression intact in the inspected migration.
CREATE UNIQUE INDEX `catalog_sku_identity_unique` ON `catalog_products` (
 `manufacturer_key`,`sku_key`,lower("scale"),lower("vehicle_make"),lower("vehicle_model"),
 lower(coalesce("vehicle_variant",'')),lower(coalesce("color",'')),lower(coalesce("livery",'')),
 lower(coalesce("edition",'')),lower(coalesce("packaging_variant",'')),`version_kind`,lower(coalesce("set_contents",''))
);
