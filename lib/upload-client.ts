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
    form.append("images", await prepareUploadPhoto(input.files[index]));
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

// Resize phone photos before upload. Server decoding and limits remain authoritative.
export async function prepareUploadPhoto(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Each photo must be 10 MB or smaller.");
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this photo.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("This photo could not be prepared.")), "image/jpeg", 0.9));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}
