CREATE UNIQUE INDEX `preorder_refund_pending_order` ON `preorder_refund_requests` (`order_id`) WHERE "preorder_refund_requests"."status" = 'pending';
--> statement-breakpoint
CREATE TRIGGER preorder_deposit_cancellation_refund AFTER UPDATE OF status ON preorder_reservations
WHEN NEW.status IN ('cancelled','expired') AND OLD.status IN ('reserved','allocated','awaiting_payment')
AND json_extract(OLD.terms,'$.paymentModel')='deposit_10'
AND (OLD.consent_state='required'
 OR NEW.reason IN ('seller_refund','supplier_shortage','seller_failure','manufacturer_cancelled','material_product_change','deposit_not_confirmed','deposit_refunded')
 OR EXISTS (SELECT 1 FROM incoming_batches b WHERE b.id=NEW.batch_id AND (b.supply_state='cancelled'
   OR (OLD.status='reserved' AND b.dispatch_end <= strftime('%Y-%m-%dT%H:%M:%fZ','now')))))
BEGIN
 UPDATE preorder_payment_ledger SET status='recovery',refund_status='required',updated_at=CURRENT_TIMESTAMP
 WHERE reservation_id=NEW.id AND kind='deposit' AND refund_status='not_required';
END;
