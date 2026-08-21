import { and, eq, inArray, lt } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { checkoutReservationItems, checkoutReservations, products, sellers } from "@/db/schema";
import { calculateServerTotals } from "./business";
import { config } from "./config";
import { determineMarketplaceFee } from "./fees";
import { sellerAcceptedCurrentTerms } from "./legal";

export type RequestedCartItem = { productId: string; quantity: number };

export async function loadAuthoritativeCart(items: RequestedCartItem[]) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 25) throw new Error("Cart must contain between 1 and 25 products.");
  const consolidated = new Map<string, number>();
  for (const item of items) {
    if (typeof item.productId !== "string" || !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new Error("Cart contains an invalid product or quantity.");
    }
    consolidated.set(item.productId, (consolidated.get(item.productId) ?? 0) + item.quantity);
  }
  const db = getDb();
  const rows = await db
    .select({
      id: products.id,
      sellerId: products.sellerId,
      title: products.title,
      description: products.description,
      sellerSku: products.sellerSku,
      scale: products.scale,
      manufacturer: products.modelManufacturer,
      priceCents: products.priceCents,
      currency: products.currency,
      inventoryQuantity: products.inventoryQuantity,
      reservedQuantity: products.reservedQuantity,
      availabilityType: products.availabilityType,
      releaseDate: products.releaseDate,
      status: products.status,
      imageUrl: products.primaryImageUrl,
      packageLength: products.packageLength,
      packageWidth: products.packageWidth,
      packageHeight: products.packageHeight,
      packageWeight: products.packageWeight,
      sellerStatus: sellers.status,
      sellerName: sellers.storeName,
      contactName: sellers.contactName,
      sellerEmail: sellers.contactEmail,
      sellerType: sellers.sellerType,
      isFoundingSeller: sellers.isFoundingSeller,
      foundingRateStartsAt: sellers.foundingRateStartsAt,
      foundingRateEndsAt: sellers.foundingRateEndsAt,
      sellerStripeAccountId: sellers.stripeAccountId,
      stripeChargesEnabled: sellers.stripeChargesEnabled,
      stripePayoutsEnabled: sellers.stripePayoutsEnabled,
      sellerTermsVersion: sellers.sellerTermsVersion,
      sellerTermsAcceptedAt: sellers.sellerTermsAcceptedAt,
      shippingCents: sellers.defaultShippingCents,
      shippingMode: sellers.shippingMode,
      shippingOriginCountry: sellers.shippingOriginCountry,
      shippingOriginRegion: sellers.shippingOriginRegion,
      shippingOriginStreet1: sellers.shippingOriginStreet1,
      shippingOriginStreet2: sellers.shippingOriginStreet2,
      shippingOriginCity: sellers.shippingOriginCity,
      shippingOriginPostalCode: sellers.shippingOriginPostalCode,
      shippingOriginPhone: sellers.shippingOriginPhone,
      defaultPackageLength: sellers.defaultPackageLength,
      defaultPackageWidth: sellers.defaultPackageWidth,
      defaultPackageHeight: sellers.defaultPackageHeight,
      defaultPackageWeight: sellers.defaultPackageWeight,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(inArray(products.id, [...consolidated.keys()]));
  if (rows.length !== consolidated.size) throw new Error("One or more products no longer exist.");
  const sellerIds = new Set(rows.map((row) => row.sellerId));
  if (sellerIds.size !== 1) throw new Error("Model Car Center currently checks out one seller at a time.");
  for (const row of rows) {
    const quantity = consolidated.get(row.id)!;
    if (row.status !== "active" || row.sellerStatus !== "active") throw new Error(`${row.title} is no longer available.`);
    if (row.availabilityType === "preorder" && !row.releaseDate)
      throw new Error(`${row.title} has an incomplete preorder release date.`);
    if (row.inventoryQuantity - row.reservedQuantity < quantity) throw new Error(`Only ${Math.max(0, row.inventoryQuantity - row.reservedQuantity)} of ${row.title} are currently available.`);
  }
  const seller = rows[0];
  if (!seller.sellerStripeAccountId || !seller.stripeChargesEnabled || !seller.stripePayoutsEnabled) {
    throw new Error("This seller is not ready to accept marketplace payments.");
  }
  if (!sellerAcceptedCurrentTerms(seller)) {
    throw new Error(
      "This seller must accept the current Seller Terms before accepting marketplace payments.",
    );
  }
  if (new Set(rows.map((row) => row.currency)).size !== 1) throw new Error("All products in a checkout must use the same currency.");
  const authoritativeItems = rows.map((row) => ({ ...row, quantity: consolidated.get(row.id)! }));
  const fee = determineMarketplaceFee(seller);
  const shippingMode = seller.sellerType === "collector" ? "calculated" : seller.shippingMode;
  const defaultShippingCents =
    shippingMode === "free" ? 0 : shippingMode === "flat" ? seller.shippingCents : 0;
  const totals = calculateServerTotals(
    authoritativeItems,
    defaultShippingCents,
    fee.marketplaceFeeBps,
  );
  return {
    items: authoritativeItems,
    seller,
    fee,
    totals,
    shippingMode,
    currency: rows[0].currency,
  };
}

export type ResolvedCheckoutShipping = {
  mode: "calculated" | "flat" | "free";
  amountCents: number;
  checkoutShippingQuoteId: string | null;
  rateId: string | null;
  carrier: string | null;
  service: string | null;
  serviceToken: string | null;
  estimatedDays: number | null;
  quotedAddress: string | null;
};

export async function reserveCart(
  input: Awaited<ReturnType<typeof loadAuthoritativeCart>>,
  buyerUserId: string | null = null,
  policyVersion: string,
  shipping?: ResolvedCheckoutShipping,
) {
  const d1 = getD1();
  const reservationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.checkoutExpirationMinutes * 60_000);
  const statements = [
    d1.prepare(`INSERT INTO checkout_reservations
      (id, seller_id, buyer_user_id, status, subtotal_cents, shipping_cents, shipping_mode,
       checkout_shipping_quote_id, selected_shipping_rate_id, selected_shipping_carrier,
       selected_shipping_service, selected_shipping_service_token, selected_shipping_estimated_days,
       quoted_shipping_address, marketplace_fee_bps, platform_fee_cents, currency,
       policy_version, policy_accepted_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`)
      .bind(
        reservationId,
        input.seller.sellerId,
        buyerUserId,
        input.totals.subtotalCents,
        input.totals.shippingCents,
        shipping?.mode ?? input.shippingMode,
        shipping?.checkoutShippingQuoteId ?? null,
        shipping?.rateId ?? null,
        shipping?.carrier ?? null,
        shipping?.service ?? null,
        shipping?.serviceToken ?? null,
        shipping?.estimatedDays ?? null,
        shipping?.quotedAddress ?? null,
        input.fee.marketplaceFeeBps,
        input.totals.platformFeeCents,
        input.currency,
        policyVersion,
        expiresAt.toISOString(),
      ),
    d1.prepare(`UPDATE sellers SET
      default_shipping_cents = CASE WHEN status = 'active' THEN default_shipping_cents ELSE -1 END
      WHERE id = ?`).bind(input.seller.sellerId),
  ];
  if (shipping?.checkoutShippingQuoteId) {
    statements.push(
      d1.prepare(`UPDATE checkout_shipping_quotes SET status = 'used', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP`)
        .bind(shipping.checkoutShippingQuoteId),
    );
  }
  for (const item of input.items) {
    statements.push(
      d1.prepare(`UPDATE products SET
        reserved_quantity = CASE WHEN status = 'active' THEN reserved_quantity + ? ELSE -1 END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(item.quantity, item.id),
      d1.prepare(`INSERT INTO checkout_reservation_items
        (id, reservation_id, product_id, product_title_snapshot, seller_sku_snapshot, scale_snapshot,
         manufacturer_snapshot, unit_price_cents, quantity, image_url_snapshot,
         availability_type_snapshot, release_date_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          reservationId,
          item.id,
          item.title,
          item.sellerSku,
          item.scale,
          item.manufacturer,
          item.priceCents,
          item.quantity,
          item.imageUrl,
          item.availabilityType,
          item.releaseDate,
        ),
    );
  }
  try {
    await d1.batch(statements);
  } catch (error) {
    console.error("Checkout reservation batch failed.", error);
    throw new Error("Inventory changed while checkout was starting. Review your cart and try again.");
  }
  return { reservationId, expiresAt };
}

export async function attachStripeSession(reservationId: string, sessionId: string) {
  await getD1()
    .prepare(`UPDATE checkout_reservations SET stripe_checkout_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`)
    .bind(sessionId, reservationId)
    .run();
}

export async function releaseReservation(reservationId: string) {
  const db = getDb();
  const reservation = await db
    .select({ id: checkoutReservations.id })
    .from(checkoutReservations)
    .where(and(eq(checkoutReservations.id, reservationId), eq(checkoutReservations.status, "pending")))
    .limit(1);
  if (!reservation[0]) return false;
  const items = await db
    .select({ productId: checkoutReservationItems.productId, quantity: checkoutReservationItems.quantity })
    .from(checkoutReservationItems)
    .where(eq(checkoutReservationItems.reservationId, reservationId));
  const d1 = getD1();
  const pendingGuard = `EXISTS (SELECT 1 FROM checkout_reservations WHERE id = ? AND status = 'pending')`;
  const statements = items.map((item) =>
    d1.prepare(`UPDATE products SET reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND reserved_quantity >= ? AND ${pendingGuard}`)
      .bind(item.quantity, item.productId, item.quantity, reservationId),
  );
  statements.push(
    d1.prepare(`UPDATE checkout_reservations SET status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`).bind(reservationId),
  );
  await d1.batch(statements);
  return true;
}

export async function releaseStaleReservations(limit = 10) {
  const db = getDb();
  const stale = await db
    .select({ id: checkoutReservations.id })
    .from(checkoutReservations)
    .where(and(eq(checkoutReservations.status, "pending"), lt(checkoutReservations.expiresAt, new Date().toISOString())))
    .limit(limit);
  await Promise.all(stale.map((item) => releaseReservation(item.id)));
  return stale.length;
}
