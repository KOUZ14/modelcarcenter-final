import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { products, sellers } from "@/db/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
    if (!ids.length) return Response.json({ products: [] });
    const rows = await getDb().select({
      id: products.id, sellerId: products.sellerId, sellerSlug: sellers.slug, sellerName: sellers.storeName,
      slug: products.slug, sellerSku: products.sellerSku, title: products.title, description: products.description,
      scale: products.scale, modelManufacturer: products.modelManufacturer, vehicleMake: products.vehicleMake,
      vehicleModel: products.vehicleModel, vehicleYear: products.vehicleYear, color: products.color,
      condition: products.condition, priceCents: products.priceCents, currency: products.currency,
      inventoryQuantity: products.inventoryQuantity, reservedQuantity: products.reservedQuantity,
      primaryImageUrl: products.primaryImageUrl, keywords: products.keywords,
      defaultShippingCents: sellers.defaultShippingCents, createdAt: products.createdAt,
    }).from(products).innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(and(inArray(products.id, ids), eq(products.status, "active"), eq(sellers.status, "active")));
    return Response.json({ products: rows.map((row) => ({ ...row, availableQuantity: Math.max(0, row.inventoryQuantity - row.reservedQuantity) })).filter((row) => row.availableQuantity > 0) });
  } catch (error) { console.error(error); return Response.json({ error: "Saved items are temporarily unavailable." }, { status: 503 }); }
}
