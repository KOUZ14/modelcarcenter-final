import { requireProductOwner } from "@/lib/collector-auth";
import { routeError } from "@/lib/http";
import {
  removeLegacyPrimaryProductImage,
  removeProductImage,
  reorderProductImages,
  uploadProductImages,
} from "@/lib/product-images";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const productId = requiredString(form.get("productId"), "productId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    if (owner.product.sellerStatus === "suspended")
      throw new ValidationError(
        "This seller is suspended and cannot change photos.",
      );
    const files = form
      .getAll("images")
      .filter((value): value is File => value instanceof File);
    if (!files.length) throw new ValidationError("Choose at least one photo.");
    const images = await uploadProductImages({
      product: owner.product.product,
      files,
      uploadedByUserId: owner.collector.user.id,
      makePrimary: form.get("makePrimary") === "true",
    });
    return Response.json({ ok: true, images }, { status: 201 });
  } catch (error) {
    return routeError(error, "The photos could not be uploaded.");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requiredString(body.productId, "productId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    if (owner.product.sellerStatus === "suspended")
      throw new ValidationError(
        "This seller is suspended and cannot change photos.",
      );
    if (body.removeLegacyPrimary === true) {
      await removeLegacyPrimaryProductImage({ product: owner.product.product });
    } else {
      await removeProductImage({
        product: owner.product.product,
        imageId: requiredString(body.imageId, "imageId", 100),
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error, "The photo could not be removed.");
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requiredString(body.productId, "productId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    if (owner.product.sellerStatus === "suspended")
      throw new ValidationError(
        "This seller is suspended and cannot change photos.",
      );
    if (!Array.isArray(body.imageIds)) {
      throw new ValidationError("Photo order must be a list.");
    }
    const imageIds = body.imageIds.map((id) =>
      requiredString(id, "imageId", 100),
    );
    const images = await reorderProductImages({
      product: owner.product.product,
      imageIds,
    });
    return Response.json({ ok: true, images });
  } catch (error) {
    return routeError(error, "The photo order could not be saved.");
  }
}
