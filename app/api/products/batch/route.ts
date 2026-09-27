import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { products, sellers } from "@/db/schema";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids
          .filter((id): id is string => typeof id === "string")
          .slice(0, 100)
      : [];
    if (!ids.length) return Response.json({ products: [] });
    const rows = await getDb()
      .select({
        id: products.id,
        sellerId: products.sellerId,
        sellerSlug: sellers.slug,
        sellerName: sellers.storeName,
        sellerType: sellers.sellerType,
        slug: products.slug,
        sellerSku: products.sellerSku,
        title: products.title,
        description: products.description,
        scale: products.scale,
        modelManufacturer: products.modelManufacturer,
        vehicleMake: products.vehicleMake,
        vehicleModel: products.vehicleModel,
        vehicleYear: products.vehicleYear,
        color: products.color,
        condition: products.condition,
        modelCondition: products.modelCondition,
        packagingCondition: products.packagingCondition,
        originalBoxStatus: products.originalBoxStatus,
        missingParts: products.missingParts,
        defects: products.defects,
        restorationCustomization: products.restorationCustomization,
        material: products.material,
        productNumber: products.productNumber,
        editionSerial: products.editionSerial,
        coaStatus: products.coaStatus,
        accessories: products.accessories,
        provenance: products.provenance,
        photoFrontChecked: products.photoFrontChecked,
        photoRearChecked: products.photoRearChecked,
        photoSidesChecked: products.photoSidesChecked,
        photoBaseChecked: products.photoBaseChecked,
        photoPackagingChecked: products.photoPackagingChecked,
        photoIssuesChecked: products.photoIssuesChecked,
        priceCents: products.priceCents,
        currency: products.currency,
        inventoryQuantity: products.inventoryQuantity,
        reservedQuantity: products.reservedQuantity,
        availabilityType: products.availabilityType,
        releaseDate: products.releaseDate,
        primaryImageUrl: products.primaryImageUrl,
        keywords: products.keywords,
        defaultShippingCents: sellers.defaultShippingCents,
        shippingMode: sellers.shippingMode,
        handlingTimeBusinessDays: sellers.handlingTimeBusinessDays,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(sellers, eq(products.sellerId, sellers.id))
      .where(
        and(
          inArray(products.id, ids),
          inArray(products.status, ["active", "sold_out"]),
          eq(sellers.status, "active"),
        ),
      );
    return Response.json({
      products: rows.map((row) => ({
          ...row,
          availableQuantity: Math.max(
            0,
            row.inventoryQuantity - row.reservedQuantity,
          ),
        })),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Saved items are temporarily unavailable." },
      { status: 503 },
    );
  }
}
