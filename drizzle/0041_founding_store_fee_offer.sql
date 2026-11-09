-- Explicit, one-time grant. Existing founding history never enrolls stores automatically.
ALTER TABLE sellers ADD founding_fee_granted_at text;
ALTER TABLE sellers ADD founding_fee_granted_by text;
ALTER TABLE sellers ADD founding_fee_reserved_units integer NOT NULL DEFAULT 0 CHECK (founding_fee_reserved_units BETWEEN 0 AND 10);
ALTER TABLE sellers ADD founding_fee_used_units integer NOT NULL DEFAULT 0 CHECK (founding_fee_used_units >= 0 AND founding_fee_used_units + founding_fee_reserved_units <= 10);
ALTER TABLE checkout_reservations ADD founding_fee_free_units integer NOT NULL DEFAULT 0 CHECK (founding_fee_free_units BETWEEN 0 AND 10);
ALTER TABLE checkout_reservations ADD founding_fee_free_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (founding_fee_free_subtotal_cents BETWEEN 0 AND subtotal_cents);
ALTER TABLE orders ADD founding_fee_free_units integer NOT NULL DEFAULT 0 CHECK (founding_fee_free_units BETWEEN 0 AND 10);
ALTER TABLE orders ADD founding_fee_free_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (founding_fee_free_subtotal_cents BETWEEN 0 AND subtotal_cents);

-- These run inside the same atomic D1 batch as inventory reservation/payment.
CREATE TRIGGER founding_fee_reserve BEFORE INSERT ON checkout_reservations
WHEN NEW.founding_fee_free_units > 0
BEGIN
  SELECT CASE WHEN NEW.status != 'pending' OR NOT EXISTS (
    SELECT 1 FROM sellers WHERE id = NEW.seller_id AND seller_type = 'professional'
      AND founding_fee_granted_at IS NOT NULL
      AND founding_fee_used_units + founding_fee_reserved_units + NEW.founding_fee_free_units <= 10
  ) THEN RAISE(ABORT, 'Founding fee allowance changed; retry checkout') END;
  UPDATE sellers SET founding_fee_reserved_units = founding_fee_reserved_units + NEW.founding_fee_free_units WHERE id = NEW.seller_id;
END;

CREATE TRIGGER founding_fee_complete AFTER UPDATE OF status ON checkout_reservations
WHEN OLD.status = 'pending' AND NEW.status = 'completed' AND OLD.founding_fee_free_units > 0
BEGIN
  UPDATE sellers SET founding_fee_reserved_units = founding_fee_reserved_units - OLD.founding_fee_free_units,
    founding_fee_used_units = founding_fee_used_units + OLD.founding_fee_free_units WHERE id = OLD.seller_id;
END;

CREATE TRIGGER founding_fee_release AFTER UPDATE OF status ON checkout_reservations
WHEN OLD.status = 'pending' AND NEW.status = 'released' AND OLD.founding_fee_free_units > 0
BEGIN
  UPDATE sellers SET founding_fee_reserved_units = founding_fee_reserved_units - OLD.founding_fee_free_units WHERE id = OLD.seller_id;
END;

CREATE TRIGGER founding_fee_delete_pending AFTER DELETE ON checkout_reservations
WHEN OLD.status = 'pending' AND OLD.founding_fee_free_units > 0
BEGIN
  UPDATE sellers SET founding_fee_reserved_units = founding_fee_reserved_units - OLD.founding_fee_free_units WHERE id = OLD.seller_id;
END;

CREATE TRIGGER founding_fee_snapshot_immutable BEFORE UPDATE OF founding_fee_free_units, founding_fee_free_subtotal_cents, seller_id ON checkout_reservations
WHEN NEW.founding_fee_free_units != OLD.founding_fee_free_units OR NEW.founding_fee_free_subtotal_cents != OLD.founding_fee_free_subtotal_cents OR NEW.seller_id != OLD.seller_id
BEGIN
  SELECT RAISE(ABORT, 'Checkout fee snapshot is immutable');
END;

CREATE TRIGGER founding_fee_no_reopen BEFORE UPDATE OF status ON checkout_reservations
WHEN OLD.founding_fee_free_units > 0 AND OLD.status != 'pending' AND NEW.status != OLD.status
BEGIN
  SELECT RAISE(ABORT, 'Completed or released founding checkout cannot be reopened');
END;
