ALTER TABLE `orders` ADD `is_test_order` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `test_order_reason` text;
--> statement-breakpoint
-- The owner identified this exact August $9.00 + $0.10 order as a test.
-- Preserve payment, refund, fulfillment, inventory, and order-item history.
UPDATE `orders`
SET `is_test_order` = 1,
    `test_order_reason` = 'Owner confirmed this was a test order, not a sale.',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = '6af33a50-58fd-4c7a-9acc-191c457b4384'
  AND `order_number` = 'MCC-20260820-1B5074'
  AND `currency` = 'usd' AND `subtotal_cents` = 900 AND `shipping_cents` = 10;
--> statement-breakpoint
INSERT OR IGNORE INTO `tax_activity`
  (`id`, `action`, `subject_type`, `subject_id`, `summary`, `actor_email`)
SELECT 'owner-test-order-6af33a50-58fd-4c7a-9acc-191c457b4384',
  'test_order_excluded', 'order', `id`,
  'Excluded owner-confirmed test order MCC-20260820-1B5074 ($9.00 merchandise + $0.10 shipping) from tax totals and orders CSV. Order history preserved.',
  'Owner-confirmed correction'
FROM `orders`
WHERE `id` = '6af33a50-58fd-4c7a-9acc-191c457b4384'
  AND `is_test_order` = 1;
