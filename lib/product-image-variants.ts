import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";
import { imageSize } from "image-size";
import { PRODUCT_IMAGE_WIDTHS } from "./product-image-sources";

/** Derivatives are for display only; the original remains the inspection image. */
export function resizeListingImage(bytes: Uint8Array, width: number, mime: string) {
  if (!(PRODUCT_IMAGE_WIDTHS as readonly number[]).includes(width)) throw new Error("Unsupported image width");
  const dimensions = imageSize(bytes);
  if (bytes.length > 10 * 1024 * 1024 || !dimensions.width || !dimensions.height || dimensions.width > 4096 || dimensions.height > 4096 || dimensions.width * dimensions.height > 6_000_000) throw new Error("Unsupported image dimensions");
  if (dimensions.width <= width) return { bytes, mime };
  let original: PhotonImage | undefined;
  let resized: PhotonImage | undefined;
  try {
    original = PhotonImage.new_from_byteslice(bytes);
    resized = resize(original, width, Math.max(1, Math.round(dimensions.height * width / dimensions.width)), SamplingFilter.Lanczos3);
    return { bytes: resized.get_bytes_webp(), mime: "image/webp" };
  } finally {
    resized?.free();
    original?.free();
  }
}
