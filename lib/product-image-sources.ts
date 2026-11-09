export const PRODUCT_IMAGE_WIDTHS = [192, 640, 960, 1440] as const;

export function productImageSources(url: string, thumbnail = false) {
  // Uploaded listing photos only. External URLs and unsaved blob previews retain
  // their original source; the media route never fetches arbitrary URLs.
  if (!url.startsWith("/media/listings/") || url.includes("?")) return { src: url };
  const variant = (width: number) => `${url}?w=${width}`;
  return thumbnail
    ? { src: variant(192) }
    : {
      src: variant(960),
      srcSet: PRODUCT_IMAGE_WIDTHS.map(width => `${variant(width)} ${width}w`).join(", "),
      sizes: "(max-width: 600px) calc(100vw - 40px), (max-width: 1000px) 560px, (max-width: 1500px) 55vw, 800px",
    };
}
