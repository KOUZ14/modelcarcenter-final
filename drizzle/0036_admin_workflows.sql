-- Recover missing historical items only from an unambiguous, completed checkout
-- whose seller, currency, and snapshot subtotal agree with the original order.
-- Existing and partially populated order items are never overwritten.
INSERT INTO order_items (
  id, order_id, product_id, product_title_snapshot, seller_sku_snapshot,
  scale_snapshot, manufacturer_snapshot, unit_price_cents, quantity,
  image_url_snapshot, availability_type_snapshot, release_date_snapshot
)
SELECT 'recovered-' || o.id || '-' || i.id, o.id, i.product_id,
  i.product_title_snapshot, i.seller_sku_snapshot, i.scale_snapshot,
  i.manufacturer_snapshot, i.unit_price_cents, i.quantity,
  i.image_url_snapshot, i.availability_type_snapshot, i.release_date_snapshot
FROM orders o
JOIN checkout_reservations r ON r.stripe_checkout_session_id = o.stripe_checkout_session_id
  AND r.seller_id = o.seller_id AND r.currency = o.currency
  AND r.status = 'completed' AND r.subtotal_cents = o.subtotal_cents
  AND (o.checkout_reservation_id IS NULL OR o.checkout_reservation_id = r.id)
JOIN checkout_reservation_items i ON i.reservation_id = r.id
WHERE NOT EXISTS (SELECT 1 FROM order_items existing WHERE existing.order_id = o.id)
  AND 1 = (SELECT COUNT(*) FROM checkout_reservations candidate
    WHERE candidate.stripe_checkout_session_id = o.stripe_checkout_session_id AND candidate.seller_id = o.seller_id)
  AND o.subtotal_cents = (SELECT SUM(snapshot.unit_price_cents * snapshot.quantity)
    FROM checkout_reservation_items snapshot WHERE snapshot.reservation_id = r.id);
--> statement-breakpoint
UPDATE orders SET is_test_order = 1,
  test_order_reason = coalesce(nullif(test_order_reason, ''), 'Stripe test-mode checkout; no live payment.')
WHERE substr(stripe_checkout_session_id, 1, 8) = 'cs_test_';
--> statement-breakpoint
CREATE TABLE admin_activity (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX admin_activity_record_idx ON admin_activity(action, record_id, created_at);
