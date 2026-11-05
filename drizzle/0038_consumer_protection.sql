-- New transactions only. Accepted reservation/order policy versions are never rewritten.
CREATE TABLE resolution_late_reviews (
 case_id TEXT PRIMARY KEY REFERENCES resolution_cases(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL, payout_hold INTEGER NOT NULL DEFAULT 0 CHECK(payout_hold IN (0,1)),
 reviewed_by TEXT, decision_reason TEXT, reviewed_at TEXT
);
--> statement-breakpoint
CREATE TABLE preorder_recovery_owners (
 reservation_id TEXT PRIMARY KEY REFERENCES preorder_reservations(id) ON DELETE RESTRICT,
 owner_email TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO preorder_recovery_owners SELECT r.id,lower(trim(u.email)) FROM preorder_reservations r JOIN user u ON u.id=r.buyer_user_id;
--> statement-breakpoint
CREATE TRIGGER preorder_recovery_owner AFTER INSERT ON preorder_reservations BEGIN
 INSERT INTO preorder_recovery_owners SELECT NEW.id,lower(trim(email)) FROM user WHERE id=NEW.buyer_user_id;
END;
--> statement-breakpoint
CREATE TRIGGER preorder_recovery_owner_immutable BEFORE UPDATE ON preorder_recovery_owners BEGIN SELECT RAISE(ABORT,'Purchase recovery identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER preorder_refundable_v3 AFTER UPDATE OF status ON preorder_reservations
WHEN NEW.status IN ('cancelled','expired') AND OLD.status IN ('hold','reserved','allocated','awaiting_payment')
AND json_extract(OLD.terms,'$.policyVersion')='mcc-preorder-deposit-2026-09-v3'
BEGIN
 UPDATE preorder_payment_ledger SET status='recovery',refund_status='required',updated_at=CURRENT_TIMESTAMP
 WHERE reservation_id=NEW.id AND kind='deposit' AND refund_status='not_required';
END;
--> statement-breakpoint
INSERT INTO preorder_policies(version,terms,delay_response_days,reviewed_by,reviewed_at,enabled) VALUES('mcc-preorder-deposit-2026-09-v3','Pay a 10% merchandise deposit to confirm your preorder. The deposit is credited toward the full item price. The remaining balance, shipping and remaining applicable tax are due within seven days after the seller marks your items ready. You may cancel before shipment for a full refund of payments made. If you miss the balance deadline, your reservation is cancelled and your deposit and deposit tax are refunded. If the seller cannot fulfill, materially changes the item, or cannot meet the promised shipping date and you do not accept the delay, your payment is refunded. Your rights under applicable law are unaffected. No automatic balance charges.',7,'Platform refundable deposit policy',CURRENT_TIMESTAMP,1);
--> statement-breakpoint
-- Old offers can fulfill accepted commitments but cannot take new deposits under forfeiture terms.
CREATE TRIGGER refundable_new_deposit_guard BEFORE INSERT ON preorder_reservations
WHEN json_extract(NEW.terms,'$.paymentModel')='deposit_10' AND json_extract(NEW.terms,'$.policyVersion')!='mcc-preorder-deposit-2026-09-v3'
BEGIN SELECT RAISE(ABORT,'This offer needs the current refundable deposit terms before accepting new reservations.'); END;
--> statement-breakpoint
CREATE TABLE purchase_evidence (
 id TEXT PRIMARY KEY, checkout_id TEXT REFERENCES checkout_reservations(id) ON DELETE RESTRICT,
 preorder_id TEXT REFERENCES preorder_reservations(id) ON DELETE RESTRICT,
 product_id TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX purchase_evidence_checkout ON purchase_evidence(checkout_id);
--> statement-breakpoint
CREATE TRIGGER purchase_evidence_no_edit BEFORE UPDATE ON purchase_evidence BEGIN SELECT RAISE(ABORT,'Purchase evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_evidence_no_delete BEFORE DELETE ON purchase_evidence BEGIN SELECT RAISE(ABORT,'Purchase evidence requires controlled retention review'); END;
--> statement-breakpoint
CREATE TABLE purchase_evidence_media (
 evidence_id TEXT NOT NULL REFERENCES purchase_evidence(id) ON DELETE RESTRICT,
 storage_key TEXT NOT NULL, PRIMARY KEY(evidence_id,storage_key)
);
--> statement-breakpoint
CREATE INDEX purchase_evidence_media_key ON purchase_evidence_media(storage_key);
--> statement-breakpoint
CREATE TRIGGER purchase_evidence_media_no_edit BEFORE UPDATE ON purchase_evidence_media BEGIN SELECT RAISE(ABORT,'Purchase evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_evidence_media_no_delete BEFORE DELETE ON purchase_evidence_media BEGIN SELECT RAISE(ABORT,'Purchase evidence requires controlled retention review'); END;
--> statement-breakpoint
CREATE TRIGGER checkout_purchase_evidence AFTER INSERT ON checkout_reservation_items BEGIN
 INSERT INTO purchase_evidence(id,checkout_id,product_id,snapshot)
 SELECT NEW.id,NEW.reservation_id,p.id,json_object('title',NEW.product_title_snapshot,'unitPriceCents',NEW.unit_price_cents,'quantity',NEW.quantity,'checkoutPolicyVersion',(SELECT policy_version FROM checkout_reservations WHERE id=NEW.reservation_id),'protectionPolicyVersion',(SELECT protection_policy_version FROM checkout_reservations WHERE id=NEW.reservation_id),'description',p.description,'condition',p.condition,'condition_notes',p.condition_notes,'model_condition',p.model_condition,'packaging_condition',p.packaging_condition,'original_box_status',p.original_box_status,'missing_parts',p.missing_parts,'defects',p.defects,'restoration_customization',p.restoration_customization,'accessories',p.accessories,'provenance',p.provenance,'coa_status',p.coa_status,'edition_serial',p.edition_serial,'primary_image_url',p.primary_image_url,'sellerName',s.store_name,'sellerReturnPolicy',s.return_policy_summary,'handlingDays',s.handling_time_business_days,'sellerTermsVersion',s.seller_terms_version,'sellerShippingPolicy',s.shipping_policy_summary,'media',json((SELECT COALESCE(json_group_array(json_object('url',url,'storageKey',storage_key,'alt',alt)),'[]') FROM product_images WHERE product_id=p.id)))
 FROM products p JOIN sellers s ON s.id=p.seller_id WHERE p.id=NEW.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER preorder_purchase_evidence AFTER INSERT ON preorder_reservations BEGIN
 INSERT INTO purchase_evidence(id,preorder_id,product_id,snapshot)
 SELECT NEW.id,NEW.id,p.id,json_object('acceptedTerms',json(NEW.terms),'description',p.description,'condition',p.condition,'condition_notes',p.condition_notes,'model_condition',p.model_condition,'packaging_condition',p.packaging_condition,'original_box_status',p.original_box_status,'missing_parts',p.missing_parts,'defects',p.defects,'restoration_customization',p.restoration_customization,'accessories',p.accessories,'provenance',p.provenance,'coa_status',p.coa_status,'edition_serial',p.edition_serial,'primary_image_url',p.primary_image_url,'sellerName',s.store_name,'sellerReturnPolicy',s.return_policy_summary,'handlingDays',s.handling_time_business_days,'sellerTermsVersion',s.seller_terms_version,'sellerShippingPolicy',s.shipping_policy_summary,'media',json((SELECT COALESCE(json_group_array(json_object('url',url,'storageKey',storage_key,'alt',alt)),'[]') FROM product_images WHERE product_id=p.id)))
 FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id WHERE b.id=NEW.batch_id;
END;
--> statement-breakpoint
CREATE TRIGGER retain_purchase_media AFTER INSERT ON purchase_evidence BEGIN
 INSERT OR IGNORE INTO purchase_evidence_media SELECT NEW.id,substr(value,8) FROM json_tree(NEW.snapshot)
 WHERE type='text' AND value LIKE '/media/listings/%';
 SELECT RAISE(ABORT,'A listing photo is no longer available. Refresh the listing.') WHERE EXISTS (
 SELECT 1 FROM purchase_evidence_media e JOIN security_uploads u ON u.storage_key=e.storage_key
 WHERE e.evidence_id=NEW.id AND u.state!='stored');
END;
--> statement-breakpoint
CREATE TABLE order_shipping_delays (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 promised_at TEXT NOT NULL, proposed_at TEXT NOT NULL, response_by TEXT NOT NULL,
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancel_requested','refunding','refunded','fulfilled')),
 requested_by TEXT NOT NULL, created_at TEXT NOT NULL, notified_at TEXT, responded_at TEXT,
 error TEXT, attempts INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX order_shipping_delay_active ON order_shipping_delays(order_id) WHERE status IN ('pending','cancel_requested','refunding');
--> statement-breakpoint
CREATE TABLE legal_notifications (
 id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, error TEXT
);
--> statement-breakpoint
CREATE TABLE marketplace_reports (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('suspicious','copyright','counter_notice','other')),
 email TEXT NOT NULL, name TEXT NOT NULL, subject_url TEXT NOT NULL, details TEXT NOT NULL, signature TEXT NOT NULL,
 related_id TEXT, seller_id TEXT REFERENCES sellers(id), status TEXT NOT NULL DEFAULT 'received',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, due_at TEXT NOT NULL, reviewed_by TEXT, decision TEXT,
 counter_forwarded_at TEXT, restore_after TEXT, restore_by TEXT, litigation_at TEXT
);
--> statement-breakpoint
CREATE TABLE compliance_audit (
 id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TRIGGER compliance_audit_no_edit BEFORE UPDATE ON compliance_audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER compliance_audit_no_delete BEFORE DELETE ON compliance_audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
--> statement-breakpoint
CREATE TABLE seller_compliance (
 seller_id TEXT PRIMARY KEY REFERENCES sellers(id) ON DELETE RESTRICT,
 covered INTEGER NOT NULL DEFAULT 0, disclosure_required INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL, due_at TEXT NOT NULL,
 information TEXT, submitted_at TEXT, certified_at TEXT, verified_at TEXT, verification_due_at TEXT,
 reviewed_by TEXT, verification_reference TEXT, public_disclosure TEXT, exemption_reason TEXT,
 suspended_at TEXT
);
--> statement-breakpoint
-- Refund claims and carrier acceptance cannot both win a race.
CREATE TRIGGER cancel_pending_shipment_guard BEFORE UPDATE OF fulfillment_status ON orders
WHEN NEW.fulfillment_status IN ('processing','shipped','delivered') AND EXISTS (
 SELECT 1 FROM order_shipping_delays WHERE order_id=NEW.id AND status IN ('cancel_requested','refunding','refunded'))
BEGIN SELECT RAISE(ABORT,'Order cancellation is in progress; do not ship.'); END;
--> statement-breakpoint
CREATE TRIGGER delay_cancellation_guard BEFORE UPDATE OF status ON order_shipping_delays
WHEN NEW.status='cancel_requested' AND EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND shipped_at IS NOT NULL)
BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
CREATE TRIGGER delay_creation_guard BEFORE INSERT ON order_shipping_delays
WHEN EXISTS (SELECT 1 FROM orders WHERE id=NEW.order_id AND (shipped_at IS NOT NULL OR payment_status NOT IN ('paid','partially_refunded')))
BEGIN SELECT RAISE(ABORT,'This order cannot be delayed or cancelled before shipment.'); END;
--> statement-breakpoint
ALTER TABLE checkout_reservations ADD existing_commitment INTEGER NOT NULL DEFAULT 0 CHECK(existing_commitment IN (0,1));
--> statement-breakpoint
CREATE TRIGGER compliance_checkout_guard BEFORE INSERT ON checkout_reservations
WHEN NEW.existing_commitment=0 AND EXISTS(SELECT 1 FROM seller_compliance WHERE seller_id=NEW.seller_id AND suspended_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Seller compliance review required before checkout.'); END;
--> statement-breakpoint
CREATE TRIGGER compliance_preorder_guard BEFORE INSERT ON preorder_reservations
WHEN EXISTS(SELECT 1 FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN seller_compliance c ON c.seller_id=p.seller_id WHERE b.id=NEW.batch_id AND c.suspended_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Seller compliance review required before new reservations.'); END;
--> statement-breakpoint
-- Unlinking an account is permitted; reassignment requires the original verified identity.
DROP TRIGGER preorder_immutable;
--> statement-breakpoint
CREATE TRIGGER preorder_immutable BEFORE UPDATE ON preorder_reservations
WHEN NEW.terms != OLD.terms OR NEW.batch_id != OLD.batch_id
 OR (NEW.buyer_user_id IS NOT OLD.buyer_user_id AND NEW.buyer_user_id IS NOT NULL AND NOT (
   OLD.buyer_user_id IS NULL AND EXISTS(SELECT 1 FROM preorder_recovery_owners r JOIN user u
    ON lower(trim(u.email))=r.owner_email WHERE r.reservation_id=OLD.id AND u.id=NEW.buyer_user_id AND u.email_verified=1)))
 OR NEW.quantity > OLD.quantity OR (OLD.accepted_sequence IS NOT NULL AND NEW.accepted_sequence IS NOT OLD.accepted_sequence)
BEGIN SELECT RAISE(ABORT,'Accepted preorder terms, ownership and queue priority are immutable.'); END;
--> statement-breakpoint
CREATE TABLE seller_recovery_owners(seller_id TEXT PRIMARY KEY REFERENCES sellers(id),owner_email TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER seller_account_recovery BEFORE DELETE ON user BEGIN
 INSERT OR IGNORE INTO seller_recovery_owners SELECT id,lower(trim(OLD.email)) FROM sellers WHERE owner_user_id=OLD.id AND seller_type='collector';
END;
--> statement-breakpoint
CREATE TABLE order_recovery_owners(order_id TEXT PRIMARY KEY REFERENCES orders(id),owner_email TEXT NOT NULL);
--> statement-breakpoint
INSERT INTO order_recovery_owners SELECT o.id,lower(trim(u.email)) FROM orders o JOIN user u ON u.id=o.buyer_user_id;
--> statement-breakpoint
CREATE TRIGGER order_account_recovery AFTER INSERT ON orders WHEN NEW.buyer_user_id IS NOT NULL BEGIN
 INSERT INTO order_recovery_owners SELECT NEW.id,lower(trim(email)) FROM user WHERE id=NEW.buyer_user_id;
END;
--> statement-breakpoint
CREATE TRIGGER order_recovery_no_edit BEFORE UPDATE ON order_recovery_owners BEGIN SELECT RAISE(ABORT,'Purchase recovery identity is immutable'); END;
--> statement-breakpoint
-- Combining external tracking across orders bypasses aggregate value/insurance checks.
-- Combined shipments must use an MCC label with recorded shipment-order links.
CREATE TRIGGER external_combined_tracking_guard BEFORE UPDATE OF carrier,tracking_number ON orders
WHEN NEW.tracking_number IS NOT NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id!=NEW.id
 AND o.tracking_number=NEW.tracking_number AND lower(o.carrier)=lower(NEW.carrier)
 AND NOT EXISTS(SELECT 1 FROM shipment_orders a JOIN shipment_orders b ON a.shipment_id=b.shipment_id
  WHERE a.order_id=NEW.id AND b.order_id=o.id))
BEGIN SELECT RAISE(ABORT,'Combined shipments require an MCC label with aggregate insurance checks.'); END;
