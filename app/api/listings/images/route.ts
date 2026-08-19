import { and, asc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { productImages, products } from "@/db/schema";
import { requireProductOwner } from "@/lib/collector-auth";
import { routeError } from "@/lib/http";
import {
  detectListingImageType,
  validateListingImageBatch,
} from "@/lib/listing-images";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const productId = requiredString(form.get("productId"), "productId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    const files = form
      .getAll("images")
      .filter((value): value is File => value instanceof File);
    if (!files.length) throw new ValidationError("Choose at least one photo.");
    const countRows = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    const currentCount = Number(countRows[0]?.count ?? 0);
    const batchError = validateListingImageBatch({
      currentCount,
      incomingSizes: files.map((file) => file.size),
    });
    if (batchError) throw new ValidationError(batchError);
    if (!env.IMAGES) throw new Error("R2 image storage is unavailable.");
    const uploaded: Array<{
      id: string;
      url: string;
      key: string;
      alt: string;
      sortOrder: number;
    }> = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const bytes = await file.arrayBuffer();
        const type = detectListingImageType(new Uint8Array(bytes), file.type);
        if (!type)
          throw new ValidationError(
            "Photos must be valid JPEG, PNG, or WebP images.",
          );
        const id = crypto.randomUUID();
        const key = `listings/${owner.product.product.sellerId}/${productId}/${crypto.randomUUID()}.${type.extension}`;
        await env.IMAGES.put(key, bytes, {
          httpMetadata: {
            contentType: type.mime,
            cacheControl: "public, max-age=31536000, immutable",
          },
          customMetadata: { productId, uploadedBy: owner.collector.user.id },
        });
        uploaded.push({
          id,
          key,
          url: `/media/${key}`,
          alt: `${owner.product.product.title} collector listing photo ${currentCount + index + 1}`,
          sortOrder: currentCount + index,
        });
      }
      await getDb()
        .insert(productImages)
        .values(
          uploaded.map((image) => ({
            id: image.id,
            productId,
            url: image.url,
            source: "r2" as const,
            storageKey: image.key,
            uploadedByUserId: owner.collector.user.id,
            alt: image.alt,
            sortOrder: image.sortOrder,
            createdAt: new Date().toISOString(),
          })),
        );
      if (!owner.product.product.primaryImageUrl && uploaded[0]) {
        await getDb()
          .update(products)
          .set({
            primaryImageUrl: uploaded[0].url,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.sellerId, owner.product.product.sellerId),
            ),
          );
      }
      return Response.json(
        {
          ok: true,
          images: uploaded.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alt,
            sortOrder: image.sortOrder,
          })),
        },
        { status: 201 },
      );
    } catch (error) {
      if (uploaded.length)
        await env.IMAGES.delete(uploaded.map((image) => image.key)).catch(
          () => undefined,
        );
      throw error;
    }
  } catch (error) {
    return routeError(error, "The photos could not be uploaded.");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requiredString(body.productId, "productId", 100);
    const imageId = requiredString(body.imageId, "imageId", 100);
    const owner = await requireProductOwner(productId, request);
    if (owner instanceof Response) return owner;
    const rows = await getDb()
      .select()
      .from(productImages)
      .where(
        and(
          eq(productImages.id, imageId),
          eq(productImages.productId, productId),
        ),
      )
      .limit(1);
    const image = rows[0];
    if (!image) throw new ValidationError("Photo not found.");
    if (image.source === "r2" && image.storageKey)
      await env.IMAGES.delete(image.storageKey);
    await getDb()
      .delete(productImages)
      .where(
        and(
          eq(productImages.id, imageId),
          eq(productImages.productId, productId),
        ),
      );
    if (owner.product.product.primaryImageUrl === image.url) {
      const next = await getDb()
        .select({ url: productImages.url })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(asc(productImages.sortOrder))
        .limit(1);
      await getDb()
        .update(products)
        .set({
          primaryImageUrl: next[0]?.url ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(products.id, productId));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error, "The photo could not be removed.");
  }
}
