PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_user_id` text,
	`stripe_checkout_session_id` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_charge_id` text,
	`stripe_refund_id` text,
	`payment_flow` text DEFAULT 'destination' NOT NULL,
	`stripe_transfer_group` text,
	`stripe_transfer_id` text,
	`seller_transfer_status` text DEFAULT 'transferred' NOT NULL,
	`seller_transfer_amount_cents` integer DEFAULT 0 NOT NULL,
	`seller_transfer_reversed_cents` integer DEFAULT 0 NOT NULL,
	`seller_transfer_processing_at` text,
	`seller_transferred_at` text,
	`seller_transfer_last_error` text,
	`buyer_email` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`shipping_mode` text DEFAULT 'flat' NOT NULL,
	`selected_shipping_carrier` text,
	`selected_shipping_service` text,
	`selected_shipping_service_token` text,
	`selected_shipping_estimated_days` integer,
	`fulfillment_service` text,
	`fulfillment_estimated_days` integer,
	`marketplace_fee_bps` integer DEFAULT 1000 NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`payment_processing_fee_cents` integer,
	`seller_proceeds_cents` integer,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`refunded_amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`buyer_name` text DEFAULT '' NOT NULL,
	`shipping_address` text DEFAULT '{}' NOT NULL,
	`carrier` text,
	`tracking_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text,
	`ship_by_at` text,
	`shipped_at` text,
	`delivered_at` text,
	`refund_request_deadline` text,
	`payout_eligible_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "orders_money_nonnegative" CHECK(
      "__new_orders"."subtotal_cents" >= 0 AND "__new_orders"."shipping_cents" >= 0 AND
      "__new_orders"."platform_fee_cents" >= 0 AND "__new_orders"."tax_cents" >= 0 AND "__new_orders"."total_cents" >= 0 AND
      "__new_orders"."refunded_amount_cents" >= 0 AND "__new_orders"."refunded_amount_cents" <= "__new_orders"."total_cents" AND
      "__new_orders"."seller_transfer_amount_cents" >= 0 AND "__new_orders"."seller_transfer_reversed_cents" >= 0 AND
      "__new_orders"."seller_transfer_reversed_cents" <= "__new_orders"."seller_transfer_amount_cents"
    )
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_number", "seller_id", "buyer_user_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_refund_id", "buyer_email", "currency", "subtotal_cents", "shipping_cents", "shipping_mode", "selected_shipping_carrier", "selected_shipping_service", "selected_shipping_service_token", "selected_shipping_estimated_days", "fulfillment_service", "fulfillment_estimated_days", "marketplace_fee_bps", "platform_fee_cents", "payment_processing_fee_cents", "seller_proceeds_cents", "tax_cents", "total_cents", "refunded_amount_cents", "payment_status", "fulfillment_status", "buyer_name", "shipping_address", "carrier", "tracking_number", "created_at", "paid_at", "ship_by_at", "shipped_at", "updated_at") SELECT "id", "order_number", "seller_id", "buyer_user_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_refund_id", "buyer_email", "currency", "subtotal_cents", "shipping_cents", "shipping_mode", "selected_shipping_carrier", "selected_shipping_service", "selected_shipping_service_token", "selected_shipping_estimated_days", "fulfillment_service", "fulfillment_estimated_days", "marketplace_fee_bps", "platform_fee_cents", "payment_processing_fee_cents", "seller_proceeds_cents", "tax_cents", "total_cents", "refunded_amount_cents", "payment_status", "fulfillment_status", "buyer_name", "shipping_address", "carrier", "tracking_number", "created_at", "paid_at", "ship_by_at", "shipped_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
UPDATE `orders`
SET `delivered_at` = (
      SELECT MIN(`shipments`.`delivered_at`)
      FROM `shipment_orders`
      INNER JOIN `shipments` ON `shipments`.`id` = `shipment_orders`.`shipment_id`
      WHERE `shipment_orders`.`order_id` = `orders`.`id`
        AND `shipments`.`delivered_at` IS NOT NULL
    ),
    `refund_request_deadline` = strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      (
        SELECT MIN(`shipments`.`delivered_at`)
        FROM `shipment_orders`
        INNER JOIN `shipments` ON `shipments`.`id` = `shipment_orders`.`shipment_id`
        WHERE `shipment_orders`.`order_id` = `orders`.`id`
          AND `shipments`.`delivered_at` IS NOT NULL
      ),
      '+3 days'
    ),
    `payout_eligible_at` = strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      (
        SELECT MIN(`shipments`.`delivered_at`)
        FROM `shipment_orders`
        INNER JOIN `shipments` ON `shipments`.`id` = `shipment_orders`.`shipment_id`
        WHERE `shipment_orders`.`order_id` = `orders`.`id`
          AND `shipments`.`delivered_at` IS NOT NULL
      ),
      '+3 days'
    )
WHERE EXISTS (
  SELECT 1 FROM `shipment_orders`
  INNER JOIN `shipments` ON `shipments`.`id` = `shipment_orders`.`shipment_id`
  WHERE `shipment_orders`.`order_id` = `orders`.`id`
    AND `shipments`.`delivered_at` IS NOT NULL
);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_session_unique` ON `orders` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_stripe_transfer_unique` ON `orders` (`stripe_transfer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`payment_status`,`fulfillment_status`);--> statement-breakpoint
CREATE INDEX `orders_transfer_release_idx` ON `orders` (`payment_flow`,`seller_transfer_status`,`payout_eligible_at`);--> statement-breakpoint
CREATE INDEX `orders_buyer_user_idx` ON `orders` (`buyer_user_id`,`created_at`);
