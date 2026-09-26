CREATE TABLE `catalog_products` (
	`id` text PRIMARY KEY NOT NULL,
	`model_car_manufacturer` text NOT NULL,
	`manufacturer_key` text NOT NULL,
	`manufacturer_sku` text,
	`sku_key` text,
	`scale` text NOT NULL,
	`vehicle_make` text NOT NULL,
	`vehicle_model` text NOT NULL,
	`vehicle_variant` text,
	`vehicle_year` text,
	`color` text,
	`livery` text,
	`release_year` text,
	`material` text DEFAULT '' NOT NULL,
	`upc` text,
	`ean` text,
	`gtin_key` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`primary_image_url` text,
	`created_by_user_id` text,
	`catalog_status` text DEFAULT 'unverified' NOT NULL,
	`merged_into_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`merged_into_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_manufacturer_sku_unique` ON `catalog_products` (`manufacturer_key`,`sku_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_gtin_unique` ON `catalog_products` (`gtin_key`);--> statement-breakpoint
CREATE INDEX `catalog_attributes_idx` ON `catalog_products` (`manufacturer_key`,`scale`,`vehicle_make`,`vehicle_model`);--> statement-breakpoint
CREATE INDEX `catalog_status_idx` ON `catalog_products` (`catalog_status`,`created_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `catalog_product_id` text REFERENCES catalog_products(id);--> statement-breakpoint
ALTER TABLE `products` ADD `condition_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `listings_catalog_product_idx` ON `products` (`catalog_product_id`,`status`);
--> statement-breakpoint
-- Existing `products` are listings. Only manufacturer + manufacturer product
-- number can coalesce their identities. Seller SKU is never a manufacturer SKU.
CREATE TABLE `_catalog_backfill` AS
WITH normalized AS (
  SELECT p.*,
    lower(replace(replace(replace(replace(replace(trim(model_manufacturer), ' ', ''), '-', ''), '_', ''), char(9), ''), char(160), '')) AS maker_key,
    CASE WHEN lower(trim(coalesce(product_number, ''))) IN ('', 'unknown', 'n/a', 'na', 'none', 'not known') THEN NULL ELSE lower(trim(product_number)) END AS maker_sku_key,
    CASE
      WHEN lower(trim(scale)) = 'other' THEN 'Other'
      WHEN lower(trim(scale)) GLOB '*scale' THEN '1:' || replace(replace(replace(replace(replace(lower(trim(scale)), 'scale', ''), 'th', ''), 'st', ''), 'nd', ''), ' ', '')
      ELSE replace(replace(trim(scale), '/', ':'), ' ', '') END AS normalized_scale
  FROM products p
)
SELECT *, 'catalog-' || CASE WHEN maker_sku_key IS NULL THEN id
  ELSE min(id) OVER (PARTITION BY maker_key, maker_sku_key) END AS canonical_id
FROM normalized;
--> statement-breakpoint
INSERT INTO catalog_products (
  id, model_car_manufacturer, manufacturer_key, manufacturer_sku, sku_key,
  scale, vehicle_make, vehicle_model, vehicle_year, color, material, title,
  created_by_user_id, catalog_status, created_at, updated_at
)
SELECT b.canonical_id,
  CASE b.maker_key
    WHEN 'autoart' THEN 'AUTOart' WHEN 'minigt' THEN 'MINI GT'
    WHEN 'tarmacworks' THEN 'Tarmac Works' WHEN 'kaidohouse' THEN 'Kaido House'
    WHEN 'hotwheels' THEN 'Hot Wheels' WHEN 'matchbox' THEN 'Matchbox'
    WHEN 'kyosho' THEN 'Kyosho' WHEN 'minichamps' THEN 'Minichamps'
    WHEN 'bbr' THEN 'BBR' WHEN 'looksmart' THEN 'Looksmart'
    WHEN 'solido' THEN 'Solido' WHEN 'maisto' THEN 'Maisto'
    ELSE trim(b.model_manufacturer) END,
  b.maker_key, CASE WHEN b.maker_sku_key IS NULL THEN NULL ELSE trim(b.product_number) END,
  b.maker_sku_key, b.normalized_scale, trim(b.vehicle_make), trim(b.vehicle_model),
  b.vehicle_year, b.color, b.material,
  trim(b.model_manufacturer || ' ' || b.vehicle_make || ' ' || b.vehicle_model || ' ' || coalesce(b.color, '') || ' ' || b.normalized_scale),
  s.owner_user_id, 'unverified', b.created_at, b.updated_at
FROM _catalog_backfill b LEFT JOIN sellers s ON s.id = b.seller_id
WHERE b.canonical_id = 'catalog-' || b.id;
--> statement-breakpoint
UPDATE products SET catalog_product_id = (SELECT canonical_id FROM _catalog_backfill WHERE _catalog_backfill.id = products.id);
--> statement-breakpoint
DROP TABLE _catalog_backfill;
--> statement-breakpoint
-- SQLite cannot add a required FK column to a populated table. Enforce the same
-- invariant with triggers after backfill, without rebuilding inventory or its
-- dependent carts, reservations, orders, messages and images.
CREATE TRIGGER listings_require_catalog_insert BEFORE INSERT ON products
WHEN NEW.catalog_product_id IS NULL
BEGIN SELECT RAISE(ABORT, 'A seller listing must reference a catalog product'); END;
--> statement-breakpoint
CREATE TRIGGER listings_require_catalog_update BEFORE UPDATE OF catalog_product_id ON products
WHEN NEW.catalog_product_id IS NULL
BEGIN SELECT RAISE(ABORT, 'A seller listing must reference a catalog product'); END;
