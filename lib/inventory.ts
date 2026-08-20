import { and, eq, inArray, lt } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { checkoutReservationItems, checkoutReservations, products, sellers } from "@/db/schema";
import { calculateServerTotals } from "./business";
import { config } from "./config";

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
      status: products.status,
      imageUrl: products.primaryImageUrl,
      sellerStatus: sellers.status,
      sellerName: sellers.storeName,
      sellerEmail: sellers.contactEmail,
      sellerStripeAccountId: sellers.stripeAccountId,
      stripeChargesEnabled: sellers.stripeChargesEnabled,
      stripePayoutsEnabled: sellers.stripePayoutsEnabled,
      shippingCents: sellers.defaultShippingCents,
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
    if (row.inventoryQuantity - row.reservedQuantity < quantity) throw new Error(`Only ${Math.max(0, row.inventoryQuantity - row.reservedQuantity)} of ${row.title} are currently available.`);
  }
  const seller = rows[0];
  if (!seller.sellerStripeAccountId || !seller.stripeChargesEnabled || !seller.stripePayoutsEnabled) {
    throw new Error("This seller is not ready to accept marketplace payments.");
  }
  if (new Set(rows.map((row) => row.currency)).size !== 1) throw new Error("All products in a checkout must use the same currency.");
  const authoritativeItems = rows.map((row) => ({ ...row, quantity: consolidated.get(row.id)! }));
  const totals = calculateServerTotals(authoritativeItems, seller.shippingCents, config.marketplaceFeeBps);
  return { items: authoritativeItems, seller, totals, currency: rows[0].currency };
}

export async function reserveCart(
  input: Awaited<ReturnType<typeof loadAuthoritativeCart>>,
  buyerUserId: string | null = null,
  policyVersion: string,
) {
  const d1 = getD1();
  const reservationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.checkoutExpirationMinutes * 60_000);
  const statements = [
    d1.prepare(`INSERT INTO checkout_reservations
      (id, seller_id, buyer_user_id, status, subtotal_cents, shipping_cents, platform_fee_cents, currency, policy_version, policy_accepted_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`)
      .bind(reservationId, input.seller.sellerId, buyerUserId, input.totals.subtotalCents, input.totals.shippingCents, input.totals.platformFeeCents, input.currency, policyVersion, expiresAt.toISOString()),
    d1.prepare(`UPDATE sellers SET
      default_shipping_cents = CASE WHEN status = 'active' THEN default_shipping_cents ELSE -1 END
      WHERE id = ?`).bind(input.seller.sellerId),
  ];
  for (const item of input.items) {
    statements.push(
      d1.prepare(`UPDATE products SET
        reserved_quantity = CASE WHEN status = 'active' THEN reserved_quantity + ? ELSE -1 END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(item.quantity, item.id),
      d1.prepare(`INSERT INTO checkout_reservation_items
        (id, reservation_id, product_id, product_title_snapshot, seller_sku_snapshot, scale_snapshot,
         manufacturer_snapshot, unit_price_cents, quantity, image_url_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), reservationId, item.id, item.title, item.sellerSku, item.scale, item.manufacturer, item.priceCents, item.quantity, item.imageUrl),
    );
  }
  try {
    await d1.batch(statements);
  } catch {
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
