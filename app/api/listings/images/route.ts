import { requireProductOwner } from "@/lib/collector-auth";
import { routeError } from "@/lib/http";
import {
  removeLegacyPrimaryProductImage,
  removeProductImage,
  reorderProductImages,
  uploadProductImages,
  labelProductImage,
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
      views: parsePhotoViews(form.get("photoViews"), files.length),
    });
    return Response.json({ ok: true, images }, { status: 201 });
  } catch (error) {
    return routeError(error, "The photos could not be uploaded.");
  }
}

function parsePhotoViews(value: FormDataEntryValue | null, count: number): string[][] {
  if (!value) return Array.from({ length: count }, () => []);
  let parsed: unknown;
  try { parsed = JSON.parse(String(value)); } catch { throw new ValidationError("Photo labels could not be read."); }
  if (!Array.isArray(parsed) || parsed.length !== count || parsed.some(item => !Array.isArray(item) || item.some(key => typeof key !== "string"))) throw new ValidationError("Choose the views shown in each photo.");
  return parsed;
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const productId = requiredString(body.productId, "productId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    if (owner.product.sellerStatus === "suspended") throw new ValidationError("This seller is suspended and cannot change photos.");
    if (!Array.isArray(body.views) || body.views.some(view => typeof view !== "string")) throw new ValidationError("Choose photo views.");
    const image = await labelProductImage({ product: owner.product.product, imageId: requiredString(body.imageId, "imageId", 100), views: body.views });
    return Response.json({ ok: true, image });
  } catch (error) { return routeError(error, "The photo labels could not be saved."); }
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
