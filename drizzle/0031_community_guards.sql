-- Share the existing inventory authority with listing checkouts.
CREATE TRIGGER community_offer_insert BEFORE INSERT ON collection_offers BEGIN
 SELECT RAISE(ABORT,'Piece is no longer accepting offers') WHERE NOT EXISTS(SELECT 1 FROM collection_items i JOIN community_settings s ON s.user_id=i.owner_id JOIN products p ON p.id=i.listing_id WHERE i.id=NEW.item_id AND i.owner_id=NEW.owner_id AND i.owner_id!=NEW.buyer_id AND i.visibility='public' AND s.published=1 AND i.availability='open_to_offers' AND i.version=NEW.item_version AND p.status='active' AND p.inventory_quantity=1 AND p.reserved_quantity=0 AND NEW.price_cents>=i.minimum_cents);
 SELECT RAISE(ABORT,'Contact unavailable') WHERE EXISTS(SELECT 1 FROM collector_relationships WHERE kind='block' AND ((owner_id=NEW.owner_id AND target_id=NEW.buyer_id) OR(owner_id=NEW.buyer_id AND target_id=NEW.owner_id)));
END;
--> statement-breakpoint
CREATE TRIGGER community_offer_immutable BEFORE UPDATE OF price_cents,currency,terms,item_version,destination,buyer_id,owner_id,proposer_id,root_id,expires_at ON collection_offers BEGIN
 SELECT RAISE(ABORT,'Offer versions are immutable; make a counteroffer');
END;
--> statement-breakpoint
CREATE TRIGGER community_offer_reserve BEFORE UPDATE OF status ON collection_offers WHEN NEW.status='reserved' AND OLD.status!='reserved' BEGIN
 SELECT RAISE(ABORT,'Piece already reserved or offer changed') WHERE OLD.status!='proposed' OR OLD.expires_at<=unixepoch()*1000 OR NOT EXISTS(SELECT 1 FROM collection_items i JOIN community_settings s ON s.user_id=i.owner_id JOIN products p ON p.id=i.listing_id WHERE i.id=NEW.item_id AND i.visibility='public' AND s.published=1 AND i.availability='open_to_offers' AND i.version=NEW.item_version AND p.status='active' AND p.inventory_quantity=1 AND p.reserved_quantity=0);
 SELECT RAISE(ABORT,'Contact unavailable') WHERE EXISTS(SELECT 1 FROM collector_relationships WHERE kind='block' AND ((owner_id=NEW.owner_id AND target_id=NEW.buyer_id) OR(owner_id=NEW.buyer_id AND target_id=NEW.owner_id)));
 UPDATE products SET reserved_quantity=reserved_quantity+1 WHERE id=(SELECT listing_id FROM collection_items WHERE id=NEW.item_id);
END;
--> statement-breakpoint
CREATE TRIGGER community_offer_release AFTER UPDATE OF status ON collection_offers WHEN OLD.status='reserved' AND NEW.status IN ('expired','withdrawn','declined') BEGIN
 UPDATE checkout_reservations SET status='released' WHERE id=OLD.checkout_id AND status='pending';
 UPDATE products SET reserved_quantity=reserved_quantity-1 WHERE id=(SELECT listing_id FROM collection_items WHERE id=NEW.item_id) AND reserved_quantity>0;
END;
--> statement-breakpoint
CREATE TRIGGER community_checkout_claim BEFORE INSERT ON collection_offer_checkouts BEGIN
 SELECT RAISE(ABORT,'Offer checkout is unavailable') WHERE NOT EXISTS(SELECT 1 FROM collection_offers o JOIN checkout_reservations c ON c.id=NEW.checkout_id WHERE o.id=NEW.offer_id AND o.status='reserved' AND o.payment_deadline>unixepoch()*1000 AND c.buyer_user_id=o.buyer_id AND c.currency=o.currency AND c.subtotal_cents=o.price_cents AND o.checkout_id=c.id AND c.status='pending');
END;
--> statement-breakpoint
CREATE TRIGGER community_checkout_complete BEFORE UPDATE OF status ON checkout_reservations WHEN NEW.status='completed' AND EXISTS(SELECT 1 FROM collection_offer_checkouts WHERE checkout_id=NEW.id) BEGIN
 SELECT RAISE(ABORT,'Expired offer payment requires reconciliation') WHERE NOT EXISTS(SELECT 1 FROM collection_offer_checkouts c JOIN collection_offers o ON o.id=c.offer_id WHERE c.checkout_id=NEW.id AND o.checkout_id=NEW.id AND o.status='reserved' AND o.payment_deadline>unixepoch()*1000);
END;
--> statement-breakpoint
CREATE TRIGGER community_checkout_paid AFTER UPDATE OF status ON checkout_reservations WHEN NEW.status='completed' AND OLD.status='pending' BEGIN
 UPDATE collection_offers SET status='completed' WHERE id=(SELECT offer_id FROM collection_offer_checkouts WHERE checkout_id=NEW.id) AND status='reserved';
 UPDATE collection_items SET availability='previously_owned',version=version+1 WHERE listing_id IN (SELECT product_id FROM checkout_reservation_items WHERE reservation_id=NEW.id) AND EXISTS(SELECT 1 FROM products WHERE id=listing_id AND inventory_quantity=0);
 UPDATE collection_offers SET status='superseded' WHERE status='proposed' AND item_id IN(SELECT id FROM collection_items WHERE availability='previously_owned');
END;
--> statement-breakpoint
CREATE TRIGGER community_piece_terms AFTER UPDATE OF version,visibility,availability ON collection_items BEGIN
 UPDATE collection_offers SET status='withdrawn' WHERE item_id=NEW.id AND status='proposed' AND (NEW.version!=OLD.version OR NEW.visibility!='public' OR NEW.availability!='open_to_offers');
END;
--> statement-breakpoint
CREATE TRIGGER community_profile_private AFTER UPDATE OF published ON community_settings WHEN NEW.published=0 BEGIN
 UPDATE collection_offers SET status='withdrawn' WHERE owner_id=NEW.user_id AND status='proposed';
END;
--> statement-breakpoint
CREATE TRIGGER community_block_offers AFTER INSERT ON collector_relationships WHEN NEW.kind='block' BEGIN
 UPDATE collection_offers SET status='withdrawn' WHERE status='proposed' AND ((buyer_id=NEW.owner_id AND owner_id=NEW.target_id) OR (owner_id=NEW.owner_id AND buyer_id=NEW.target_id));
END;
--> statement-breakpoint
CREATE TRIGGER community_piece_listing_guard BEFORE UPDATE OF listing_id,catalog_id ON collection_items WHEN EXISTS(SELECT 1 FROM collection_offers WHERE item_id=OLD.id AND status IN ('reserved','completed')) AND (NEW.listing_id IS NOT OLD.listing_id OR NEW.catalog_id IS NOT OLD.catalog_id) BEGIN
 SELECT RAISE(ABORT,'Committed physical inventory cannot be relinked');
END;
--> statement-breakpoint
CREATE TRIGGER community_listing_quantity BEFORE UPDATE OF inventory_quantity ON products WHEN EXISTS(SELECT 1 FROM collection_items WHERE listing_id=OLD.id) AND NEW.inventory_quantity>1 BEGIN
 SELECT RAISE(ABORT,'A collection piece is one physical unit');
END;
--> statement-breakpoint
CREATE TRIGGER community_shelf_owner BEFORE INSERT ON shelf_members WHEN NOT EXISTS(SELECT 1 FROM collection_shelves s JOIN collection_items i ON i.owner_id=s.owner_id WHERE s.id=NEW.shelf_id AND i.id=NEW.item_id) BEGIN
 SELECT RAISE(ABORT,'Shelf and piece must have the same owner');
END;
--> statement-breakpoint
CREATE TRIGGER community_listing_lock BEFORE UPDATE OF title,description,catalog_product_id,condition,condition_notes,model_condition,package_length,package_width,package_height,package_weight,ship_from_address_id,currency ON products WHEN EXISTS(SELECT 1 FROM collection_items i JOIN collection_offers o ON o.item_id=i.id WHERE i.listing_id=OLD.id AND o.status='reserved') BEGIN
 SELECT RAISE(ABORT,'Accepted collection terms cannot change during a reservation');
END;
--> statement-breakpoint
CREATE TRIGGER community_listing_revision AFTER UPDATE OF title,description,catalog_product_id,condition,condition_notes,model_condition,package_length,package_width,package_height,package_weight,ship_from_address_id,currency ON products BEGIN
 UPDATE collection_items SET version=version+1 WHERE listing_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER community_shipping_lock BEFORE UPDATE OF shipping_mode,default_shipping_cents,handling_time_business_days,shipping_origin_street_1,shipping_origin_city,shipping_origin_region,shipping_origin_postal_code,shipping_origin_country ON sellers WHEN EXISTS(SELECT 1 FROM products p JOIN collection_items i ON i.listing_id=p.id JOIN collection_offers o ON o.item_id=i.id WHERE p.seller_id=OLD.id AND o.status='reserved') AND (NEW.shipping_mode IS NOT OLD.shipping_mode OR NEW.default_shipping_cents IS NOT OLD.default_shipping_cents OR NEW.handling_time_business_days IS NOT OLD.handling_time_business_days OR NEW.shipping_origin_street_1 IS NOT OLD.shipping_origin_street_1 OR NEW.shipping_origin_city IS NOT OLD.shipping_origin_city OR NEW.shipping_origin_region IS NOT OLD.shipping_origin_region OR NEW.shipping_origin_postal_code IS NOT OLD.shipping_origin_postal_code OR NEW.shipping_origin_country IS NOT OLD.shipping_origin_country) BEGIN
 SELECT RAISE(ABORT,'Accepted shipping terms cannot change during a reservation');
END;
--> statement-breakpoint
CREATE TRIGGER community_shipping_revision AFTER UPDATE OF shipping_mode,default_shipping_cents,handling_time_business_days,shipping_origin_street_1,shipping_origin_city,shipping_origin_region,shipping_origin_postal_code,shipping_origin_country ON sellers WHEN NEW.shipping_mode IS NOT OLD.shipping_mode OR NEW.default_shipping_cents IS NOT OLD.default_shipping_cents OR NEW.handling_time_business_days IS NOT OLD.handling_time_business_days OR NEW.shipping_origin_street_1 IS NOT OLD.shipping_origin_street_1 OR NEW.shipping_origin_city IS NOT OLD.shipping_origin_city OR NEW.shipping_origin_region IS NOT OLD.shipping_origin_region OR NEW.shipping_origin_postal_code IS NOT OLD.shipping_origin_postal_code OR NEW.shipping_origin_country IS NOT OLD.shipping_origin_country BEGIN
 UPDATE collection_items SET version=version+1 WHERE listing_id IN(SELECT id FROM products WHERE seller_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER community_address_lock BEFORE UPDATE ON seller_addresses WHEN EXISTS(SELECT 1 FROM products p JOIN collection_items i ON i.listing_id=p.id JOIN collection_offers o ON o.item_id=i.id WHERE p.ship_from_address_id=OLD.id AND o.status='reserved') BEGIN
 SELECT RAISE(ABORT,'Accepted shipping origin cannot change during a reservation');
END;
--> statement-breakpoint
CREATE TRIGGER community_address_revision AFTER UPDATE ON seller_addresses BEGIN
 UPDATE collection_items SET version=version+1 WHERE listing_id IN(SELECT id FROM products WHERE ship_from_address_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER community_collection_purchase_guard BEFORE UPDATE OF reserved_quantity ON products WHEN NEW.reserved_quantity>OLD.reserved_quantity AND EXISTS(SELECT 1 FROM collection_items i LEFT JOIN community_settings s ON s.user_id=i.owner_id WHERE i.listing_id=OLD.id AND (i.availability NOT IN ('open_to_offers','for_sale') OR i.visibility!='public' OR coalesce(s.published,0)!=1)) BEGIN
 SELECT RAISE(ABORT,'Collection piece is not available for purchase');
END;
--> statement-breakpoint
CREATE TRIGGER community_hide_listing AFTER UPDATE OF visibility,availability ON collection_items WHEN (NEW.visibility='private' OR NEW.availability='not_for_sale') AND NEW.listing_id IS NOT NULL BEGIN
 UPDATE products SET status='inactive' WHERE id=NEW.listing_id AND reserved_quantity=0;
END;
--> statement-breakpoint
CREATE TRIGGER community_release_hidden_listing AFTER UPDATE OF reserved_quantity ON products WHEN NEW.reserved_quantity=0 AND OLD.reserved_quantity>0 AND EXISTS(SELECT 1 FROM collection_items i WHERE i.listing_id=NEW.id AND (i.visibility='private' OR i.availability='not_for_sale')) BEGIN
 UPDATE products SET status='inactive' WHERE id=NEW.id AND inventory_quantity>0;
END;
