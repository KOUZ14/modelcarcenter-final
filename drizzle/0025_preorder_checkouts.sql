CREATE TABLE `preorder_checkouts` (
	`checkout_id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`accepted_quote` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `checkout_reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reservation_id`) REFERENCES `preorder_reservations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `preorder_checkout_reservation_idx` ON `preorder_checkouts` (`reservation_id`);
--> statement-breakpoint
-- Cover reservations accepted after a seller's preview but before their update.
CREATE TRIGGER preorder_batch_delay_consent AFTER UPDATE OF revision ON incoming_batches
WHEN NEW.revision > OLD.revision
BEGIN
 UPDATE preorder_reservations SET consent_state='required', reason='material_delay', actor='system',
 consent_deadline=strftime('%Y-%m-%dT%H:%M:%fZ','now','+' || (SELECT delay_response_days FROM preorder_policies WHERE version=json_extract(preorder_reservations.terms,'$.policyVersion')) || ' days'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE batch_id=NEW.id AND status IN ('reserved','allocated','awaiting_payment');
END;
--> statement-breakpoint
CREATE TRIGGER preorder_batch_shortage_consent AFTER UPDATE OF capacity ON incoming_batches
WHEN NEW.capacity < OLD.capacity
BEGIN
 UPDATE preorder_reservations SET consent_state='required', reason='supplier_shortage', actor='system',
 consent_deadline=strftime('%Y-%m-%dT%H:%M:%fZ','now','+' || (SELECT delay_response_days FROM preorder_policies WHERE version=json_extract(preorder_reservations.terms,'$.policyVersion')) || ' days'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE batch_id=NEW.id AND status IN ('reserved','allocated','awaiting_payment') AND
 (SELECT SUM(r.quantity) FROM preorder_reservations r WHERE r.batch_id=NEW.id AND r.status IN ('reserved','allocated','awaiting_payment','converted') AND r.accepted_sequence <= preorder_reservations.accepted_sequence) > NEW.capacity - NEW.safety_buffer;
END;
