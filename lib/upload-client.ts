import { getSelectedPhotoViews } from "./listing-evidence";

export type UploadedProductImage = {
  id: string;
  url: string;
  alt: string;
  sortOrder?: number;
};

async function readApiResponse<T extends object>(
  response: Response,
  fallback: string,
): Promise<T & { error?: string }> {
  const text = await response.text();
  if (text) {
    try {
      return JSON.parse(text) as T & { error?: string };
    } catch {
      // Infrastructure errors such as Vinext's 413 response are plain text.
    }
  }
  const plainText = text.trim();
  const error =
    response.status === 413
      ? "This photo is too large. Each photo must be 10 MB or smaller."
      : plainText && !plainText.startsWith("<")
        ? plainText.slice(0, 300)
        : fallback;
  return { error } as T & { error?: string };
}

export async function uploadProductPhotoFiles(input: {
  endpoint: string;
  productId: string;
  files: File[];
  makePrimary?: boolean;
  onUploaded?(images: UploadedProductImage[], processedCount: number): void;
}) {
  const uploaded: UploadedProductImage[] = [];
  for (let index = 0; index < input.files.length; index += 1) {
    const form = new FormData();
    form.set("productId", input.productId);
    if (input.makePrimary && index === 0) form.set("makePrimary", "true");
    form.append("images", input.files[index]);
    form.set("photoViews", JSON.stringify([getSelectedPhotoViews(input.files[index])]));
    const response = await fetch(input.endpoint, { method: "POST", body: form });
    const body = await readApiResponse<{
      images?: UploadedProductImage[];
    }>(response, "The photo could not be uploaded.");
    if (!response.ok)
      throw new Error(body.error || "The photo could not be uploaded.");
    const images = body.images ?? [];
    if (!images.length) throw new Error("The photo upload returned no image.");
    uploaded.push(...images);
    input.onUploaded?.(images, index + 1);
  }
  return uploaded;
}
