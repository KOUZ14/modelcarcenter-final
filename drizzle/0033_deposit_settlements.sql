ALTER TABLE `preorder_deposit_checkouts` ADD `dispute_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_deposit_checkouts` ADD `seller_transfer_id` text;--> statement-breakpoint
ALTER TABLE `preorder_deposit_checkouts` ADD `seller_transfer_amount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preorder_deposit_checkouts` ADD `seller_transfer_reversed_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT INTO preorder_policies (version,terms,delay_response_days,reviewed_by,reviewed_at,enabled)
VALUES ('mcc-preorder-deposit-2026-09-v2','Pay a 10% merchandise deposit to confirm your preorder. The deposit is credited toward the full item price. The remaining balance, shipping and remaining applicable tax are due within seven days after the seller marks your items ready. The deposit is non-refundable for a change of mind or a missed balance deadline, unless the seller approves a refund. If the seller cannot fulfill, materially changes the item, or cannot meet the promised shipping date and you do not accept the delay, your payment is refunded. Your rights under applicable law are unaffected. No automatic balance charges.',7,'platform deposit policy',CURRENT_TIMESTAMP,1);
--> statement-breakpoint
DROP TRIGGER preorder_hold_capacity;
--> statement-breakpoint
DROP TRIGGER preorder_confirm_guard;
--> statement-breakpoint
CREATE TRIGGER preorder_hold_capacity BEFORE INSERT ON preorder_reservations
BEGIN
  SELECT RAISE(ABORT, 'Preorder capacity, terms or seller eligibility changed. Please review the offer.')
  WHERE NEW.status != 'hold' OR NOT EXISTS (
    SELECT 1 FROM incoming_batches b JOIN products p ON p.id = b.listing_id
    JOIN sellers s ON s.id = p.seller_id
    LEFT JOIN preorder_seller_access a ON a.seller_id = s.id
    JOIN preorder_policies policy ON policy.version = json_extract(b.terms, '$.policyVersion')
    WHERE b.id = NEW.batch_id AND b.status = 'open' AND (json_extract(b.terms,'$.paymentModel')='deposit_10' OR b.evidence_state = 'reviewed')
    AND b.supply_state IN ('expected','in_transit') AND b.shortage = 0
    AND p.availability_type = 'preorder' AND p.status = 'active' AND p.price_cents > 0
    AND s.status = 'active' AND s.seller_type = 'professional' AND (json_extract(b.terms,'$.paymentModel')='deposit_10' OR a.approved = 1)
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
    LEFT JOIN preorder_seller_access a ON a.seller_id = s.id
    JOIN preorder_policies policy ON policy.version = json_extract(b.terms,'$.policyVersion')
    WHERE b.id = NEW.batch_id AND b.revision = NEW.accepted_revision AND b.status = 'open'
    AND (json_extract(NEW.terms,'$.paymentModel')!='deposit_10' OR EXISTS(SELECT 1 FROM preorder_payment_ledger d WHERE d.reservation_id=NEW.id AND d.kind='deposit' AND d.status='paid' AND d.refund_status='not_required'))
    AND (json_extract(b.terms,'$.paymentModel')='deposit_10' OR b.evidence_state = 'reviewed') AND b.shortage = 0 AND policy.enabled = 1 AND (json_extract(b.terms,'$.paymentModel')='deposit_10' OR a.approved = 1)
    AND p.status = 'active' AND s.status = 'active' AND s.stripe_charges_enabled = 1 AND s.stripe_payouts_enabled = 1
    AND b.cutoff_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND b.dispatch_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND COALESCE((SELECT SUM(quantity) FROM preorder_reservations r WHERE r.batch_id = b.id
      AND (r.status IN ('reserved','allocated','awaiting_payment','converted') OR
        (r.status = 'hold' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))),0) <= b.capacity - b.safety_buffer
  );
END;
--> statement-breakpoint

CREATE TRIGGER preorder_batch_accepted_edit BEFORE UPDATE OF terms ON incoming_batches
WHEN NEW.revision=OLD.revision AND NEW.terms!=OLD.terms AND EXISTS (
 SELECT 1 FROM preorder_reservations r WHERE r.batch_id=OLD.id AND
 (r.accepted_at IS NOT NULL OR (r.status='hold' AND r.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))
)
BEGIN
 SELECT RAISE(ABORT,'Accepted preorder terms must be changed through the buyer notice workflow.');
END;
