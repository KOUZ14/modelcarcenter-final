export const MAX_LISTING_IMAGES = 8;
export const MAX_LISTING_IMAGE_BYTES = 10 * 1024 * 1024;

export function detectListingImageType(
  bytes: Uint8Array,
  declaredMime: string,
) {
  if (
    declaredMime === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: "image/jpeg", extension: "jpg" } as const;
  }
  if (
    declaredMime === "image/png" &&
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return { mime: "image/png", extension: "png" } as const;
  }
  if (
    declaredMime === "image/webp" &&
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" } as const;
  }
  return null;
}

export function validateListingImageBatch(input: {
  currentCount: number;
  incomingSizes: number[];
}) {
  if (!input.incomingSizes.length) return "Choose at least one photo.";
  if (input.currentCount + input.incomingSizes.length > MAX_LISTING_IMAGES) {
    return `Listings support up to ${MAX_LISTING_IMAGES} photos.`;
  }
  if (
    input.incomingSizes.some(
      (size) => size < 1 || size > MAX_LISTING_IMAGE_BYTES,
    )
  ) {
    return "Each photo must be 10 MB or smaller.";
  }
  return null;
}
