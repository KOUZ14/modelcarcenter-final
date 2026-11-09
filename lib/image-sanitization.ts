import { imageSize } from "image-size";
import { PhotonImage } from "@cf-wasm/photon";
import { ValidationError } from "./validation";

export const MAX_IMAGE_PIXELS = 6_000_000;
export const MAX_IMAGE_EDGE = 4096;
const MAX_BYTES = 10 * 1024 * 1024;

export function sanitizeUploadedImage(bytes: Uint8Array, declaredMime: string, jpegOnly = false) {
  let image: PhotonImage | undefined;
  try {
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("size");
    const dimensions = imageSize(bytes);
    const mime = dimensions.type === "jpg" ? "image/jpeg" : `image/${dimensions.type}`;
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime) || mime !== declaredMime || (jpegOnly && mime !== "image/jpeg")) throw new Error("type");
    if (!dimensions.width || !dimensions.height || dimensions.width > MAX_IMAGE_EDGE || dimensions.height > MAX_IMAGE_EDGE || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      throw new ValidationError("Choose a photo up to 6 megapixels and 4096 pixels on each side. Resize it and try again.");
    }
    // Decode the actual pixels. A matching file signature is not sufficient.
    image = PhotonImage.new_from_byteslice(bytes);
    if (image.get_width() !== dimensions.width || image.get_height() !== dimensions.height) throw new Error("dimensions");
    const encoded = mime === "image/jpeg" ? image.get_bytes_jpeg(90) : mime === "image/png" ? image.get_bytes() : image.get_bytes_webp();
    if (!encoded.length || encoded.length > MAX_BYTES) throw new Error("encoded_size");
    // The freshly encoded image contains pixels, not source metadata/trailers.
    return { bytes: encoded, mime, extension: mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp" };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Choose a valid JPEG, PNG, or WebP photo up to 10 MB.");
  } finally { image?.free(); }
}
