CREATE TABLE `incoming_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`supplier_reference` text NOT NULL,
	`requested_quantity` integer NOT NULL,
	`confirmed_allocation` integer NOT NULL,
	`capacity` integer NOT NULL,
	`safety_buffer` integer NOT NULL,
	`evidence_reference` text NOT NULL,
	`evidence_state` text DEFAULT 'supplied' NOT NULL,
	`evidence_reviewed_by` text,
	`terms` text NOT NULL,
	`dispatch_end` text,
	`opens_at` text NOT NULL,
	`cutoff_at` text NOT NULL,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`supply_state` text DEFAULT 'expected' NOT NULL,
	`received_quantity` integer DEFAULT 0 NOT NULL,
	`sellable_quantity` integer DEFAULT 0 NOT NULL,
	`damaged_quantity` integer DEFAULT 0 NOT NULL,
	`received_at` text,
	`inspected_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`shortage` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incoming_quantities" CHECK("incoming_batches"."capacity" >= 0 AND "incoming_batches"."confirmed_allocation" >= "incoming_batches"."capacity" AND "incoming_batches"."requested_quantity" >= "incoming_batches"."confirmed_allocation" AND "incoming_batches"."safety_buffer" BETWEEN 0 AND "incoming_batches"."capacity" AND "incoming_batches"."sellable_quantity" >= 0 AND "incoming_batches"."damaged_quantity" >= 0 AND "incoming_batches"."received_quantity" >= "incoming_batches"."sellable_quantity" + "incoming_batches"."damaged_quantity")
);
--> statement-breakpoint
CREATE INDEX `incoming_listing_idx` ON `incoming_batches` (`listing_id`);--> statement-breakpoint
CREATE TABLE `preorder_events` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text,
	`reservation_id` text,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`recipient` text,
	`notice_version` text DEFAULT 'preorder-notice-v1' NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `incoming_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reservation_id`) REFERENCES `preorder_reservations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `preorder_event_delivery_idx` ON `preorder_events` (`delivery_status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `preorder_event_reservation_idx` ON `preorder_events` (`reservation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preorder_payment_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`session_id` text NOT NULL,
	`payment_intent_id` text NOT NULL,
	`charge_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`refund_id` text,
	`refund_status` text DEFAULT 'not_required' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `preorder_reservations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_payment_session_idx` ON `preorder_payment_ledger` (`session_id`);--> statement-breakpoint
CREATE TABLE `preorder_policies` (
	`version` text PRIMARY KEY NOT NULL,
	`terms` text NOT NULL,
	`delay_response_days` integer NOT NULL,
	`reviewed_by` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "preorder_policy_days" CHECK("preorder_policies"."delay_response_days" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE `preorder_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`buyer_user_id` text,
	`idempotency_key` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text DEFAULT 'hold' NOT NULL,
	`accepted_sequence` integer,
	`terms` text NOT NULL,
	`accepted_at` text,
	`hold_expires_at` text NOT NULL,
	`consent_state` text DEFAULT 'accepted' NOT NULL,
	`consent_deadline` text,
	`accepted_revision` integer NOT NULL,
	`allocated_quantity` integer DEFAULT 0 NOT NULL,
	`payment_deadline` text,
	`checkout_reservation_id` text,
	`order_id` text,
	`contact_email` text NOT NULL,
	`address` text,
	`reason` text,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `incoming_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "preorder_quantity" CHECK("preorder_reservations"."quantity" > 0 AND "preorder_reservations"."allocated_quantity" BETWEEN 0 AND "preorder_reservations"."quantity"),
	CONSTRAINT "preorder_status" CHECK("preorder_reservations"."status" IN ('hold','reserved','allocated','awaiting_payment','converted','cancelled','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_idempotency_idx` ON `preorder_reservations` (`buyer_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `preorder_sequence_idx` ON `preorder_reservations` (`accepted_sequence`);--> statement-breakpoint
CREATE INDEX `preorder_queue_idx` ON `preorder_reservations` (`batch_id`,`status`,`accepted_sequence`);--> statement-breakpoint
CREATE INDEX `preorder_buyer_idx` ON `preorder_reservations` (`buyer_user_id`);--> statement-breakpoint
CREATE TABLE `preorder_seller_access` (
	`seller_id` text PRIMARY KEY NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`supply_source` text NOT NULL,
	`reason` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
DROP INDEX `catalog_manufacturer_sku_unique`;--> statement-breakpoint
CREATE INDEX `catalog_manufacturer_sku_idx` ON `catalog_products` (`manufacturer_key`,`sku_key`);
--> statement-breakpoint
-- Capacity and priority are enforced inside SQLite's write transaction, including
-- retries and simultaneous last-slot requests. Converted units remain committed.
-- Use SELECT RAISE ... WHERE: D1's remote SQL splitter can mistake an
-- unparenthesized CASE END for the end of the trigger body.
CREATE TRIGGER preorder_hold_capacity BEFORE INSERT ON preorder_reservations
BEGIN
  SELECT RAISE(ABORT, 'Preorder capacity, terms or seller eligibility changed. Please review the offer.')
  WHERE NEW.status != 'hold' OR NOT EXISTS (
    SELECT 1 FROM incoming_batches b JOIN products p ON p.id = b.listing_id
    JOIN sellers s ON s.id = p.seller_id
    JOIN preorder_seller_access a ON a.seller_id = s.id
    JOIN preorder_policies policy ON policy.version = json_extract(b.terms, '$.policyVersion')
    WHERE b.id = NEW.batch_id AND b.status = 'open' AND b.evidence_state = 'reviewed'
    AND b.supply_state IN ('expected','in_transit') AND b.shortage = 0
    AND p.availability_type = 'preorder' AND p.status = 'active' AND p.price_cents > 0
    AND s.status = 'active' AND s.seller_type = 'professional' AND a.approved = 1
    AND s.stripe_charges_enabled = 1 AND s.stripe_payouts_enabled = 1 AND s.stripe_account_id IS NOT NULL
    AND s.owner_user_id IS NOT NEW.buyer_user_id AND policy.enabled = 1
    AND b.opens_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND b.cutoff_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND b.dispatch_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND NEW.accepted_revision = b.revision AND NEW.terms = b.terms
    AND NEW.quantity + COALESCE((SELECT SUM(r.quantity) FROM preorder_reservations r WHERE r.batch_id = b.id
      AND (r.status IN ('reserved','allocated','awaiting_payment','converted') OR
        (r.status = 'hold' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))),0) <= b.capacity - b.safety_buffer
    AND NEW.quantity + COALESCE((SELECT SUM(r.quantity) FROM preorder_reservations r
      JOIN incoming_batches rb ON rb.id = r.batch_id WHERE rb.listing_id = p.id AND r.buyer_user_id = NEW.buyer_user_id
      AND (r.status IN ('reserved','allocated','awaiting_payment','converted') OR
        (r.status = 'hold' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))),0) <= json_extract(b.terms,'$.buyerLimit')
  );
END;
--> statement-breakpoint
CREATE TRIGGER preorder_confirm_guard BEFORE UPDATE OF status ON preorder_reservations
WHEN OLD.status = 'hold' AND NEW.status = 'reserved'
BEGIN
  SELECT RAISE(ABORT, 'Reservation hold expired or the offer changed.')
  WHERE OLD.hold_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NOT EXISTS (
    SELECT 1 FROM incoming_batches b JOIN products p ON p.id = b.listing_id JOIN sellers s ON s.id = p.seller_id
    JOIN preorder_seller_access a ON a.seller_id = s.id
    JOIN preorder_policies policy ON policy.version = json_extract(b.terms,'$.policyVersion')
    WHERE b.id = NEW.batch_id AND b.revision = NEW.accepted_revision AND b.status = 'open'
    AND b.evidence_state = 'reviewed' AND b.shortage = 0 AND policy.enabled = 1 AND a.approved = 1
    AND p.status = 'active' AND s.status = 'active' AND s.stripe_charges_enabled = 1 AND s.stripe_payouts_enabled = 1
    AND b.cutoff_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND b.dispatch_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND COALESCE((SELECT SUM(quantity) FROM preorder_reservations r WHERE r.batch_id = b.id
      AND (r.status IN ('reserved','allocated','awaiting_payment','converted') OR
        (r.status = 'hold' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))),0) <= b.capacity - b.safety_buffer
  );
END;
--> statement-breakpoint
CREATE TRIGGER preorder_immutable BEFORE UPDATE ON preorder_reservations
WHEN NEW.terms != OLD.terms OR NEW.batch_id != OLD.batch_id OR (NEW.buyer_user_id IS NOT OLD.buyer_user_id AND NEW.buyer_user_id IS NOT NULL)
  OR NEW.quantity > OLD.quantity OR (OLD.accepted_sequence IS NOT NULL AND NEW.accepted_sequence IS NOT OLD.accepted_sequence)
BEGIN SELECT RAISE(ABORT, 'Accepted preorder terms and queue priority are immutable; additions require a new reservation.'); END;
--> statement-breakpoint
CREATE TRIGGER preorder_stock_allocate BEFORE UPDATE OF allocated_quantity ON preorder_reservations
WHEN NEW.allocated_quantity > OLD.allocated_quantity
BEGIN
  SELECT RAISE(ABORT, 'Inspected stock or queue priority changed.')
  WHERE OLD.status != 'reserved' OR OLD.consent_state != 'accepted' OR EXISTS (
    SELECT 1 FROM preorder_reservations r WHERE r.batch_id = NEW.batch_id AND r.status = 'reserved'
      AND r.consent_state = 'accepted' AND r.accepted_sequence < NEW.accepted_sequence
  ) OR NEW.allocated_quantity + COALESCE((SELECT SUM(allocated_quantity) FROM preorder_reservations r
    WHERE r.batch_id = NEW.batch_id AND r.id != NEW.id AND r.status IN ('allocated','awaiting_payment','converted')),0)
    > (SELECT sellable_quantity FROM incoming_batches WHERE id = NEW.batch_id);
END;
--> statement-breakpoint
CREATE TRIGGER preorder_stock_hold AFTER UPDATE OF allocated_quantity ON preorder_reservations
WHEN NEW.allocated_quantity != OLD.allocated_quantity
BEGIN
  UPDATE products SET reserved_quantity = reserved_quantity + NEW.allocated_quantity - OLD.allocated_quantity
    WHERE id = (SELECT listing_id FROM incoming_batches WHERE id = NEW.batch_id);
END;
--> statement-breakpoint
CREATE TRIGGER preorder_change_event AFTER UPDATE ON preorder_reservations
WHEN NEW.status != OLD.status OR NEW.quantity != OLD.quantity OR NEW.consent_state != OLD.consent_state
 OR NEW.accepted_revision != OLD.accepted_revision OR NEW.contact_email != OLD.contact_email OR NEW.address IS NOT OLD.address
BEGIN
  INSERT INTO preorder_events (id, batch_id, reservation_id, actor, kind, detail, recipient)
  VALUES (lower(hex(randomblob(16))), NEW.batch_id, NEW.id, NEW.actor, 'reservation_update',
    json_object('previousStatus', OLD.status, 'status', NEW.status, 'previousQuantity', OLD.quantity,
      'quantity', NEW.quantity, 'consent', NEW.consent_state, 'consentDeadline', NEW.consent_deadline,
      'previousRevision', OLD.accepted_revision, 'acceptedRevision', NEW.accepted_revision,
      'paymentDeadline', NEW.payment_deadline, 'allocatedQuantity', NEW.allocated_quantity,
      'reason', NEW.reason, 'originalDispatch', json_extract(NEW.terms,'$.dispatch'),
      'currentDispatch', json_extract((SELECT terms FROM incoming_batches WHERE id = NEW.batch_id),'$.dispatch')),
    CASE WHEN OLD.status = 'hold' AND NEW.status IN ('expired','cancelled') AND NEW.idempotency_key NOT LIKE 'waitlist-%' THEN NULL ELSE NEW.contact_email END);
END;
--> statement-breakpoint
CREATE TRIGGER preorder_terms_no_delete BEFORE DELETE ON preorder_reservations
BEGIN SELECT RAISE(ABORT, 'Preorder history must be retained.'); END;
--> statement-breakpoint
CREATE TRIGGER preorder_event_no_edit BEFORE UPDATE ON preorder_events
WHEN NEW.detail != OLD.detail OR NEW.actor != OLD.actor OR NEW.kind != OLD.kind OR NEW.reservation_id IS NOT OLD.reservation_id
BEGIN SELECT RAISE(ABORT, 'Preorder audit events are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER preorder_event_no_delete BEFORE DELETE ON preorder_events
BEGIN SELECT RAISE(ABORT, 'Preorder audit events must be retained.'); END;
