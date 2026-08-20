import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { requireAdminApi } from "@/lib/admin-auth";
import { routeError } from "@/lib/http";
import {
  removeProductImage,
  uploadProductImages,
} from "@/lib/product-images";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function getProduct(productId: string) {
  const rows = await getDb()
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!rows[0]) throw new ValidationError("Product not found.");
  return rows[0];
}

export async function POST(request: Request) {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try {
    const form = await request.formData();
    const productId = requiredString(form.get("productId"), "productId", 100);
    const files = form
      .getAll("images")
      .filter((value): value is File => value instanceof File);
    if (!files.length) throw new ValidationError("Choose at least one photo.");
    const images = await uploadProductImages({
      product: await getProduct(productId),
      files,
      makePrimary: form.get("makePrimary") === "true",
    });
    return Response.json({ ok: true, images }, { status: 201 });
  } catch (error) {
    return routeError(error, "The photos could not be uploaded.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requiredString(body.productId, "productId", 100);
    const imageId = requiredString(body.imageId, "imageId", 100);
    await removeProductImage({ product: await getProduct(productId), imageId });
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error, "The photo could not be removed.");
  }
}
