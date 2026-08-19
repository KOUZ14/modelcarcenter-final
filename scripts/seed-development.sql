-- Development-only seed data. Never apply this file automatically in production.
INSERT OR IGNORE INTO sellers (
  id, slug, store_name, contact_name, contact_email, website_url, description, status,
  stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, default_shipping_cents,
  shipping_policy_summary, return_policy_summary
) VALUES (
  'dev-seller-apex', 'apex-miniatures-demo', 'Apex Miniatures (Demo)', 'Development Seller',
  'seller@example.com', 'https://example.com', 'Development-only specialist seller used to preview the V1 marketplace.',
  'active', 'acct_replace_for_stripe_test', 1, 1, 1295,
  'Flat-rate US shipping for development preview.', 'Development preview: contact support before any return.'
);

INSERT OR IGNORE INTO products (
  id, seller_id, slug, seller_sku, title, description, scale, model_manufacturer,
  vehicle_make, vehicle_model, vehicle_year, color, condition, price_cents, currency,
  inventory_quantity, reserved_quantity, status, primary_image_url, keywords
) VALUES
  ('dev-product-1', 'dev-seller-apex', 'demo-fairlady-z-s30', 'DEMO-001', '[DEMO] Fairlady Z S30', 'Development-only sample inventory. Replace before launch.', '1:18', 'AUTOart', 'Nissan', 'Fairlady Z S30', '1971', 'Red', 'new', 28995, 'usd', 3, 0, 'active', '/images/product-red-coupe.png', 'nissan datsun fairlady z s30 jdm red autoart coupe demo'),
  ('dev-product-2', 'dev-seller-apex', 'demo-porsche-963-le-mans', 'DEMO-002', '[DEMO] 963 No. 6 · Le Mans', 'Development-only sample inventory. Replace before launch.', '1:43', 'Spark', 'Porsche', '963 No. 6', '2023', 'Silver', 'new', 11900, 'usd', 4, 0, 'active', '/images/product-silver-racer.png', 'porsche 963 le mans endurance silver spark racing demo'),
  ('dev-product-3', 'dev-seller-apex', 'demo-countach-lpi-800-4', 'DEMO-003', '[DEMO] Countach LPI 800-4', 'Development-only sample inventory. Replace before launch.', '1:18', 'Kyosho', 'Lamborghini', 'Countach LPI 800-4', '2022', 'Blue', 'new', 24900, 'usd', 2, 0, 'active', '/images/product-blue-supercar.png', 'lamborghini countach blue kyosho supercar demo'),
  ('dev-product-4', 'dev-seller-apex', 'demo-volvo-850-r', 'DEMO-004', '[DEMO] 850 R Touring Sedan', 'Development-only sample inventory. Replace before launch.', '1:64', 'Tarmac Works', 'Volvo', '850 R', '1996', 'Black', 'new', 2995, 'usd', 1, 0, 'active', '/images/product-black-sedan.png', 'volvo 850 r black tarmac works touring sedan demo');

INSERT OR IGNORE INTO product_images (id, product_id, url, alt, sort_order) VALUES
  ('dev-image-1', 'dev-product-1', '/images/product-red-coupe.png', 'Red AUTOart Fairlady Z S30 demo model car', 0),
  ('dev-image-2', 'dev-product-2', '/images/product-silver-racer.png', 'Silver Spark Porsche 963 demo model car', 0),
  ('dev-image-3', 'dev-product-3', '/images/product-blue-supercar.png', 'Blue Kyosho Lamborghini Countach demo model car', 0),
  ('dev-image-4', 'dev-product-4', '/images/product-black-sedan.png', 'Black Tarmac Works Volvo 850 R demo model car', 0);
