import { and, asc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { productImages, products } from "@/db/schema";
import {
  detectListingImageType,
  validateListingImageBatch,
} from "@/lib/listing-images";
import { ValidationError } from "@/lib/validation";

type Product = typeof products.$inferSelect;

export async function uploadProductImages(input: {
  product: Product;
  files: File[];
  uploadedByUserId?: string | null;
  makePrimary?: boolean;
}) {
  const countRows = await getDb()
    .select({
      count: sql<number>`count(*)`,
      minimumSortOrder: sql<number>`coalesce(min(${productImages.sortOrder}), 0)`,
    })
    .from(productImages)
    .where(eq(productImages.productId, input.product.id));
  const currentCount = Number(countRows[0]?.count ?? 0);
  const minimumSortOrder = Number(countRows[0]?.minimumSortOrder ?? 0);
  const batchError = validateListingImageBatch({
    currentCount,
    incomingSizes: input.files.map((file) => file.size),
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
  let metadataSaved = false;
  try {
    for (let index = 0; index < input.files.length; index += 1) {
      const file = input.files[index];
      const bytes = await file.arrayBuffer();
      const type = detectListingImageType(new Uint8Array(bytes), file.type);
      if (!type)
        throw new ValidationError(
          "Photos must be valid JPEG, PNG, or WebP images.",
        );
      const id = crypto.randomUUID();
      const key = `listings/${input.product.sellerId}/${input.product.id}/${crypto.randomUUID()}.${type.extension}`;
      await env.IMAGES.put(key, bytes, {
        httpMetadata: {
          contentType: type.mime,
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: {
          productId: input.product.id,
          uploadedBy: input.uploadedByUserId ?? "admin",
        },
      });
      uploaded.push({
        id,
        key,
        url: `/media/${key}`,
        alt: `${input.product.modelManufacturer} ${input.product.title} model car photo ${currentCount + index + 1}`,
        sortOrder: input.makePrimary
          ? minimumSortOrder - input.files.length + index
          : currentCount + index,
      });
    }

    await getDb()
      .insert(productImages)
      .values(
        uploaded.map((image) => ({
          id: image.id,
          productId: input.product.id,
          url: image.url,
          source: "r2" as const,
          storageKey: image.key,
          uploadedByUserId: input.uploadedByUserId ?? null,
          alt: image.alt,
          sortOrder: image.sortOrder,
          createdAt: new Date().toISOString(),
        })),
      );
    metadataSaved = true;
    if (uploaded[0] && (input.makePrimary || !input.product.primaryImageUrl)) {
      await getDb()
        .update(products)
        .set({
          primaryImageUrl: uploaded[0].url,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(products.id, input.product.id),
            eq(products.sellerId, input.product.sellerId),
          ),
        );
    }
    return uploaded.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      sortOrder: image.sortOrder,
    }));
  } catch (error) {
    if (uploaded.length && !metadataSaved)
      await env.IMAGES.delete(uploaded.map((image) => image.key)).catch(
        () => undefined,
      );
    throw error;
  }
}

export async function removeProductImage(input: {
  product: Product;
  imageId: string;
}) {
  const rows = await getDb()
    .select()
    .from(productImages)
    .where(
      and(
        eq(productImages.id, input.imageId),
        eq(productImages.productId, input.product.id),
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
        eq(productImages.id, input.imageId),
        eq(productImages.productId, input.product.id),
      ),
    );
  if (input.product.primaryImageUrl === image.url) {
    const next = await getDb()
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, input.product.id))
      .orderBy(asc(productImages.sortOrder))
      .limit(1);
    await getDb()
      .update(products)
      .set({
        primaryImageUrl: next[0]?.url ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(products.id, input.product.id),
          eq(products.sellerId, input.product.sellerId),
        ),
      );
  }
}
