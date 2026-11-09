UPDATE `products`
SET
  `title` = 'UT Models McLaren F1 LM - Orange',
  `slug` = 'ut-models-mclaren-f1-lm-orange-124341-ede41d',
  `description` = 'UT Models McLaren F1 LM in orange, 1:18 scale. The model is listed in mint condition with its original box in good condition. No missing parts, defects, or restoration or customization are reported. Review all listing photos for the exact condition and included contents.',
  `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'ede41d23-6367-4444-96e3-8577d6422fcb'
  AND `slug` = 'bbr-ferrari-f50-azzuro-california-124341-ede41d'
  AND `title` = 'UT Models Mclaren F1 LM - Orange';
--> statement-breakpoint
UPDATE `sellers`
SET `website_url` = NULL, `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = '7371cb60-6ce0-49aa-81c0-8d8fe6772f99'
  AND lower(trim(`website_url`)) IN ('https://example.com', 'https://example.com/');
